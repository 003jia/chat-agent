import type { AgentConfig, ChatMessage, Conversation, MemoryItem, MemoryState, ModelConfig } from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {})
    },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message || "请求失败。";
    const error = new Error(message) as Error & { code?: string; detail?: string };
    error.code = payload?.code;
    error.detail = payload?.detail;
    throw error;
  }
  return payload as T;
}

export const api = {
  getAgentConfig: () => request<AgentConfig>("/api/agent-config"),
  saveAgentConfig: (config: AgentConfig) =>
    request<AgentConfig>("/api/agent-config", {
      method: "PUT",
      body: JSON.stringify(config)
    }),
  getModelConfig: () => request<ModelConfig>("/api/model-config"),
  saveModelConfig: (config: ModelConfig) =>
    request<ModelConfig>("/api/model-config", {
      method: "PUT",
      body: JSON.stringify(config)
    }),
  testModel: () =>
    request<{ ok: true; message: string }>("/api/model/test", {
      method: "POST",
      body: JSON.stringify({})
    }),
  getConversation: () => request<Conversation>("/api/conversations/default"),
  chat: (message: string, mode = "normal") =>
    request<{
      conversation: Conversation;
      reply: ChatMessage;
      relevantMemories: MemoryItem[];
      candidates: MemoryItem[];
    }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, mode, conversationId: "default" })
    }),
  getMemory: () => request<MemoryState>("/api/memory"),
  commitMemory: (items: MemoryItem[]) =>
    request<{ items: MemoryItem[]; rawPath: string }>("/api/memory/commit", {
      method: "POST",
      body: JSON.stringify({ items })
    }),
  organizeMemory: () =>
    request<{ items: MemoryItem[]; markdown: string; mode: string }>("/api/memory/organize", {
      method: "POST",
      body: JSON.stringify({})
    })
};
