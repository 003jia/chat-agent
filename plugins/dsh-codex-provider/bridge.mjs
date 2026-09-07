#!/usr/bin/env node
/**
 * dsh-codex-provider 桥接 — 把本机 Codex CLI 包装成 OpenAI 兼容接口。
 *
 * 关键质量策略（CLEAN_MODE，默认开启）：codex exec 本质是一个 agent，自带
 * "我是编码助手"人设、工具框架、大量上下文注入。直接当模型用会"agent 套 agent"，
 * 输出走样。本桥接通过 config 覆盖把 agent 框架剥到最薄：
 *   --ignore-user-config --ignore-rules          剥掉用户的 skills/mcp/plugins/project doc
 *   model_instructions_file=<临时指令文件>        把"直答指令 + DSH 系统提示"作为正式指令注入，
 *                                                 覆盖 Codex 的编码人格（这是保真度最大的一招）
 *   include_*_instructions=false                  去掉 permissions/apps/collaboration/environment 上下文
 *   project_doc_max_bytes=0                        不注入项目文档
 * 设 CODEX_BRIDGE_CLEAN_MODE=0 可关闭（退回到原始 codex exec 行为）。
 *
 * 接口：
 *   GET  /health                  健康检查
 *   GET  /v1/models               可用模型列表
 *   POST /v1/chat/completions     OpenAI 兼容对话补全（支持 stream SSE）
 *
 * 环境变量（均可选）：
 *   CODEX_BRIDGE_HOST              监听地址，默认 127.0.0.1
 *   CODEX_BRIDGE_PORT              监听端口，默认 8899
 *   CODEX_BRIDGE_BINARY            Codex 可执行文件路径，默认自动探测
 *   CODEX_BRIDGE_MODEL             默认模型，默认读 ~/.codex/config.toml
 *   CODEX_BRIDGE_WORKDIR           Codex 工作目录，默认当前目录
 *   CODEX_BRIDGE_SANDBOX           沙箱 read-only|workspace-write|danger-full-access，默认 read-only
 *   CODEX_BRIDGE_REASONING_EFFORT  请求未指定时的默认推理强度 low|medium|high，默认 low
 *   CODEX_BRIDGE_MAX_CONCURRENT    同时运行的 Codex 任务上限，默认 2
 *   CODEX_BRIDGE_TOKEN             可选：要求请求携带 Bearer 令牌
 *   CODEX_BRIDGE_TIMEOUT_MS        Codex 任务超时，默认 300000
 *   CODEX_BRIDGE_PARENT_PID        设置后监控父进程：父进程消失则本进程退出（防孤儿）
 *   CODEX_BRIDGE_CLEAN_MODE        1=开启 agent 框架剥离（默认）；0=关闭
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const HOST = process.env.CODEX_BRIDGE_HOST || "127.0.0.1";
const PORT = Number(process.env.CODEX_BRIDGE_PORT || 8899);
const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), ".codex");
const BINARY = process.env.CODEX_BRIDGE_BINARY || detectCodexBinary();
const DEFAULT_MODEL = process.env.CODEX_BRIDGE_MODEL || readDefaultModel() || "gpt-5.6-sol";
const WORKDIR = process.env.CODEX_BRIDGE_WORKDIR || process.cwd();
const SANDBOX = process.env.CODEX_BRIDGE_SANDBOX || "read-only";
const DEFAULT_REASONING = process.env.CODEX_BRIDGE_REASONING_EFFORT ?? "low";
const MAX_CONCURRENT = Math.max(1, Number(process.env.CODEX_BRIDGE_MAX_CONCURRENT || 2));
const BRIDGE_TOKEN = process.env.CODEX_BRIDGE_TOKEN || "";
const TIMEOUT_MS = Number(process.env.CODEX_BRIDGE_TIMEOUT_MS || 300000);
const PARENT_PID = process.env.CODEX_BRIDGE_PARENT_PID ? Number(process.env.CODEX_BRIDGE_PARENT_PID) : 0;
const CLEAN_MODE = (process.env.CODEX_BRIDGE_CLEAN_MODE ?? "1") !== "0";

const SANDBOX_MODES = new Set(["read-only", "workspace-write", "danger-full-access"]);
const KNOWN_MODEL_ALIASES = { "gpt-5.6": "gpt-5.6-sol", "gpt5.6": "gpt-5.6-sol" };

// DSH/pi-ai 推理档位 → Codex 的 model_reasoning_effort；off/未声明 → 不发送。
const REASONING_MAP = {
  off: null,
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max"
};

// CLEAN_MODE 注入的基础指令：把 Codex 的编码人格压成"直答助手"。
const BASE_INSTRUCTIONS = `You are a direct, capable assistant embedded in a host agent harness. Follow the user's latest request exactly.

- Answer the content directly. No preamble such as "Sure", "Certainly", or "I'll help with that".
- Do not claim to be Codex or a coding-only agent, and do not narrate tool/sandbox/process details unless asked.
- Reply in the user's language. Be accurate, complete, and appropriately concise.
- When the host system provides additional instructions below, treat them as your operating guidance.`;

// ---------- 父进程守护（防孤儿） ----------

if (PARENT_PID) {
  const monitor = setInterval(() => {
    if (process.ppid !== PARENT_PID) {
      clearInterval(monitor);
      process.exit(0);
    }
  }, 3000);
  monitor.unref?.();
}

// ---------- 探测 / 读取 ----------

function detectCodexBinary() {
  for (const candidate of [
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    "/usr/local/bin/codex",
    "/opt/homebrew/bin/codex",
    join(homedir(), ".local/bin/codex")
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return "codex";
}

function readDefaultModel() {
  try {
    const configPath = join(CODEX_HOME, "config.toml");
    if (!existsSync(configPath)) return "";
    const match = readFileSync(configPath, "utf8").match(/^model\s*=\s*"([^"]+)"/m);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function readCachedModels() {
  try {
    const cachePath = join(CODEX_HOME, "models_cache.json");
    if (!existsSync(cachePath)) return [];
    const payload = JSON.parse(readFileSync(cachePath, "utf8"));
    return (Array.isArray(payload?.models) ? payload.models : [])
      .map((model) => String(model?.slug || "").trim())
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

const FALLBACK_MODELS = ["gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-sol-wm", "gpt-5.6-terra", "gpt-5.5", "gpt-5.4"];

function resolveModel(requested) {
  const raw = String(requested || "").trim() || DEFAULT_MODEL;
  return KNOWN_MODEL_ALIASES[raw] || raw;
}

function resolveReasoning(body) {
  const raw =
    body?.reasoning_effort ||
    body?.reasoning?.effort ||
    body?.reasoning ||
    (typeof body?.reasoning_effort === "object" ? body?.reasoning_effort?.effort : null);
  if (typeof raw === "string" && raw.trim()) {
    return REASONING_MAP[raw.trim().toLowerCase()] ?? null;
  }
  return DEFAULT_REASONING ? REASONING_MAP[DEFAULT_REASONING.toLowerCase()] ?? null : null;
}

// ---------- 指令 / 对话组装 ----------

function stringifyContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || part?.content || ""))
      .filter(Boolean)
      .join("\n");
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

/** 把 system 消息抽出来，作为 Codex 的正式指令（CLEAN_MODE 下写入 instructions 文件）。 */
function buildInstructions(messages) {
  const system = (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === "system")
    .map((message) => stringifyContent(message.content || ""))
    .filter(Boolean)
    .join("\n\n");
  return system ? `${BASE_INSTRUCTIONS}\n\n# Additional instructions from the host system\n${system}` : BASE_INSTRUCTIONS;
}

