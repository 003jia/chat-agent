#!/usr/bin/env node
/**
 * Codex Bridge — 把本机 Codex CLI 包装成 OpenAI 兼容的 HTTP 接口。
 *
 * 让 Memory Agent Workbench（以及任何 OpenAI 兼容客户端）通过 Codex 账号
 * 直接调用 GPT-5.6 系列模型（如 gpt-5.6-sol），无需单独申请 API Key。
 *
 * 接口：
 *   GET  /health            健康检查（Codex 二进制、模型、认证状态）
 *   GET  /v1/models         可用模型列表（来自 ~/.codex/models_cache.json）
 *   POST /v1/chat/completions   OpenAI 兼容对话补全（支持 stream: true SSE）
 *
 * 环境变量（均可选）：
 *   CODEX_BRIDGE_HOST              监听地址，默认 127.0.0.1
 *   CODEX_BRIDGE_PORT              监听端口，默认 8899
 *   CODEX_BRIDGE_BINARY            Codex 可执行文件路径，默认自动探测
 *   CODEX_BRIDGE_MODEL             默认模型，默认读 ~/.codex/config.toml
 *   CODEX_BRIDGE_WORKDIR           Codex 工作目录，默认当前目录
 *   CODEX_BRIDGE_SANDBOX           沙箱级别 read-only|workspace-write|danger-full-access，默认 read-only
 *   CODEX_BRIDGE_REASONING_EFFORT  推理强度 low|medium|high，默认 low（聊天更快的响应）
 *   CODEX_BRIDGE_MAX_CONCURRENT    同时运行的 Codex 任务数上限，默认 2
 *   CODEX_BRIDGE_TOKEN             可选：要求请求携带 Bearer 令牌
 *   CODEX_BRIDGE_TIMEOUT_MS        Codex 任务超时，默认 300000
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOST = process.env.CODEX_BRIDGE_HOST || "127.0.0.1";
const PORT = Number(process.env.CODEX_BRIDGE_PORT || 8899);
const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), ".codex");
const BINARY = process.env.CODEX_BRIDGE_BINARY || detectCodexBinary();
const DEFAULT_MODEL = process.env.CODEX_BRIDGE_MODEL || readDefaultModel() || "gpt-5.6-sol";
const WORKDIR = process.env.CODEX_BRIDGE_WORKDIR || process.cwd();
const SANDBOX = process.env.CODEX_BRIDGE_SANDBOX || "read-only";
const REASONING_EFFORT = process.env.CODEX_BRIDGE_REASONING_EFFORT ?? "low";
const MAX_CONCURRENT = Math.max(1, Number(process.env.CODEX_BRIDGE_MAX_CONCURRENT || 2));
const BRIDGE_TOKEN = process.env.CODEX_BRIDGE_TOKEN || "";
const TIMEOUT_MS = Number(process.env.CODEX_BRIDGE_TIMEOUT_MS || 300000);

const SANDBOX_MODES = new Set(["read-only", "workspace-write", "danger-full-access"]);
const KNOWN_MODEL_ALIASES = {
  "gpt-5.6": "gpt-5.6-sol",
  "gpt5.6": "gpt-5.6-sol"
};

// ---------- 探测 / 读取 ----------

function detectCodexBinary() {
  const candidates = [
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    "/usr/local/bin/codex",
    "/opt/homebrew/bin/codex",
    join(homedir(), ".local/bin/codex")
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return "codex"; // 最后回退到 PATH
}

function readDefaultModel() {
  try {
    const configPath = join(CODEX_HOME, "config.toml");
    if (!existsSync(configPath)) return "";
    const toml = readFileSync(configPath, "utf8");
    const match = toml.match(/^model\s*=\s*"([^"]+)"/m);
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
    const models = Array.isArray(payload?.models) ? payload.models : [];
    return models
      .map((model) => String(model?.slug || "").trim())
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

const FALLBACK_MODELS = [
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-sol-wm",
  "gpt-5.6-terra",
  "gpt-5.5",
  "gpt-5.4"
];

function resolveModel(requested) {
  const raw = String(requested || "").trim() || DEFAULT_MODEL;
  return KNOWN_MODEL_ALIASES[raw] || raw;
}

// ---------- Prompt 组装 ----------

function stringifyContent(content) {
  if (typeof content === "string") return content;
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function buildPrompt(messages) {
  const parts = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    const content = stringifyContent(message?.content || "");
    if (!content.trim()) continue;
    if (message?.role === "system") {
      parts.push(`系统指令：\n${content}`);
    } else if (message?.role === "assistant") {
      parts.push(`<助手>：\n${content}`);
    } else {
      parts.push(`<用户>：\n${content}`);
    }
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
    if (activeTasks < MAX_CONCURRENT) {
      run();
    } else {
      waitingQueue.push(run);
    }
  });
}

// ---------- Codex 调用 ----------

/**
 * 运行一次 codex exec，逐条回调 JSONL 事件。
 * @param {object} options { model, prompt, onEvent, signal }
 * @returns {Promise<{text: string, usage: object}>}
 */
