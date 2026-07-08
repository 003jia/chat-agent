import { apiError } from "./errors.mjs";

export const DEFAULT_CONTEXT_LENGTH = 64000;

export const defaultAgentConfig = {
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

export function defaultRoleStore(seedRoleId = "role-default") {
  const role = { ...defaultAgentConfig, id: seedRoleId };
  return { selectedRoleId: seedRoleId, roles: [role] };
}

export function normalizeRoleStore(store, legacyAgentConfig) {
  const roles = Array.isArray(store?.roles) ? store.roles.filter((role) => role && role.id) : [];
  if (!roles.length) {
    const seedRole = { ...defaultAgentConfig, ...(legacyAgentConfig || {}), id: "role-default" };
    roles.push(seedRole);
  }
  const normalizedRoles = roles.map((role) => ({
    ...defaultAgentConfig,
    ...role,
    behavior: { ...defaultAgentConfig.behavior, ...role.behavior }
  }));
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
        status: provider.apiKey ? provider.status || "ready" : "missing"
      }
    ])
  );
  return { ...normalized, providers };
}

export function stripRuntimeModelConfig(config) {
  return {
    selectedProvider: config.selectedProvider,
    providers: Object.fromEntries(
      Object.entries(config.providers || {}).map(([id, provider]) => {
        const { apiKeySource, apiKeySet, ...persistableProvider } = provider;
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
