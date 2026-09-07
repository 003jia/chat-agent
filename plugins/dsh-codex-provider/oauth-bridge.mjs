/**
 * oauth-bridge.mjs — OAuth 版 Codex 桥接（GPT 会员登录态，token 级模型端点）
 *
 * 与 bridge.mjs（codex exec 版）同一 OpenAI 兼容契约：
 *   GET  /health               健康检查
 *   GET  /v1/models            模型列表
 *   POST /v1/chat/completions  聊天补全（SSE/JSON，支持 tools → 原生工具调用）
 *
 * 后端 = pi-ai 的 openai-codex provider：
 *   - 凭据：~/.pi-ai/auth.json（pi-ai login openai-codex 生成，或手动预置）
 *   - 传输：直连 https://chatgpt.com/backend-api（走 ChatGPT 会员订阅，非 API 计费）
 *   - 必须带代理 env 运行：HTTPS_PROXY=... NODE_OPTIONS=--use-env-proxy
 *     （区域封锁下直连不通，代理出口才可达）
 *
 * 环境变量：
 *   CODEX_BRIDGE_PORT        端口（默认 8899）
 *   CODEX_BRIDGE_CREDENTIAL  凭据文件（默认 ~/.pi-ai/auth.json）
 *   CODEX_BRIDGE_PROXY       代理地址（默认 http://127.0.0.1:7897）
 *   CODEX_BRIDGE_MODEL       默认模型（默认 gpt-5.6-sol）
 *   CODEX_BRIDGE_PARENT_PID  父进程 pid（父退出则自杀，防孤儿）
 */
import http from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { globSync } from "node:fs";

const PORT = Number(process.env.CODEX_BRIDGE_PORT || 8899);
const CRED_PATH = process.env.CODEX_BRIDGE_CREDENTIAL || join(homedir(), ".pi-ai", "auth.json");
const DEFAULT_MODEL = process.env.CODEX_BRIDGE_MODEL || "gpt-5.6-sol";
const PARENT_PID = Number(process.env.CODEX_BRIDGE_PARENT_PID || 0);

// ---------- 动态解析 pi-ai（插件在 profile 里是 symlink，裸 import 解析不到） ----------
function resolvePiAiDist() {
  const candidates = globSync(join(homedir(), ".npm", "_npx", "*", "node_modules", "@earendil-works", "pi-ai", "dist", "providers", "openai-codex.js"));
  if (candidates.length === 0) throw new Error("找不到 @earendil-works/pi-ai，请先通过 dsh/npx 安装");
  return candidates.sort().at(-1).replace(/\/providers\/openai-codex\.js$/, "");
}

// ---------- 自愈补丁：pi-ai estimate.js 的 undefined usage 崩溃（历史 assistant 消息不带 usage） ----------
// 上游 bug：calculateContextTokens(assistant.usage) 在 usage 缺失时抛
// "Cannot read properties of undefined (reading 'totalTokens')"。
// 幂等：已补过则跳过。dsh 重装（npx 缓存重建）后自动再补。
function ensurePiAiPatch(piDist) {
  const estimatePath = join(piDist, "utils", "estimate.js");
  try {
    const src = readFileSync(estimatePath, "utf8");
    const marker = "usage == null";
    if (!src.includes(marker)) {
      const patched = src.replace(
        "return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;",
        "return usage == null ? 0 : (usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite);"
      );
      if (patched !== src) {
        writeFileSync(estimatePath, patched, "utf8");
        console.log("[oauth-bridge] 已自动修补 pi-ai estimate.js（undefined usage 保护）");
      }
    }
  } catch (error) {
    console.error(`[oauth-bridge] 修补 estimate.js 失败：${error.message}`);
  }
}

const PI_DIST = resolvePiAiDist();
ensurePiAiPatch(PI_DIST);
const { openaiCodexProvider } = await import(join(PI_DIST, "providers", "openai-codex.js"));
const { openaiCodexOAuth } = await import(join(PI_DIST, "auth", "oauth", "openai-codex.js"));

const provider = openaiCodexProvider();
const MODELS = await provider.getModels();

function findModel(id) {
  return (Array.isArray(MODELS) ? MODELS : Object.values(MODELS)).find((m) => m.id === id) || null;
}

