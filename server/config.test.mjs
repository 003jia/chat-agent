import { describe, expect, it } from "vitest";
import { createApiKeyPreview, DEFAULT_CONTEXT_LENGTH, defaultAgentConfig, defaultRoleStore, EXPERT_TEAM_AUTHOR_ROLE_ID, maskModelConfig, normalizeModelConfig, normalizeRoleStore, stripRuntimeModelConfig } from "./config.mjs";

describe("normalizeModelConfig", () => {
  it("applies defaults and clamps context length", () => {
    const config = normalizeModelConfig({
      selectedProvider: "deepseek",
      providers: {
        deepseek: {
          apiKey: "file-key",
          embeddingModel: "embed-v1",
          contextLength: 64
        }
      }
    }, {});

    expect(config.selectedProvider).toBe("deepseek");
    expect(config.providers.deepseek.apiKey).toBe("file-key");
    expect(config.providers.deepseek.apiKeySource).toBe("file");
    expect(config.providers.deepseek.embeddingModel).toBe("embed-v1");
    expect(config.providers.deepseek.contextLength).toBe(1000);
    expect(config.providers.openai.contextLength).toBe(DEFAULT_CONTEXT_LENGTH);
  });

  it("uses environment API keys before file keys", () => {
    const config = normalizeModelConfig({
      selectedProvider: "openai",
      providers: {
        openai: {
          apiKey: "file-key"
        }
      }
    }, {
      MEMORY_AGENT_API_KEY_OPENAI: "env-key"
    });

    expect(config.providers.openai.apiKey).toBe("env-key");
    expect(config.providers.openai.apiKeySource).toBe("env");
  });
});

describe("stripRuntimeModelConfig", () => {
  it("removes masked and runtime-only fields before writing config", () => {
    const config = stripRuntimeModelConfig({
      selectedProvider: "openai",
      providers: {
        openai: {
          id: "openai",
          apiKey: "file-key",
          apiKeySource: "file",
          apiKeySet: true,
          apiKeyPreview: "••••••••",
          model: "gpt-4.1-mini"
        }
      }
    });

    expect(config.providers.openai).toEqual({
      id: "openai",
      apiKey: "file-key",
      model: "gpt-4.1-mini"
    });
  });
});

describe("API key masking", () => {
  it("shows only the sk- prefix and masked dots", () => {
    expect(createApiKeyPreview("sk-1234567890")).toBe("sk-••••••••");
    expect(createApiKeyPreview("provider-key")).toBe("••••••••");
  });

  it("masks model config without returning the API key", () => {
    const masked = maskModelConfig({
      selectedProvider: "openai",
      providers: {
        openai: {
          apiKey: "sk-1234567890"
        }
      }
    }, {});

    expect(masked.providers.openai.apiKey).toBe("");
    expect(masked.providers.openai.apiKeyPreview).toBe("sk-••••••••");
    expect(JSON.stringify(masked)).not.toContain("sk-1234567890");
  });
});

describe("defaultAgentConfig personalization fields (P0-3)", () => {
  it("includes avatar with default emoji", () => {
    expect(defaultAgentConfig.avatar).toBeTruthy();
    expect(typeof defaultAgentConfig.avatar).toBe("string");
  });

  it("includes accentColor with default indigo", () => {
    expect(defaultAgentConfig.accentColor).toBe("#6366f1");
  });

  it("includes personalityTone with default value", () => {
    expect(defaultAgentConfig.personalityTone).toBe("温暖克制");
  });

  it("includes greeting with default message", () => {
    expect(defaultAgentConfig.greeting).toBeTruthy();
    expect(defaultAgentConfig.greeting).toContain("你好");
  });
});

describe("normalizeRoleStore", () => {
  it("fills missing persona fields for legacy roles", () => {
    const store = normalizeRoleStore({
      roles: [{ id: "legacy-1", name: "Old Role", roleTitle: "旧角色", roleDescription: "Desc", language: "zh", temperature: 0.5, behavior: { proactiveFollowup: false, citeMemory: false, autoSaveNotes: false, strictRetrieval: false } }]
    });
    const role = store.roles[0];
    expect(role.avatar).toBe(defaultAgentConfig.avatar);
    expect(role.accentColor).toBe(defaultAgentConfig.accentColor);
    expect(role.personalityTone).toBe(defaultAgentConfig.personalityTone);
    expect(role.greeting).toBe(defaultAgentConfig.greeting);
    expect(store.roles.some((item) => item.id === EXPERT_TEAM_AUTHOR_ROLE_ID)).toBe(true);
  });

  it("preserves existing persona fields when present", () => {
    const store = normalizeRoleStore({
      roles: [{ id: "custom-1", name: "Custom", roleTitle: "自定义", roleDescription: "Desc", avatar: "🐱", accentColor: "#ff0000", personalityTone: "幽默", greeting: "喵~", language: "zh", temperature: 0.5, behavior: { proactiveFollowup: false, citeMemory: false, autoSaveNotes: false, strictRetrieval: false } }]
    });
    const role = store.roles[0];
    expect(role.avatar).toBe("🐱");
    expect(role.accentColor).toBe("#ff0000");
    expect(role.personalityTone).toBe("幽默");
    expect(role.greeting).toBe("喵~");
  });

  it("restores the capability protocol for an existing built-in expert role", () => {
    const store = normalizeRoleStore({
      roles: [{ id: EXPERT_TEAM_AUTHOR_ROLE_ID, name: "自定义专家团名称", capabilityIds: [] }]
    });
    const role = store.roles.find((item) => item.id === EXPERT_TEAM_AUTHOR_ROLE_ID);

    expect(role.name).toBe("自定义专家团名称");
    expect(role.builtIn).toBe(true);
    expect(role.capabilityIds).toEqual(["expert-team-authoring"]);
    expect(role.quickPrompts).toHaveLength(3);
  });
});

describe("defaultRoleStore", () => {
  it("returns the default role and the built-in expert-team author", () => {
    const store = defaultRoleStore();
    expect(store.roles).toHaveLength(2);
    const role = store.roles[0];
    expect(role.avatar).toBe(defaultAgentConfig.avatar);
    expect(role.accentColor).toBe(defaultAgentConfig.accentColor);
    expect(role.personalityTone).toBe(defaultAgentConfig.personalityTone);
    expect(role.greeting).toBe(defaultAgentConfig.greeting);
    expect(store.roles[1]).toMatchObject({
      id: EXPERT_TEAM_AUTHOR_ROLE_ID,
      builtIn: true,
      capabilityIds: ["expert-team-authoring"]
    });
    expect(store.roles[1].quickPrompts).toHaveLength(3);
  });
});