/** 只保留 user/assistant 轮次作为对话 prompt。 */
function buildConversation(messages) {
  const parts = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role === "system") continue;
    const content = stringifyContent(message.content || "");
    if (!content.trim()) continue;
    parts.push(message?.role === "assistant" ? `<助手>：\n${content}` : `<用户>：\n${content}`);
  }
  const prompt = parts.join("\n\n");
  if (!prompt.trim()) throw httpError(400, "INVALID_MESSAGES", "messages 不能为空。");
  return prompt;
}

// ---------- 并发控制 ----------

let activeTasks = 0;
const waitingQueue = [];

function withSlot(task) {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeTasks += 1;
      Promise.resolve()
        .then(task)
        .finally(() => {
          activeTasks -= 1;
          const next = waitingQueue.shift();
          if (next) next();
        })
        .then(resolve, reject);
    };
    if (activeTasks < MAX_CONCURRENT) run();
    else waitingQueue.push(run);
  });
}

// ---------- Codex 调用 ----------

function runCodex({ model, prompt, reasoning, instructions, onEvent, signal }) {
  return new Promise((resolve, reject) => {
    if (!SANDBOX_MODES.has(SANDBOX)) {
      reject(httpError(500, "BAD_SANDBOX", `不支持的沙箱级别：${SANDBOX}`));
      return;
    }

    // CLEAN_MODE：把指令写进临时文件，由 codex 作为正式 instructions 加载
    let instrDir = null;
    let instrPath = null;
    if (CLEAN_MODE) {
      instrDir = mkdtempSync(join(tmpdir(), "codex-instr-"));
      instrPath = join(instrDir, "instructions.md");
      writeFileSync(instrPath, instructions, "utf8");
    }

    const args = ["exec", "--json", "--ephemeral", "--skip-git-repo-check", "-s", SANDBOX, "-m", model, "-C", WORKDIR];
    // 注意：codex 0.148 的 exec 非交互模式下，workspace-write 沙箱内写入自动放行，
    // 不要加 --approve-for-me（该 flag 在 exec 子命令非法，会导致 usage 错误）。
    if (reasoning) args.push("-c", `model_reasoning_effort="${reasoning}"`);
    if (CLEAN_MODE) {
      args.push(
        "--ignore-user-config",
        "--ignore-rules",
        "-c", `model_instructions_file="${instrPath}"`,
        "-c", "include_permissions_instructions=false",
        "-c", "include_apps_instructions=false",
        "-c", "include_collaboration_mode_instructions=false",
        "-c", "include_environment_context=false",
        "-c", "project_doc_max_bytes=0"
      );
    }
    args.push(prompt);

    let stdoutBuffer = "";
    let stderrTail = "";
    let settled = false;
    const events = [];

    const child = spawn(BINARY, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (instrDir) {
        try { rmSync(instrDir, { recursive: true, force: true }); } catch { /* 忽略清理失败 */ }
      }
      if (error) reject(error);
      else resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(httpError(504, "CODEX_TIMEOUT", `Codex 任务超过 ${TIMEOUT_MS / 1000}s 未完成，已终止。`));
    }, TIMEOUT_MS);

    const onAbort = () => {
      child.kill("SIGKILL");
      finish(httpError(499, "CANCELLED", "请求已取消。"));
    };
    if (signal) {
      if (signal.aborted) {
        finish(httpError(499, "CANCELLED", "请求已取消。"));
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk;
      let newlineIndex;
      while ((newlineIndex = stdoutBuffer.indexOf("\n")) !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (!line) continue;
        try {
          const event = JSON.parse(line);
          events.push(event);
          onEvent?.(event);
        } catch {
          /* 非 JSON 行（警告等）忽略 */
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderrTail = (stderrTail + chunk).slice(-2048);
    });

    child.on("error", (error) => {
      finish(httpError(500, "CODEX_NOT_FOUND", `无法启动 Codex（${BINARY}）：${error.message}。请设置 CODEX_BRIDGE_BINARY。`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        finish(null, { text: collectAgentText(events), usage: lastUsage(events) });
      } else {
        const detail = stderrTail.trim() || `退出码 ${code}`;
        finish(httpError(502, "CODEX_FAILED", `Codex 执行失败：${detail.slice(-800)}`));
      }
    });
  });
}

function collectAgentText(events) {
  const parts = [];
  for (const event of events) {
    const item = event?.item;
    if (event?.type === "item.completed" && item?.type === "agent_message" && typeof item.text === "string") {
      parts.push(item.text);
    }
  }
  return parts.join("\n").trim();
}

function lastUsage(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const usage = events[index]?.usage;
    if (events[index]?.type === "turn.completed" && usage) return usage;
  }
  return null;
}

// ---------- HTTP ----------

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function sendError(response, error) {
  sendJson(response, error?.status || 500, {
    error: { message: error?.message || "内部错误", type: "codex_bridge_error", code: error?.code || "INTERNAL_ERROR" }
  });
}

function checkAuth(request) {
  if (!BRIDGE_TOKEN) return;
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== BRIDGE_TOKEN) {
    throw httpError(401, "UNAUTHORIZED", "无效的访问令牌。");
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(httpError(413, "BODY_TOO_LARGE", "请求体过大。"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(httpError(400, "INVALID_JSON", "请求体不是合法的 JSON。"));
      }
    });
    request.on("error", reject);
  });
}