// ---------- 凭据 ----------
function loadCredential() {
  if (!existsSync(CRED_PATH)) throw new Error(`OAuth 凭据缺失：${CRED_PATH}（先运行 pi-ai login openai-codex）`);
  const raw = JSON.parse(readFileSync(CRED_PATH, "utf8"));
  const cred = raw["openai-codex"];
  if (!cred?.access) throw new Error(`凭据文件 ${CRED_PATH} 里没有 openai-codex 条目`);
  return cred;
}

function saveCredential(cred) {
  const raw = existsSync(CRED_PATH) ? JSON.parse(readFileSync(CRED_PATH, "utf8")) : {};
  raw["openai-codex"] = cred;
  writeFileSync(CRED_PATH, JSON.stringify(raw, null, 2), "utf8");
}

async function ensureFreshCredential() {
  let cred = loadCredential();
  if (Date.now() > (cred.expires || 0) - 10 * 60 * 1000) {
    try {
      cred = await openaiCodexOAuth.refresh(cred);
      saveCredential(cred);
      console.log(`[oauth-bridge] token 已刷新，过期时间 ${new Date(cred.expires).toISOString()}`);
    } catch (error) {
      console.error(`[oauth-bridge] token 刷新失败：${error.message}`);
    }
  }
  return cred;
}

// ---------- OpenAI 消息 → pi-ai context ----------
function convertContext(messages, tools) {
  const systemParts = [];
  const out = [];
  const now = Date.now();
  for (const m of messages || []) {
    const role = m.role;
    if (role === "system" || role === "developer") { systemParts.push(String(m.content ?? "")); continue; }
    if (role === "user") { out.push({ role: "user", content: String(m.content ?? ""), timestamp: now }); continue; }
    if (role === "assistant") {
      const blocks = [];
      if (m.content) blocks.push({ type: "text", text: String(m.content) });
      for (const tc of m.tool_calls || []) {
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* 忽略 */ }
        blocks.push({ type: "toolCall", id: tc.id, name: tc.function?.name || "tool", arguments: args });
      }
      out.push({ role: "assistant", content: blocks, timestamp: now });
      continue;
    }
    if (role === "tool") {
      out.push({
        role: "toolResult",
        toolCallId: m.tool_call_id || "",
        toolName: m.name || "",
        content: [{ type: "text", text: String(m.content ?? "") }],
        timestamp: now
      });
      continue;
    }
  }
  const context = { messages: out };
  if (systemParts.length) context.systemPrompt = systemParts.join("\n\n");
  if (Array.isArray(tools) && tools.length) {
    context.tools = tools.map((t) => ({
      name: t.function?.name || t.name,
      description: t.function?.description || t.description || "",
      parameters: t.function?.parameters || t.parameters || { type: "object", properties: {} }
    }));
  }
  return context;
}