function runCodex({ model, prompt, onEvent, signal }) {
  return new Promise((resolve, reject) => {
    const args = [
      "exec",
      "--json",
      "--ephemeral",
      "--skip-git-repo-check",
      "-s",
      SANDBOX,
      "-m",
      model,
      "-C",
      WORKDIR
    ];
    if (!SANDBOX_MODES.has(SANDBOX)) {
      reject(httpError(500, "BAD_SANDBOX", `不支持的沙箱级别：${SANDBOX}`));
      return;
    }
    if (SANDBOX !== "read-only") args.push("--approve-for-me");
    if (REASONING_EFFORT) {
      args.push("-c", `model_reasoning_effort="${REASONING_EFFORT}"`);
    }
    args.push(prompt);

    let stdoutBuffer = "";
    let stderrTail = "";
    let settled = false;
    const events = [];

    const child = spawn(BINARY, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env }
    });

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
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
          // 非 JSON 行（警告等）直接忽略
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderrTail = (stderrTail + chunk).slice(-2048);
    });

    child.on("error", (error) => {
      finish(
        httpError(
          500,
          "CODEX_NOT_FOUND",
          `无法启动 Codex（${BINARY}）：${error.message}。请检查是否安装了 Codex，或设置 CODEX_BRIDGE_BINARY。`
        )
      );
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
  const status = error?.status || 500;
  const code = error?.code || "INTERNAL_ERROR";
  sendJson(response, status, {
    error: { message: error?.message || "内部错误", type: "codex_bridge_error", code }
  });
}

function checkAuth(request) {
  if (!BRIDGE_TOKEN) return;
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== BRIDGE_TOKEN) {
    throw httpError(401, "UNAUTHORIZED", "无效的访问令牌。请设置相同的 CODEX_BRIDGE_TOKEN 与供应商 apiKey。");
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
        return;
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
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const prompt = buildPrompt(messages);
  const wantStream = Boolean(body.stream);
  const id = `chatcmpl-codex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const created = Math.floor(Date.now() / 1000);

  if (!wantStream) {
    const { text, usage } = await withSlot(() =>
      runCodex({ model, prompt })
    );
    if (!text) {
      throw httpError(502, "EMPTY_RESPONSE", "Codex 没有返回任何内容。");
    }
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

  // 流式：先回响应头，再跑 Codex，事件逐条转成 SSE
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

  const sendDelta = (content) => {
    sendSse({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta: { content }, finish_reason: null }]
    });
  };

  sendSse({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }]
  });

  // 客户端断开（如用户停止生成）时：终止 Codex 任务并停止写流
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
        signal: controller.signal,
        onEvent: (event) => {
          const item = event?.item;
          if (event?.type === "item.completed" && item?.type === "agent_message" && typeof item.text === "string") {
            // 拆成小片，让前端渐进渲染
            const text = item.text;
            for (let index = 0; index < text.length; index += 80) {
              sendDelta(text.slice(index, index + 80));
            }
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

  sendSse({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
  });
  sendSse({ id, object: "chat.completion.chunk", created, model, choices: [] });
  response.write("data: [DONE]\n\n");
  closed = true;
  response.end();
}

function handleModels(response) {
  const cached = readCachedModels();
  const models = [...new Set([DEFAULT_MODEL, ...cached, ...FALLBACK_MODELS, ...Object.values(KNOWN_MODEL_ALIASES)])].sort();
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
    reasoningEffort: REASONING_EFFORT || "（沿用 config.toml）",
    maxConcurrent: MAX_CONCURRENT,
    models: [...new Set([DEFAULT_MODEL, ...readCachedModels(), ...FALLBACK_MODELS])].sort()
  });
}

// ---------- 启动 ----------

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

    if (path === "/health" && request.method === "GET") {
      handleHealth(response);
      return;
    }
    if (path === "/v1/models" && request.method === "GET") {
      handleModels(response);
      return;
    }
    if (path === "/v1/chat/completions" && request.method === "POST") {
      await handleChatCompletions(request, response);
      return;
    }
    if (path === "/") {
      sendJson(response, 200, {
        name: "codex-bridge",
        version: "1.0.0",
        endpoints: ["/health", "/v1/models", "/v1/chat/completions"],
        defaultModel: DEFAULT_MODEL,
        hint: "在 Memory Agent Workbench 中把供应商 baseURL 设为 http://127.0.0.1:8899/v1"
      });
      return;
    }
    sendJson(response, 404, { error: { message: "Not Found", type: "codex_bridge_error", code: "NOT_FOUND" } });
  } catch (error) {
    sendError(response, error);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[codex-bridge] 已启动：http://${HOST}:${PORT}`);
  console.log(`[codex-bridge] Codex 二进制：${BINARY}`);
  console.log(`[codex-bridge] 默认模型：${DEFAULT_MODEL}（工作目录：${WORKDIR}，沙箱：${SANDBOX}）`);
  console.log(`[codex-bridge] 在 Memory Agent Workbench 中把供应商 baseURL 设为 http://${HOST}:${PORT}/v1`);
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