async function handleChatCompletions(request, response) {
  const body = await readJsonBody(request);
  const model = resolveModel(body.model);
  const reasoning = resolveReasoning(body);
  const instructions = buildInstructions(body.messages);
  const prompt = buildConversation(body.messages);
  const wantStream = Boolean(body.stream);
  const id = `chatcmpl-codex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const created = Math.floor(Date.now() / 1000);

  if (!wantStream) {
    const { text, usage } = await withSlot(() => runCodex({ model, prompt, reasoning, instructions }));
    if (!text) throw httpError(502, "EMPTY_RESPONSE", "Codex 没有返回任何内容。");
    sendJson(response, 200, {
      id,
      object: "chat.completion",
      created,
      model,
      choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: Number(usage?.input_tokens || 0),
        completion_tokens: Number(usage?.output_tokens || 0),
        total_tokens: Number(usage?.input_tokens || 0) + Number(usage?.output_tokens || 0)
      }
    });
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no"
  });

  let closed = false;
  const sendSse = (payload) => {
    if (closed) return;
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const sendDelta = (content) =>
    sendSse({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta: { content }, finish_reason: null }]
    });

  sendSse({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }]
  });

  const controller = new AbortController();
  request.on("close", () => {
    closed = true;
    controller.abort();
  });

  try {
    await withSlot(() =>
      runCodex({
        model,
        prompt,
        reasoning,
        instructions,
        signal: controller.signal,
        onEvent: (event) => {
          const item = event?.item;
          if (event?.type === "item.completed" && item?.type === "agent_message" && typeof item.text === "string") {
            const text = item.text;
            for (let index = 0; index < text.length; index += 80) sendDelta(text.slice(index, index + 80));
          }
        }
      })
    );
  } catch (error) {
    if (!closed) {
      sendSse({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        error: { message: error.message, code: error.code || "CODEX_FAILED" }
      });
    }
    closed = true;
    response.end();
    return;
  }

  sendSse({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
  sendSse({ id, object: "chat.completion.chunk", created, model, choices: [] });
  response.write("data: [DONE]\n\n");
  closed = true;
  response.end();
}

function handleModels(response) {
  const models = [...new Set([DEFAULT_MODEL, ...readCachedModels(), ...FALLBACK_MODELS, ...Object.values(KNOWN_MODEL_ALIASES)])].sort();
  sendJson(response, 200, {
    object: "list",
    data: models.map((id) => ({ id, object: "model", created: 0, owned_by: "codex" }))
  });
}

function handleHealth(response) {
  sendJson(response, 200, {
    ok: true,
    codexBinary: BINARY,
    codexExists: existsSync(BINARY),
    defaultModel: DEFAULT_MODEL,
    workdir: WORKDIR,
    sandbox: SANDBOX,
    cleanMode: CLEAN_MODE,
    defaultReasoning: DEFAULT_REASONING || "（沿用 config.toml）",
    maxConcurrent: MAX_CONCURRENT,
    models: [...new Set([DEFAULT_MODEL, ...readCachedModels(), ...FALLBACK_MODELS])].sort()
  });
}

const server = createServer(async (request, response) => {
  try {
    checkAuth(request);
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization"
      });
      response.end();
      return;
    }
    if (path === "/health") return handleHealth(response);
    if (path === "/v1/models") return handleModels(response);
    if (path === "/v1/chat/completions" && request.method === "POST") return await handleChatCompletions(request, response);
    if (path === "/") {
      sendJson(response, 200, { name: "dsh-codex-bridge", cleanMode: CLEAN_MODE, endpoints: ["/health", "/v1/models", "/v1/chat/completions"], defaultModel: DEFAULT_MODEL });
      return;
    }
    sendJson(response, 404, { error: { message: "Not Found", type: "codex_bridge_error", code: "NOT_FOUND" } });
  } catch (error) {
    sendError(response, error);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[dsh-codex-bridge] 已启动：http://${HOST}:${PORT}`);
  console.log(`[dsh-codex-bridge] Codex 二进制：${BINARY}`);
  console.log(`[dsh-codex-bridge] 默认模型：${DEFAULT_MODEL}（沙箱：${SANDBOX}，cleanMode：${CLEAN_MODE ? "on" : "off"}）`);
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
