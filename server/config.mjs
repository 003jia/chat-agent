import { apiError } from "./errors.mjs";
import { EXPERT_TEAM_AUTHORING_CAPABILITY_ID, hasKnownCapability } from "./capabilities.mjs";

export const DEFAULT_CONTEXT_LENGTH = 64000;
export const EXPERT_TEAM_AUTHOR_ROLE_ID = "role-expert-team-author";

export const defaultAgentConfig = {
  name: "Memory Agent",
  roleTitle: "本地研究助理",
  roleDescription: "保持克制、追问关键上下文，并把稳定事实整理为可追溯的长期记忆。",
  avatar: "\u{1F916}",
  accentColor: "#6366f1",
  personalityTone: "温暖克制",
  greeting: "你好，我是你的 AI 研究助理。有什么我可以帮你的吗？",
  language: "zh",
  behavior: {
    proactiveFollowup: true,
    citeMemory: true,
    autoSaveNotes: true,
    strictRetrieval: false
  },
  temperature: 0.62
};

export const expertTeamAuthorRole = {
  ...defaultAgentConfig,
  id: EXPERT_TEAM_AUTHOR_ROLE_ID,
  name: "专家团架构师",
  roleTitle: "Comate 专家团架构师",
  roleDescription: "把复杂目标整理成可注册、可路由、可验证的 Team 专家团；支持新建、迁移和审查，但不伪造真实子 Agent 执行结果。",
  avatar: "🧭",
  accentColor: "#0f766e",
  personalityTone: "严谨、结构化、证据优先",
  greeting: "你好，我可以帮你设计、迁移或审查 Comate/CodeBuddy Team 专家团。请给我团队目标、现有目录或待审查的插件。",
  capabilityIds: [EXPERT_TEAM_AUTHORING_CAPABILITY_ID],
  quickPrompts: [
    "根据我的目标设计一个新的 Team 专家团",
    "审查现有专家团的 Manifest、Agent ID 和工作流",
    "把 Skill 编排的多 Agent 插件迁移成 Team 插件"
  ],
  builtIn: true,
  temperature: 0.3,
  behavior: {
    proactiveFollowup: true,
    citeMemory: true,
    autoSaveNotes: true,
    strictRetrieval: true
  }
};

export function defaultRoleStore(seedRoleId = "role-default") {
  const role = { ...defaultAgentConfig, id: seedRoleId };
  return { selectedRoleId: seedRoleId, roles: [role, expertTeamAuthorRole] };
}

export function normalizeRoleStore(store, legacyAgentConfig) {
  const roles = Array.isArray(store?.roles) ? store.roles.filter((role) => role && role.id) : [];
  if (!roles.length) {
    const seedRole = { ...defaultAgentConfig, ...(legacyAgentConfig || {}), id: "role-default" };
    roles.push(seedRole);
  }
  if (!roles.some((role) => role.id === EXPERT_TEAM_AUTHOR_ROLE_ID)) {
    roles.push(expertTeamAuthorRole);
  }
  const normalizedRoles = roles.map((role) => {
    const isExpertTeamAuthor = role.id === EXPERT_TEAM_AUTHOR_ROLE_ID;
    const defaults = isExpertTeamAuthor ? expertTeamAuthorRole : defaultAgentConfig;
    return {
      ...defaults,
      ...role,
      builtIn: isExpertTeamAuthor || Boolean(role.builtIn),
      capabilityIds: isExpertTeamAuthor
        ? [EXPERT_TEAM_AUTHORING_CAPABILITY_ID]
        : Array.isArray(role.capabilityIds)
          ? role.capabilityIds.filter(hasKnownCapability)
          : [],
      quickPrompts: Array.isArray(role.quickPrompts)
        ? role.quickPrompts.map(String).filter(Boolean).slice(0, 6)
        : defaults.quickPrompts || [],
      behavior: { ...defaults.behavior, ...role.behavior }
    };
  });
  const selectedRoleId = normalizedRoles.some((role) => role.id === store?.selectedRoleId)
    ? store.selectedRoleId
    : normalizedRoles[0].id;
  return { selectedRoleId, roles: normalizedRoles };
}

