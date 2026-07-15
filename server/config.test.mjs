import { describe, expect, it } from "vitest";
import { createApiKeyPreview, DEFAULT_CONTEXT_LENGTH, maskModelConfig, normalizeModelConfig, stripRuntimeModelConfig } from "./config.mjs";

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
