import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const configDir = path.join(dataDir, "config");
const conversationsDir = path.join(dataDir, "conversations");
const memoryDir = path.join(dataDir, "memory");
const rawMemoryDir = path.join(memoryDir, "raw");

const app = express();
const port = Number(process.env.PORT || 8787);
const DEFAULT_CONTEXT_LENGTH = 64000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const defaultAgentConfig = {
  name: "Memory Agent",
  roleTitle: "本地研究助理",
  roleDescription: "保持克制、追问关键上下文，并把稳定事实整理为可追溯的长期记忆。",
  language: "zh",
  behavior: {
    proactiveFollowup: true,
    citeMemory: true,
    autoSaveNotes: true,
    strictRetrieval: false
  },
  temperature: 0.62
};

const defaultModelConfig = {
  selectedProvider: "openai-compatible",
  providers: {
    "openai-compatible": {
      id: "openai-compatible",
      label: "OpenAI Compatible",
      baseURL: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4.1-mini",
      contextLength: DEFAULT_CONTEXT_LENGTH,
      status: "missing"
    },
    openai: {
      id: "openai",
      label: "OpenAI",
      baseURL: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4.1-mini",
      contextLength: DEFAULT_CONTEXT_LENGTH,
      status: "missing"
    },
    deepseek: {
      id: "deepseek",
      label: "DeepSeek",
      baseURL: "https://api.deepseek.com/v1",
      apiKey: "",
      model: "deepseek-chat",
      contextLength: DEFAULT_CONTEXT_LENGTH,
      status: "missing"
    },
    anthropic: {
      id: "anthropic",
      label: "Anthropic",
      baseURL: "https://api.anthropic.com/v1",
      apiKey: "",
      model: "claude-3-5-sonnet-latest",
      contextLength: DEFAULT_CONTEXT_LENGTH,
      status: "missing"
    }
  }
};

const seedConversation = {
  id: "default",
  title: "产品策略讨论",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  messages: [
    {
      id: "seed-assistant-1",
      role: "assistant",
      content: "我会先按你的长期偏好做一个保守版本：先确认约束，再给出可执行方案。当前记忆显示你更关注结构清晰、可验证结果和本地文件可追溯。",
      timestamp: new Date().toISOString(),
      memoryRefs: ["project-workflow", "verification-habit"],
      candidateMemoryIds: []
    },
    {
      id: "seed-user-1",
      role: "user",
      content: "这次帮我判断一下智能体该不该自动写入 memory.md，别把临时想法也存进去。",
      timestamp: new Date().toISOString(),
      memoryRefs: [],
      candidateMemoryIds: []
    },
    {
      id: "seed-assistant-2",
      role: "assistant",
      content: "建议采用候选区审核：稳定事实、长期偏好、项目固定约束可以写入；临时判断、一次性任务、未经确认的猜测只进入本轮上下文。右侧我已经标出 2 条候选记忆，其中 1 条需要你确认。",
      timestamp: new Date().toISOString(),
      memoryRefs: ["api-key-handling"],
      candidateMemoryIds: ["candidate-1"]
    }
  ]
};

const seedMemoryIndex = [
  {
    id: "project-workflow",
    content: "Use staged workbench before execution.",
    type: "user_preference",
    level: "high",
    source: "memory.md",
    updatedAt: new Date().toISOString(),
    status: "active"
  },
  {
    id: "api-key-handling",
    content: "Visible API entry, never hidden setup.",
    type: "project_fact",
    level: "high",
    source: "memory.md",
    updatedAt: new Date().toISOString(),
    status: "active"
  },
  {
    id: "verification-habit",
    content: "Run typecheck, tests, and build after changes.",
    type: "user_preference",
    level: "medium",
    source: "memory.md",
    updatedAt: new Date().toISOString(),
    status: "active"
  }
];