export const defaultModelConfig = {
  selectedProvider: "openai-compatible",
  providers: {
    "openai-compatible": {
      id: "openai-compatible",
      label: "OpenAI Compatible",
      baseURL: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4.1-mini",
      embeddingModel: "",
      contextLength: DEFAULT_CONTEXT_LENGTH,
      status: "missing"
    },
    openai: {
      id: "openai",
      label: "OpenAI",
      baseURL: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4.1-mini",
      embeddingModel: "",
      contextLength: DEFAULT_CONTEXT_LENGTH,
      status: "missing"
    },
    deepseek: {
      id: "deepseek",
      label: "DeepSeek",
      baseURL: "https://api.deepseek.com/v1",
      apiKey: "",
      model: "deepseek-chat",
      embeddingModel: "",
      contextLength: DEFAULT_CONTEXT_LENGTH,
      status: "missing"
    },
    anthropic: {
      id: "anthropic",
      label: "Anthropic",
      baseURL: "https://api.anthropic.com/v1",
      apiKey: "",
      model: "claude-3-5-sonnet-latest",
      embeddingModel: "",
      contextLength: DEFAULT_CONTEXT_LENGTH,
      status: "missing"
    }
  }
};

export const apiKeyEnvByProvider = {
  "openai-compatible": "MEMORY_AGENT_API_KEY_OPENAI_COMPATIBLE",
  openai: "MEMORY_AGENT_API_KEY_OPENAI",
  deepseek: "MEMORY_AGENT_API_KEY_DEEPSEEK",
  anthropic: "MEMORY_AGENT_API_KEY_ANTHROPIC"
};

export function normalizeModelConfig(config, env = process.env) {
  const selectedProvider = config?.selectedProvider || defaultModelConfig.selectedProvider;
  const providers = {};
  for (const [id, defaultProvider] of Object.entries(defaultModelConfig.providers)) {
    const provider = config?.providers?.[id] || {};
    const envApiKey = env[apiKeyEnvByProvider[id]];
    providers[id] = {
      ...defaultProvider,
      ...provider,
      apiKey: envApiKey || provider.apiKey || defaultProvider.apiKey,
      apiKeySource: envApiKey ? "env" : provider.apiKey ? "file" : "none",
      embeddingModel: String(provider.embeddingModel || defaultProvider.embeddingModel || "").trim(),
      contextLength: Math.max(1000, Number(provider.contextLength || defaultProvider.contextLength || DEFAULT_CONTEXT_LENGTH))
    };
  }
  return {
    selectedProvider: providers[selectedProvider] ? selectedProvider : defaultModelConfig.selectedProvider,
    providers
  };
}

export function hasProviderEnvApiKey(providerId, env = process.env) {
  return Boolean(env[apiKeyEnvByProvider[providerId]]);
}

export function maskModelConfig(config, env = process.env) {
  const normalized = normalizeModelConfig(config, env);
  const providers = Object.fromEntries(
    Object.entries(normalized.providers).map(([id, provider]) => [
      id,
      {
        ...provider,
        apiKey: "",
        apiKeySet: Boolean(provider.apiKey),
        apiKeyPreview: createApiKeyPreview(provider.apiKey),
        status: provider.apiKey ? provider.status || "ready" : "missing"
      }
    ])
  );
  return { ...normalized, providers };
}

export function createApiKeyPreview(apiKey) {
  const key = String(apiKey || "").trim();
  if (!key) return "";
  if (key.startsWith("sk-")) return "sk-••••••••";
  return "••••••••";
}

export function stripRuntimeModelConfig(config) {
  return {
    selectedProvider: config.selectedProvider,
    providers: Object.fromEntries(
      Object.entries(config.providers || {}).map(([id, provider]) => {
        const { apiKeySource, apiKeySet, apiKeyPreview, ...persistableProvider } = provider;
        return [id, persistableProvider];
      })
    )
  };
}

export function providerFromConfig(modelConfig) {
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