const REASONING_MAP = { off: "off", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" };

// ---------- HTTP ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 50 * 1024 * 1024) { reject(new Error("body too large")); req.destroy(); } });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function json(res, code, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function sse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function handleChat(req, res, body) {
  const model = findModel(body.model) || findModel(DEFAULT_MODEL);
  if (!model) return json(res, 400, { error: { message: `unknown model: ${body.model}`, type: "invalid_request_error" } });
  const cred = await ensureFreshCredential();
  const context = convertContext(body.messages, body.tools);
  const options = { apiKey: cred.access, signal: AbortSignal.timeout(600000) };
  const reasoning = body.reasoning_effort ? REASONING_MAP[body.reasoning_effort] ?? null : null;
  if (reasoning) options.reasoning = reasoning;

  const stream = provider.streamSimple(model, context, options);
  const isStream = body.stream !== false;
  const responseId = `chatcmpl-oauth-${Date.now().toString(36)}`;

  if (!isStream) {
    let text = "";
    const toolCalls = [];
    for await (const e of stream) {
      if (e?.type === "text_delta") text += e.delta;
      else if (e?.type === "toolcall_end") toolCalls.push({ id: e.toolCall.id, name: e.toolCall.name, arguments: JSON.stringify(e.toolCall.arguments ?? {}) });
      else if (e?.type === "error") {
        console.error("[oauth-bridge] 上游错误:", e.error?.errorMessage || JSON.stringify(e.error).slice(0, 600));
        return json(res, 502, { error: { message: e.error?.errorMessage || "upstream error", type: "upstream_error" } });
      }
    }
    const finish = toolCalls.length ? "tool_calls" : "stop";
    return json(res, 200, {
      id: responseId, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: model.id,
      choices: [{ index: 0, message: { role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: t.arguments } })) } : {}) }, finish_reason: finish }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    });
  }

  // SSE
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
  sse(res, { id: responseId, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: model.id, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] });
  const toolIndexes = {};
  let sawToolCall = false;
  try {
    for await (const e of stream) {
      if (e?.type === "text_delta") {
        sse(res, { id: responseId, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: model.id, choices: [{ index: 0, delta: { content: e.delta }, finish_reason: null }] });
      } else if (e?.type === "toolcall_start") {
        sawToolCall = true;
        const tc = e.toolCall || e.partial?.content?.[0] || {};
        const tcId = tc.id || `call_${Date.now().toString(36)}`;
        const idx = toolIndexes[tcId] ?? Object.keys(toolIndexes).length;
        toolIndexes[tcId] = idx;
        sse(res, { id: responseId, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: model.id, choices: [{ index: 0, delta: { tool_calls: [{ index: idx, id: tcId, type: "function", function: { name: tc.name || "tool", arguments: "" } }] }, finish_reason: null }] });
      } else if (e?.type === "toolcall_delta") {
        const tc = e.partial?.content?.[0] || {};
        const idx = toolIndexes[tc.id] ?? 0;
        sse(res, { id: responseId, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: model.id, choices: [{ index: 0, delta: { tool_calls: [{ index: idx, function: { arguments: e.delta } }] }, finish_reason: null }] });
      } else if (e?.type === "toolcall_end") {
        // 参数增量已随 toolcall_delta 流出，这里无需额外动作
      } else if (e?.type === "done") {
        const finish = sawToolCall || e.reason === "toolUse" ? "tool_calls" : "stop";
        sse(res, { id: responseId, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: model.id, choices: [{ index: 0, delta: {}, finish_reason: finish }] });
        sse(res, { id: responseId, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: model.id, choices: [], usage: { prompt_tokens: e.message?.usage?.input || 0, completion_tokens: e.message?.usage?.output || 0, total_tokens: e.message?.usage?.totalTokens || 0 } });
      } else if (e?.type === "error") {
        console.error("[oauth-bridge] SSE 上游错误:", e.error?.errorMessage || JSON.stringify(e.error).slice(0, 600));
        sse(res, { id: responseId, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: model.id, choices: [{ index: 0, delta: {}, finish_reason: "error" }] });
        sse(res, { id: responseId, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: model.id, choices: [], usage: {} });
      }
    }
  } catch (error) {
    console.error("[oauth-bridge] SSE 异常:", error?.message || error);
    try { sse(res, { id: responseId, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: model.id, choices: [{ index: 0, delta: {}, finish_reason: "error" }] }); } catch {}
  }
  res.end("data: [DONE]\n\n");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, backend: "oauth", provider: "openai-codex", cleanMode: true, model: DEFAULT_MODEL, credential: existsSync(CRED_PATH) ? "present" : "missing" });
    }
    if (req.method === "GET" && url.pathname === "/v1/models") {
      const list = (Array.isArray(MODELS) ? MODELS : Object.values(MODELS)).map((m) => ({ id: m.id, object: "model", owned_by: "chatgpt" }));
      return json(res, 200, { object: "list", data: list });
    }
    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      const raw = await readBody(req);
      if (process.env.CODEX_BRIDGE_DEBUG) { try { writeFileSync("/tmp/dsh-request.json", raw); } catch {} }
      let body;
      try { body = JSON.parse(raw); } catch { return json(res, 400, { error: { message: "invalid JSON body", type: "invalid_request_error" } }); }
      return handleChat(req, res, body);
    }
    return json(res, 404, { error: { message: `not found: ${req.method} ${url.pathname}`, type: "not_found" } });
  } catch (error) {
    if (!res.headersSent) return json(res, 500, { error: { message: error.message, type: "internal" } });
    res.end();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[oauth-bridge] OpenAI 兼容端点 http://127.0.0.1:${PORT}/v1（backend=pi-ai openai-codex, model=${DEFAULT_MODEL}）`);
  console.log(`[oauth-bridge] 凭据 ${existsSync(CRED_PATH) ? "已就绪" : "缺失"}：${CRED_PATH}`);
  if (PARENT_PID) console.log(`[oauth-bridge] 托管父进程 pid=${PARENT_PID}`);
});

// 父进程退出检测（防孤儿）
if (PARENT_PID) {
  const timer = setInterval(() => {
    try { process.kill(PARENT_PID, 0); } catch { clearInterval(timer); process.exit(0); }
  }, 2000);
  timer.unref?.();
}