async function ensureDataStore() {
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(conversationsDir, { recursive: true });
  await fs.mkdir(rawMemoryDir, { recursive: true });
  await ensureJson(path.join(configDir, "agent.json"), defaultAgentConfig);
  await ensureJson(path.join(configDir, "models.json"), defaultModelConfig);
  await ensureJson(path.join(conversationsDir, "default.json"), seedConversation);
  await ensureJson(path.join(memoryDir, "index.json"), seedMemoryIndex);
  await ensureText(path.join(memoryDir, "memory.md"), renderMemoryMarkdown(seedMemoryIndex));
}

async function ensureJson(filePath, fallback) {
  try {
    await fs.access(filePath);
  } catch {
    await writeJson(filePath, fallback);
  }
}

async function ensureText(filePath, fallback) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, fallback, "utf8");
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeModelConfig(config) {
  const selectedProvider = config?.selectedProvider || defaultModelConfig.selectedProvider;
  const providers = {};
  for (const [id, defaultProvider] of Object.entries(defaultModelConfig.providers)) {
    const provider = config?.providers?.[id] || {};
    providers[id] = {
      ...defaultProvider,
      ...provider,
      contextLength: Math.max(1000, Number(provider.contextLength || defaultProvider.contextLength || DEFAULT_CONTEXT_LENGTH))
    };
  }
  return {
    selectedProvider: providers[selectedProvider] ? selectedProvider : defaultModelConfig.selectedProvider,
    providers
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readText(filePath, fallback = "") {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function maskModelConfig(config) {
  const normalized = normalizeModelConfig(config);
  const providers = Object.fromEntries(
    Object.entries(normalized.providers).map(([id, provider]) => [
      id,
      {
        ...provider,
        apiKey: "",
        apiKeySet: Boolean(provider.apiKey),
        status: provider.apiKey ? provider.status || "ready" : "missing"
      }
    ])
  );
  return { ...normalized, providers };
}

function providerFromConfig(modelConfig) {
  const provider = modelConfig.providers[modelConfig.selectedProvider];
  if (!provider) {
    throw apiError(400, "CONFIG_ERROR", "当前模型供应商不存在。");
  }
  if (!provider.apiKey) {
    throw apiError(400, "MISSING_API_KEY", "当前供应商缺少 API Key。");
  }
  if (!provider.model) {
    throw apiError(400, "CONFIG_ERROR", "当前供应商缺少模型名。");
  }
  return provider;
}

function apiError(status, code, message, detail) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.detail = detail;
  return error;
}

function mapModelError(error) {
  if (error.code) return error;
  if (error.name === "AbortError") {
    return apiError(504, "NETWORK_ERROR", "模型请求超时。");
  }
  return apiError(502, "MODEL_RESPONSE_ERROR", "模型返回异常或网络不可用。", error.message);
}

function normalizeBaseURL(baseURL) {
  return String(baseURL || "").replace(/\/+$/, "");
}

async function callModel(provider, messages, temperature) {
  try {
    if (provider.id === "anthropic") {
      return await callAnthropic(provider, messages, temperature);
    }
    return await callOpenAICompatible(provider, messages, temperature);
  } catch (error) {
    throw mapModelError(error);
  }
}

async function callOpenAICompatible(provider, messages, temperature) {
  const response = await fetch(`${normalizeBaseURL(provider.baseURL)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify({
      model: provider.model,
      temperature,
      messages
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw classifyProviderError(response.status, payload?.error?.message || payload?.message);
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw apiError(502, "MODEL_RESPONSE_ERROR", "模型没有返回可用内容。");
  return content;
}

async function callAnthropic(provider, messages, temperature) {
  const systemMessage = messages.find((message) => message.role === "system")?.content || "";
  const chatMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: message.content }));
  const response = await fetch(`${normalizeBaseURL(provider.baseURL)}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 1400,
      temperature,
      system: systemMessage,
      messages: chatMessages
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw classifyProviderError(response.status, payload?.error?.message || payload?.message);
  }
  const content = payload?.content?.map((part) => part.text).filter(Boolean).join("\n");
  if (!content) throw apiError(502, "MODEL_RESPONSE_ERROR", "模型没有返回可用内容。");
  return content;
}

function classifyProviderError(status, message = "模型请求失败。") {
  if (status === 401 || status === 403) return apiError(status, "AUTH_FAILED", "API Key 认证失败。", message);
  if (status === 404) return apiError(status, "MODEL_NOT_FOUND", "模型或接口地址不存在。", message);
  if (status >= 500) return apiError(status, "NETWORK_ERROR", "供应商服务暂时不可用。", message);
  return apiError(status, "MODEL_RESPONSE_ERROR", message);
}

function buildSystemPrompt(agentConfig, memories, mode = "normal") {
  const memoryBlock = memories.length
    ? memories.map((item) => `- [${item.level}] ${item.content}`).join("\n")
    : "- No relevant long-term memory selected.";
  const modeRules = {
    thinking: "当前为深度思考模式：先梳理约束和关键判断，再给出结论；不要只给短答。",
    memory: "当前为记忆整理模式：优先识别稳定事实、长期偏好和需要进入候选区的内容。",
    tools: "当前为工具模式：如果需要调用本地工具或文件，请先说明需要的工具动作和预期结果。",
    normal: "当前为普通对话模式：保持清晰、直接和可执行。"
  };
  return [
    `你是 ${agentConfig.name}，角色是：${agentConfig.roleTitle}。`,
    agentConfig.roleDescription,
    `行为规则：${agentConfig.behavior.proactiveFollowup ? "必要时主动追问" : "尽量不主动追问"}；${agentConfig.behavior.citeMemory ? "回答中可以引用长期记忆" : "不要显式引用长期记忆"}；${agentConfig.behavior.strictRetrieval ? "只使用已选择记忆" : "可结合当前对话推理" }。`,
    modeRules[mode] || modeRules.normal,
    "长期记忆：",
    memoryBlock
  ].join("\n");
}

function selectRelevantMemories(message, memoryItems, strictRetrieval) {
  const active = memoryItems.filter((item) => item.status === "active");
  const keywords = new Set(
    String(message)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 2)
  );
  const scored = active.map((item) => {
    const text = `${item.content} ${item.type}`.toLowerCase();
    let score = item.level === "high" ? 3 : item.level === "medium" ? 2 : 1;
    for (const keyword of keywords) {
      if (text.includes(keyword)) score += 2;
    }
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const limit = strictRetrieval ? 5 : 8;
  return scored.slice(0, limit).map((entry) => entry.item);
}

function generateCandidatesFromMessages(messages) {
  const latest = messages.slice(-4);
  const text = latest.map((message) => message.content).join("\n");
  const candidates = [];
  const preferencePatterns = ["希望", "偏好", "以后", "记住", "不要", "需要", "prefer", "remember", "always", "never"];
  const hasPreference = preferencePatterns.some((word) => text.toLowerCase().includes(word.toLowerCase()));
  if (hasPreference) {
    candidates.push({
      id: createId("candidate"),
      content: summarizeText(text),
      type: "user_preference",
      level: text.includes("不要") || text.toLowerCase().includes("never") ? "high" : "medium",
      source: "chat",
      updatedAt: new Date().toISOString(),
      status: "candidate"
    });
  }
  if (text.includes("项目") || text.includes("memory.md") || text.includes("API") || text.includes("模型")) {
    candidates.push({
      id: createId("candidate"),
      content: summarizeText(text),
      type: "project_fact",
      level: "medium",
      source: "chat",
      updatedAt: new Date().toISOString(),
      status: "candidate"
    });
  }
  return dedupeCandidates(candidates);
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.type}:${candidate.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeText(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 96) return cleaned;
  return `${cleaned.slice(0, 96)}...`;
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderMemoryMarkdown(items) {
  const groups = [
    ["High Priority", items.filter((item) => item.level === "high")],
    ["Medium Priority", items.filter((item) => item.level === "medium")],
    ["Low Priority", items.filter((item) => item.level === "low")]
  ];
  const lines = ["# Long Term Memory", ""];
  for (const [title, group] of groups) {
    lines.push(`## ${title}`, "");
    if (!group.length) {
      lines.push("- No active memories.", "");
      continue;
    }
    for (const item of group) {
      lines.push(`- Type: ${item.type}`);
      lines.push(`  Content: ${item.content}`);
      lines.push(`  Source: ${item.source}`);
      lines.push(`  Updated: ${item.updatedAt.slice(0, 10)}`);
      lines.push(`  Status: ${item.status}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function todayRawFile() {
  return path.join(rawMemoryDir, `${new Date().toISOString().slice(0, 10)}.md`);
}

async function appendRawMemory(items) {
  const filePath = todayRawFile();
  const lines = [`\n## ${new Date().toISOString()}`, ""];
  for (const item of items) {
    lines.push(`- [${item.level}] (${item.type}) ${item.content}`);
    lines.push(`  - Source: ${item.source}`);
    lines.push(`  - ID: ${item.id}`);
  }
  await fs.appendFile(filePath, `${lines.join("\n")}\n`, "utf8");
  return path.relative(rootDir, filePath);
}

async function getMemoryIndex() {
  return await readJson(path.join(memoryDir, "index.json"), []);
}

async function saveMemoryIndex(items) {
  await writeJson(path.join(memoryDir, "index.json"), items);
  await fs.writeFile(path.join(memoryDir, "memory.md"), renderMemoryMarkdown(items.filter((item) => item.status === "active")), "utf8");
}

async function getConversation(conversationId = "default") {
  return await readJson(path.join(conversationsDir, `${conversationId}.json`), seedConversation);
}

async function saveConversation(conversation) {
  await writeJson(path.join(conversationsDir, `${conversation.id}.json`), conversation);
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/agent-config", async (_request, response, next) => {
  try {
    response.json(await readJson(path.join(configDir, "agent.json"), defaultAgentConfig));
  } catch (error) {
    next(error);
  }
});

app.put("/api/agent-config", async (request, response, next) => {
  try {
    const merged = { ...defaultAgentConfig, ...request.body, behavior: { ...defaultAgentConfig.behavior, ...request.body?.behavior } };
    await writeJson(path.join(configDir, "agent.json"), merged);
    response.json(merged);
  } catch (error) {
    next(error);
  }
});

app.get("/api/model-config", async (_request, response, next) => {
  try {
    const config = normalizeModelConfig(await readJson(path.join(configDir, "models.json"), defaultModelConfig));
    response.json(maskModelConfig(config));
  } catch (error) {
    next(error);
  }
});

app.put("/api/model-config", async (request, response, next) => {
  try {
    const current = normalizeModelConfig(await readJson(path.join(configDir, "models.json"), defaultModelConfig));
    const incoming = request.body || {};
    const providers = { ...current.providers };
    for (const [id, provider] of Object.entries(incoming.providers || {})) {
      providers[id] = {
        ...providers[id],
        ...provider,
        apiKey: provider.apiKey ? provider.apiKey : providers[id]?.apiKey || ""
      };
    }
    const nextConfig = normalizeModelConfig({
      selectedProvider: incoming.selectedProvider || current.selectedProvider,
      providers
    });
    await writeJson(path.join(configDir, "models.json"), nextConfig);
    response.json(maskModelConfig(nextConfig));
  } catch (error) {
    next(error);
  }
});

app.post("/api/model/test", async (_request, response, next) => {
  try {
    const modelConfig = normalizeModelConfig(await readJson(path.join(configDir, "models.json"), defaultModelConfig));
    const provider = providerFromConfig(modelConfig);
    const content = await callModel(provider, [{ role: "user", content: "Reply with OK." }], 0);
    provider.status = "ready";
    await writeJson(path.join(configDir, "models.json"), modelConfig);
    response.json({ ok: true, message: content.trim().slice(0, 120) || "OK" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/conversations/default", async (_request, response, next) => {
  try {
    response.json(await getConversation("default"));
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat", async (request, response, next) => {
  try {
    const { message, conversationId = "default", mode = "normal" } = request.body || {};
    if (!message || !String(message).trim()) {
      throw apiError(400, "VALIDATION_ERROR", "消息内容不能为空。");
    }
    const [agentConfig, modelConfig, memoryItems, conversation] = await Promise.all([
      readJson(path.join(configDir, "agent.json"), defaultAgentConfig),
      readJson(path.join(configDir, "models.json"), defaultModelConfig).then(normalizeModelConfig),
      getMemoryIndex(),
      getConversation(conversationId)
    ]);
    const provider = providerFromConfig(modelConfig);
    const userMessage = {
      id: createId("msg"),
      role: "user",
      content: String(message).trim(),
      timestamp: new Date().toISOString(),
      memoryRefs: [],
      candidateMemoryIds: []
    };
    const relevantMemories = selectRelevantMemories(message, memoryItems, agentConfig.behavior.strictRetrieval);
    const modelMessages = [
      { role: "system", content: buildSystemPrompt(agentConfig, relevantMemories, mode) },
      ...conversation.messages.slice(-8).map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: userMessage.content }
    ];
    const content = await callModel(provider, modelMessages, agentConfig.temperature);
    const assistantMessage = {
      id: createId("msg"),
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
      memoryRefs: relevantMemories.map((item) => item.id),
      candidateMemoryIds: []
    };
    const candidates = generateCandidatesFromMessages([...conversation.messages.slice(-2), userMessage, assistantMessage]);
    assistantMessage.candidateMemoryIds = candidates.map((item) => item.id);
    const nextConversation = {
      ...conversation,
      messages: [...conversation.messages, userMessage, assistantMessage],
      updatedAt: new Date().toISOString()
    };
    await saveConversation(nextConversation);
    response.json({ conversation: nextConversation, reply: assistantMessage, relevantMemories, candidates });
  } catch (error) {
    next(error);
  }
});

app.get("/api/memory", async (_request, response, next) => {
  try {
    const [items, markdown] = await Promise.all([getMemoryIndex(), readText(path.join(memoryDir, "memory.md"))]);
    response.json({
      items,
      markdown,
      stats: {
        loaded: items.filter((item) => item.status === "active").length,
        candidates: items.filter((item) => item.status === "candidate").length,
        editedMinutesAgo: 2
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/memory/candidates", async (request, response, next) => {
  try {
    const candidates = generateCandidatesFromMessages(request.body?.messages || []);
    response.json({ candidates });
  } catch (error) {
    next(error);
  }
});

app.post("/api/memory/commit", async (request, response, next) => {
  try {
    const incoming = Array.isArray(request.body?.items) ? request.body.items : [];
    if (!incoming.length) throw apiError(400, "VALIDATION_ERROR", "没有可写入的候选记忆。");
    const committed = incoming.map((item) => ({
      ...item,
      id: item.id || createId("memory"),
      status: "active",
      updatedAt: new Date().toISOString()
    }));
    const rawPath = await appendRawMemory(committed);
    const current = await getMemoryIndex();
    const merged = [...current.filter((item) => !committed.some((nextItem) => nextItem.id === item.id)), ...committed];
    await saveMemoryIndex(merged);
    response.json({ items: merged, rawPath });
  } catch (error) {
    next(error);
  }
});

app.post("/api/memory/organize", async (_request, response, next) => {
  try {
    const items = await getMemoryIndex();
    const activeItems = items
      .filter((item) => item.status !== "disabled")
      .map((item) => ({ ...item, status: "active", updatedAt: item.updatedAt || new Date().toISOString() }));
    await saveMemoryIndex(activeItems);
    response.json({ items: activeItems, markdown: renderMemoryMarkdown(activeItems), mode: "local" });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  const status = error.status || 500;
  response.status(status).json({
    ok: false,
    code: error.code || "INTERNAL_ERROR",
    message: error.message || "服务异常。",
    detail: error.detail
  });
});

await ensureDataStore();
app.listen(port, () => {
  console.log(`Memory Agent API listening on http://localhost:${port}`);
});
