import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireAdminToken } from "./auth.mjs";
import {
  CHAT_RATE_LIMIT_MAX,
  CHAT_RATE_LIMIT_WINDOW_MS,
  CHARS_PER_TOKEN_ESTIMATE,
  FS_RETRY_ATTEMPTS,
  FS_RETRY_BASE_DELAY_MS,
  HISTORY_CHAR_BUDGET_MAX,
  HISTORY_CHAR_BUDGET_MIN,
  HISTORY_TOKEN_BUDGET_RATIO,
  MAX_CHAT_MESSAGE_LENGTH,
  PORT,
  WRITE_RATE_LIMIT_MAX,
  WRITE_RATE_LIMIT_WINDOW_MS
} from "./constants.mjs";
import { defaultAgentConfig, defaultModelConfig, defaultRoleStore, hasProviderEnvApiKey, maskModelConfig, normalizeModelConfig, normalizeRoleStore, providerFromConfig, stripRuntimeModelConfig } from "./config.mjs";
import { createSeedConversation, seedConversation } from "./conversations.mjs";
import { apiError } from "./errors.mjs";
import { createId } from "./ids.mjs";
import { createMutex } from "./lock.mjs";
import { logError } from "./logger.mjs";
import { callModel, streamModelDeltas } from "./model.mjs";
import {
  commitMemoryItems,
  extractCandidatesWithModel,
  generateCandidatesFromMessages,
  mergeCandidateMemories,
  normalizeMemoryItems,
  organizeMemoryItems,
  renderMemoryMarkdown,
  selectRelevantMemories,
  updateMemoryItemInIndex
} from "./memory.mjs";
import { buildSystemPrompt, formatUserMessageForModel } from "./prompt.mjs";
import { withRetry } from "./retry.mjs";
import { performWebSearch, WEB_SEARCH_RESULT_LIMIT } from "./search.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(__dirname, "..");
const defaultAllowedOrigins = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`
];

export function createApp(options = {}) {
  const rootDir = options.rootDir || defaultRootDir;
  const env = options.env || process.env;
  const logger = options.logger || console;
  const modelClient = {
    callModel,
    streamModelDeltas,
    extractCandidatesWithModel,
    ...(options.modelClient || {})
  };
  const allowedOrigins = new Set(options.allowedOrigins || defaultAllowedOrigins);
  const rateLimitOptions = options.rateLimits || {};
  const dataDir = path.join(rootDir, "data");
  const configDir = path.join(dataDir, "config");
  const conversationsDir = path.join(dataDir, "conversations");
  const memoryDir = path.join(dataDir, "memory");
  const rawMemoryDir = path.join(memoryDir, "raw");
  const memoryWriteLock = createMutex();
  const backgroundTasks = new Set();

  const app = express();
  const adminAuth = requireAdminToken(env);
  const chatLimiter = createRateLimiter({
    windowMs: CHAT_RATE_LIMIT_WINDOW_MS,
    max: CHAT_RATE_LIMIT_MAX,
    ...(rateLimitOptions.chat || {})
  });
  const writeLimiter = createRateLimiter({
    windowMs: WRITE_RATE_LIMIT_WINDOW_MS,
    max: WRITE_RATE_LIMIT_MAX,
    ...(rateLimitOptions.write || {})
  });

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(apiError(403, "CORS_FORBIDDEN", "该 Origin 不允许访问本地 API。"));
    }
  }));
  app.use(express.json({ limit: "2mb" }));

  async function ensureDataStore() {
    await fs.mkdir(configDir, { recursive: true });
    await fs.mkdir(conversationsDir, { recursive: true });
    await fs.mkdir(rawMemoryDir, { recursive: true });
    await ensureRoleStore();
    await ensureJson(path.join(configDir, "models.json"), defaultModelConfig);
    await ensureJson(path.join(conversationsDir, "default.json"), seedConversation);
    await ensureJson(path.join(memoryDir, "index.json"), seedMemoryIndex);
    await ensureText(path.join(memoryDir, "memory.md"), renderMemoryMarkdown(seedMemoryIndex));
  }

  async function ensureRoleStore() {
    const rolesPath = path.join(configDir, "roles.json");
    try {
      await fs.access(rolesPath);
      return;
    } catch {
      // fall through to migrate or seed
    }
    const legacyAgentConfig = await readJson(path.join(configDir, "agent.json"), null);
    const store = legacyAgentConfig
      ? normalizeRoleStore({ roles: [{ ...legacyAgentConfig, id: "role-default" }] })
      : defaultRoleStore();
    await writeJson(rolesPath, store);
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
      await writeText(filePath, fallback);
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

  async function readJsonStrict(filePath) {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  }

  async function writeJson(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await retryFileWrite(() => fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8"));
  }

  async function writeText(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await retryFileWrite(() => fs.writeFile(filePath, value, "utf8"));
  }

  async function appendText(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await retryFileWrite(() => fs.appendFile(filePath, value, "utf8"));
  }

  async function readText(filePath, fallback = "") {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch {
      return fallback;
    }
  }

  async function getMemoryEditedMinutesAgo() {
    try {
      const stat = await fs.stat(path.join(memoryDir, "memory.md"));
      return Math.max(0, Math.round((Date.now() - stat.mtimeMs) / 60000));
    } catch {
      return 0;
    }
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
    await appendText(filePath, `${lines.join("\n")}\n`);
    return path.relative(rootDir, filePath);
  }

  async function getMemoryIndex() {
    return normalizeMemoryItems(await readJson(path.join(memoryDir, "index.json"), []));
  }

  async function saveMemoryIndex(items) {
    const normalized = normalizeMemoryItems(items);
    await writeJson(path.join(memoryDir, "index.json"), normalized);
    await writeText(path.join(memoryDir, "memory.md"), renderMemoryMarkdown(normalized.filter((item) => item.status === "active")));
  }

  async function getConversation(conversationId = "default") {
    const conversation = await readJson(path.join(conversationsDir, `${conversationId}.json`), null);
    if (conversation) return conversation;
    const roleStore = await getRoleStore();
    return createSeedConversation(conversationId, roleStore.selectedRoleId);
  }

  async function saveConversation(conversation) {
    await writeJson(path.join(conversationsDir, `${conversation.id}.json`), conversation);
  }

  async function listConversations() {
    let files = [];
    try {
      files = await fs.readdir(conversationsDir);
    } catch {
      files = [];
    }
    const summaries = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const conversation = await readJson(path.join(conversationsDir, file), null);
          if (!conversation) return null;
          return {
            id: conversation.id,
            title: conversation.title,
            roleId: conversation.roleId || "role-default",
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            messageCount: Array.isArray(conversation.messages) ? conversation.messages.length : 0
          };
        })
    );
    return summaries.filter(Boolean).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async function getRoleStore() {
    return normalizeRoleStore(await readJson(path.join(configDir, "roles.json"), null));
  }

  async function saveRoleStore(store) {
    await writeJson(path.join(configDir, "roles.json"), store);
  }

  async function checkReadiness() {
    const checks = {
      dataStore: await readinessCheck(async () => {
        await fs.mkdir(dataDir, { recursive: true });
        await fs.access(dataDir, fs.constants.R_OK | fs.constants.W_OK);
      }),
      config: await readinessCheck(async () => {
        await readJsonStrict(path.join(configDir, "roles.json"));
        await readJsonStrict(path.join(configDir, "models.json"));
      }),
      memory: await readinessCheck(async () => {
        await readJsonStrict(path.join(memoryDir, "index.json"));
        await fs.access(path.join(memoryDir, "memory.md"), fs.constants.R_OK | fs.constants.W_OK);
      })
    };
    const readiness = Object.fromEntries(Object.entries(checks).map(([key, value]) => [key, value.ok]));
    return {
      ok: Object.values(readiness).every(Boolean),
      readiness,
      detail: Object.fromEntries(Object.entries(checks).map(([key, value]) => [key, value.message]).filter(([, value]) => value))
    };
  }

  function validateMessage(message) {
    const content = String(message || "").trim();
    if (!content) throw apiError(400, "VALIDATION_ERROR", "消息内容不能为空。");
    if (content.length > MAX_CHAT_MESSAGE_LENGTH) {
      throw apiError(400, "VALIDATION_ERROR", `消息过长，最多 ${MAX_CHAT_MESSAGE_LENGTH} 字符。`);
    }
    return content;
  }

  async function buildChatPayload({ message, conversationId = "default", mode = "normal", useWebSearch = false }) {
    const content = validateMessage(message);
    const [roleStore, modelConfig, memoryItems, conversation] = await Promise.all([
      getRoleStore(),
      readJson(path.join(configDir, "models.json"), defaultModelConfig).then((config) => normalizeModelConfig(config, env)),
      getMemoryIndex(),
      getConversation(conversationId)
    ]);
    const roleId = conversation.roleId || roleStore.selectedRoleId;
    const agentConfig = roleStore.roles.find((role) => role.id === roleId) || roleStore.roles[0];
    const provider = providerFromConfig(modelConfig);
    const shouldSearchWeb = Boolean(useWebSearch) || mode === "web";
    let webSearch = null;
    let webSearchError = null;
    if (shouldSearchWeb) {
      try {
        webSearch = await performWebSearch(content, WEB_SEARCH_RESULT_LIMIT);
      } catch (error) {
        webSearchError = {
          code: error.code || "WEB_SEARCH_ERROR",
          message: error.message || "联网搜索不可用。"
        };
      }
    }
    const userMessage = {
      id: createId("msg"),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      memoryRefs: [],
      candidateMemoryIds: []
    };
    const relevantMemories = selectRelevantMemories(content, memoryItems, agentConfig.behavior.strictRetrieval);
    const modelMessages = [
      { role: "system", content: buildSystemPrompt(agentConfig, relevantMemories, mode, webSearch, webSearchError) },
      ...selectConversationMessagesForContext(conversation.messages, provider.contextLength).map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: formatUserMessageForModel(userMessage.content) }
    ];
    return { agentConfig, provider, conversation, userMessage, relevantMemories, modelMessages, webSearch, webSearchError };
  }

  async function saveCompletedAssistantMessage({ payload, content }) {
    const assistantMessage = {
      id: createId("msg"),
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
      memoryRefs: payload.relevantMemories.map((item) => item.id),
      candidateMemoryIds: []
    };
    const nextConversation = {
      ...payload.conversation,
      messages: [...payload.conversation.messages, payload.userMessage, assistantMessage],
      updatedAt: new Date().toISOString()
    };
    await saveConversation(nextConversation);
    return { nextConversation, assistantMessage };
  }

  async function extractCandidatesForAssistantMessage({ payload, assistantMessage }) {
    const memoryItems = await getMemoryIndex();
    const extraction = await modelClient.extractCandidatesWithModel(payload.provider, payload.agentConfig, {
      userContent: payload.userMessage.content,
      recentMessages: [...payload.conversation.messages.slice(-6), payload.userMessage],
      existingMemories: memoryItems.filter((item) => item.status === "active")
    });
    const candidates = extraction.candidates;
    if (!candidates.length) {
      return {
        nextConversation: await getConversation(payload.conversation.id),
        assistantMessage,
        candidates,
        candidateExtractionError: extraction.error
      };
    }
    const persistedCandidates = await memoryWriteLock(async () => {
      const current = await getMemoryIndex();
      const nextItems = mergeCandidateMemories(current, candidates);
      await saveMemoryIndex(nextItems);
      const candidateIds = new Set(candidates.map((item) => item.id));
      return nextItems.filter((item) => candidateIds.has(item.id));
    });
    const latestConversation = await getConversation(payload.conversation.id);
    const candidateIds = persistedCandidates.map((item) => item.id);
    const updatedAssistant = { ...assistantMessage, candidateMemoryIds: candidateIds };
    const nextConversation = {
      ...latestConversation,
      messages: latestConversation.messages.map((message) => (message.id === assistantMessage.id ? updatedAssistant : message)),
      updatedAt: new Date().toISOString()
    };
    await saveConversation(nextConversation);
    return { nextConversation, assistantMessage: updatedAssistant, candidates: persistedCandidates, candidateExtractionError: extraction.error };
  }

  function queueCandidateExtraction(payload, assistantMessage) {
    const task = extractCandidatesForAssistantMessage({ payload, assistantMessage })
      .catch((error) => {
        logError(logger, error, { operation: "candidate-extraction", conversationId: payload.conversation.id });
      })
      .finally(() => {
        backgroundTasks.delete(task);
      });
    backgroundTasks.add(task);
  }

  app.get("/api/health", async (_request, response, next) => {
    try {
      const health = await checkReadiness();
      response.status(health.ok ? 200 : 503).json(health.ok ? { ok: true, readiness: health.readiness } : { ...health, code: "READINESS_FAILED" });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/roles", async (_request, response, next) => {
    try {
      response.json(await getRoleStore());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/roles", writeLimiter, adminAuth, async (request, response, next) => {
    try {
      const store = await getRoleStore();
      const role = {
        ...defaultAgentConfig,
        ...request.body,
        behavior: { ...defaultAgentConfig.behavior, ...request.body?.behavior },
        id: createId("role")
      };
      const nextStore = normalizeRoleStore({ selectedRoleId: store.selectedRoleId, roles: [...store.roles, role] });
      await saveRoleStore(nextStore);
      response.status(201).json(nextStore);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/roles/:roleId", writeLimiter, adminAuth, async (request, response, next) => {
    try {
      const store = await getRoleStore();
      const existing = store.roles.find((role) => role.id === request.params.roleId);
      if (!existing) throw apiError(404, "ROLE_NOT_FOUND", "角色预设不存在。");
      const merged = {
        ...existing,
        ...request.body,
        behavior: { ...existing.behavior, ...request.body?.behavior },
        id: existing.id
      };
      const nextStore = normalizeRoleStore({
        selectedRoleId: store.selectedRoleId,
        roles: store.roles.map((role) => (role.id === existing.id ? merged : role))
      });
      await saveRoleStore(nextStore);
      response.json(nextStore);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/roles/:roleId", writeLimiter, adminAuth, async (request, response, next) => {
    try {
      const store = await getRoleStore();
      if (store.roles.length <= 1) throw apiError(400, "VALIDATION_ERROR", "至少需要保留一个角色预设。");
      const remainingRoles = store.roles.filter((role) => role.id !== request.params.roleId);
      if (remainingRoles.length === store.roles.length) throw apiError(404, "ROLE_NOT_FOUND", "角色预设不存在。");
      const nextStore = normalizeRoleStore({
        selectedRoleId: store.selectedRoleId === request.params.roleId ? remainingRoles[0].id : store.selectedRoleId,
        roles: remainingRoles
      });
      await saveRoleStore(nextStore);
      response.json(nextStore);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/roles/:roleId/select", writeLimiter, adminAuth, async (request, response, next) => {
    try {
      const store = await getRoleStore();
      if (!store.roles.some((role) => role.id === request.params.roleId)) {
        throw apiError(404, "ROLE_NOT_FOUND", "角色预设不存在。");
      }
      const nextStore = normalizeRoleStore({ selectedRoleId: request.params.roleId, roles: store.roles });
      await saveRoleStore(nextStore);
      response.json(nextStore);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/model-config", async (_request, response, next) => {
    try {
      const config = normalizeModelConfig(await readJson(path.join(configDir, "models.json"), defaultModelConfig), env);
      response.json(maskModelConfig(config, env));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/model-config", writeLimiter, adminAuth, async (request, response, next) => {
    try {
      const current = normalizeModelConfig(await readJson(path.join(configDir, "models.json"), defaultModelConfig), {});
      const incoming = request.body || {};
      const providers = { ...current.providers };
      for (const [id, provider] of Object.entries(incoming.providers || {})) {
        const nextProvider = { ...providers[id], ...provider };
        nextProvider.apiKey = hasProviderEnvApiKey(id, env) ? "" : provider.apiKey ? provider.apiKey : providers[id]?.apiKey || "";
        providers[id] = nextProvider;
      }
      const nextConfig = normalizeModelConfig({
        selectedProvider: incoming.selectedProvider || current.selectedProvider,
        providers
      }, {});
      await writeJson(path.join(configDir, "models.json"), stripRuntimeModelConfig(nextConfig));
      response.json(maskModelConfig(normalizeModelConfig(nextConfig, env), env));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/model/test", writeLimiter, adminAuth, async (_request, response, next) => {
    try {
      const modelConfig = normalizeModelConfig(await readJson(path.join(configDir, "models.json"), defaultModelConfig), env);
      const provider = providerFromConfig(modelConfig);
      const content = await modelClient.callModel(provider, [{ role: "user", content: "Reply with OK." }], 0);
      const fileModelConfig = normalizeModelConfig(await readJson(path.join(configDir, "models.json"), defaultModelConfig), {});
      if (fileModelConfig.providers[modelConfig.selectedProvider]) {
        fileModelConfig.providers[modelConfig.selectedProvider].status = "ready";
        await writeJson(path.join(configDir, "models.json"), stripRuntimeModelConfig(fileModelConfig));
      }
      response.json({ ok: true, message: content.trim().slice(0, 120) || "OK" });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/conversations", async (_request, response, next) => {
    try {
      response.json({ conversations: await listConversations() });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/conversations", writeLimiter, adminAuth, async (request, response, next) => {
    try {
      const roleStore = await getRoleStore();
      const roleId = request.body?.roleId && roleStore.roles.some((role) => role.id === request.body.roleId)
        ? request.body.roleId
        : roleStore.selectedRoleId;
      const conversation = createSeedConversation(createId("conv"), roleId);
      if (request.body?.title) conversation.title = String(request.body.title).slice(0, 80);
      await saveConversation(conversation);
      response.status(201).json(conversation);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/conversations/:conversationId", async (request, response, next) => {
    try {
      response.json(await getConversation(request.params.conversationId));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/conversations/:conversationId", writeLimiter, adminAuth, async (request, response, next) => {
    try {
      const conversations = await listConversations();
      if (conversations.length <= 1) throw apiError(400, "VALIDATION_ERROR", "至少需要保留一个会话。");
      await fs.rm(path.join(conversationsDir, `${request.params.conversationId}.json`), { force: true });
      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/conversations/:conversationId/role", writeLimiter, adminAuth, async (request, response, next) => {
    try {
      const roleStore = await getRoleStore();
      const roleId = request.body?.roleId;
      if (!roleId || !roleStore.roles.some((role) => role.id === roleId)) {
        throw apiError(404, "ROLE_NOT_FOUND", "角色预设不存在。");
      }
      const conversation = await getConversation(request.params.conversationId);
      const nextConversation = { ...conversation, roleId, updatedAt: new Date().toISOString() };
      await saveConversation(nextConversation);
      response.json(nextConversation);
    } catch (error) {
      next(error);
    }
  });

  async function handleWebSearchRequest(request, response, next) {
    try {
      const query = request.method === "GET" ? request.query?.q : request.body?.query;
      const limit = request.method === "GET" ? request.query?.limit : request.body?.limit;
      response.json(await performWebSearch(query, limit));
    } catch (error) {
      next(error);
    }
  }

  app.get("/api/web-search", chatLimiter, adminAuth, handleWebSearchRequest);
  app.post("/api/web-search", chatLimiter, adminAuth, handleWebSearchRequest);

  app.post("/api/chat", chatLimiter, adminAuth, async (request, response, next) => {
    try {
      const payload = await buildChatPayload(request.body || {});
      const content = await modelClient.callModel(payload.provider, payload.modelMessages, payload.agentConfig.temperature);
      const result = await saveCompletedAssistantMessage({ payload, content });
      queueCandidateExtraction(payload, result.assistantMessage);
      response.json({
        conversation: result.nextConversation,
        reply: result.assistantMessage,
        relevantMemories: payload.relevantMemories,
        candidates: [],
        candidateExtractionPending: true,
        candidateExtractionError: null,
        webSearch: payload.webSearch,
        webSearchError: payload.webSearchError
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/chat/stream", chatLimiter, adminAuth, async (request, response, next) => {
    try {
      const payload = await buildChatPayload(request.body || {});
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      });
      if (payload.webSearchError) {
        writeSse(response, "web.search_error", payload.webSearchError);
      }
      let content = "";
      for await (const delta of modelClient.streamModelDeltas(payload.provider, payload.modelMessages, payload.agentConfig.temperature)) {
        content += delta;
        writeSse(response, "message.delta", { delta });
      }
      const result = await saveCompletedAssistantMessage({ payload, content });
      writeSse(response, "message.done", {
        reply: result.assistantMessage,
        conversation: result.nextConversation,
        relevantMemories: payload.relevantMemories,
        webSearch: payload.webSearch,
        webSearchError: payload.webSearchError,
        candidateExtractionPending: true
      });
      try {
        const extraction = await extractCandidatesForAssistantMessage({ payload, assistantMessage: result.assistantMessage });
        writeSse(response, "memory.candidates", {
          replyId: result.assistantMessage.id,
          conversation: extraction.nextConversation,
          candidates: extraction.candidates,
          candidateExtractionError: extraction.candidateExtractionError
        });
      } catch (error) {
        writeSse(response, "memory.candidates", {
          replyId: result.assistantMessage.id,
          candidates: [],
          candidateExtractionError: { code: error.code || "MEMORY_EXTRACTION_ERROR", message: error.message || "候选记忆抽取失败。" }
        });
      }
      response.end();
    } catch (error) {
      if (response.headersSent) {
        writeSse(response, "error", { code: error.code || "STREAM_ERROR", message: error.message || "流式输出失败。" });
        response.end();
        return;
      }
      next(error);
    }
  });

  app.get("/api/memory", async (_request, response, next) => {
    try {
      const [items, markdown, editedMinutesAgo] = await Promise.all([
        getMemoryIndex(),
        readText(path.join(memoryDir, "memory.md")),
        getMemoryEditedMinutesAgo()
      ]);
      response.json({
        items,
        markdown,
        stats: {
          loaded: items.filter((item) => item.status === "active").length,
          candidates: items.filter((item) => item.status === "candidate").length,
          editedMinutesAgo
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

  app.post("/api/memory/commit", writeLimiter, adminAuth, async (request, response, next) => {
    try {
      const result = await memoryWriteLock(async () => {
        const incoming = Array.isArray(request.body?.items) ? request.body.items : [];
        if (!incoming.length) throw apiError(400, "VALIDATION_ERROR", "没有可写入的候选记忆。");
        const now = new Date().toISOString();
        const current = await getMemoryIndex();
        const { items, committed } = commitMemoryItems(current, incoming, now);
        const rawPath = await appendRawMemory(committed);
        await saveMemoryIndex(items);
        return { items, committed, rawPath };
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/memory/:memoryId", writeLimiter, adminAuth, async (request, response, next) => {
    try {
      const result = await memoryWriteLock(async () => {
        const current = await getMemoryIndex();
        const { found, items } = updateMemoryItemInIndex(current, request.params.memoryId, request.body || {});
        if (!found) throw apiError(404, "MEMORY_NOT_FOUND", "记忆不存在。");
        await saveMemoryIndex(items);
        return { items, item: items.find((entry) => entry.id === request.params.memoryId) };
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/memory/:memoryId", writeLimiter, adminAuth, async (request, response, next) => {
    try {
      const result = await memoryWriteLock(async () => {
        const current = await getMemoryIndex();
        const nextItems = current.filter((item) => item.id !== request.params.memoryId);
        if (nextItems.length === current.length) throw apiError(404, "MEMORY_NOT_FOUND", "记忆不存在。");
        await saveMemoryIndex(nextItems);
        return { items: nextItems };
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/memory/organize", writeLimiter, adminAuth, async (_request, response, next) => {
    try {
      const result = await memoryWriteLock(async () => {
        const items = await getMemoryIndex();
        const organized = organizeMemoryItems(items, new Date().toISOString());
        const activeItems = organized.filter((item) => item.status === "active");
        await saveMemoryIndex(organized);
        return { items: organized, markdown: renderMemoryMarkdown(activeItems), mode: "local-dedupe" };
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.use((error, request, response, _next) => {
    const status = error.status || 500;
    logError(logger, error, { method: request.method, path: request.path });
    response.status(status).json({
      ok: false,
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "服务异常。",
      detail: error.detail
    });
  });

  async function waitForBackgroundTasks() {
    await Promise.allSettled(Array.from(backgroundTasks));
  }

  return { app, ensureDataStore, checkReadiness, waitForBackgroundTasks, paths: { rootDir, dataDir, configDir, conversationsDir, memoryDir, rawMemoryDir } };
}

function createRateLimiter(options) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: (request) => request.ip || request.socket?.remoteAddress || "local",
    handler: (_request, response) => {
      response.status(429).json({ ok: false, code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试。" });
    },
    ...options
  });
}

function writeSse(response, event, data) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function selectConversationMessagesForContext(messages, contextLength) {
  const maxChars = estimateHistoryCharBudget(contextLength);
  const selected = [];
  let usedChars = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const cost = String(message.content || "").length;
    if (selected.length && usedChars + cost > maxChars) break;
    selected.unshift(message);
    usedChars += cost;
  }
  return selected;
}

function estimateHistoryCharBudget(contextLength) {
  const tokens = Math.max(0, Number(contextLength) || 0);
  const estimatedChars = Math.floor(tokens * CHARS_PER_TOKEN_ESTIMATE * HISTORY_TOKEN_BUDGET_RATIO);
  return Math.min(HISTORY_CHAR_BUDGET_MAX, Math.max(HISTORY_CHAR_BUDGET_MIN, estimatedChars || HISTORY_CHAR_BUDGET_MIN));
}

async function retryFileWrite(operation) {
  return await withRetry(operation, {
    retries: FS_RETRY_ATTEMPTS,
    baseDelayMs: FS_RETRY_BASE_DELAY_MS,
    shouldRetry: isRetryableFileError
  });
}

function isRetryableFileError(error) {
  return ["EBUSY", "EMFILE", "ENFILE"].includes(error?.code);
}

async function readinessCheck(check) {
  try {
    await check();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

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
