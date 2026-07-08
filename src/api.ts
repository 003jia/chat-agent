import type { AgentConfig, ChatResponse, Conversation, ConversationSummary, MemoryItem, MemoryState, ModelConfig, RoleStore, WebSearchResponse } from "./types";

const adminTokenStorageKey = "memory-agent-admin-token";

export function getAdminToken() {
  if (typeof sessionStorage === "undefined") return "";
  return sessionStorage.getItem(adminTokenStorageKey) || "";
}

export function setAdminToken(value: string) {
  if (typeof sessionStorage === "undefined") return;
  const token = value.trim();
  if (token) {
    sessionStorage.setItem(adminTokenStorageKey, token);
  } else {
    sessionStorage.removeItem(adminTokenStorageKey);
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const adminToken = getAdminToken();
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { "X-Admin-Token": adminToken } : {}),
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
  getRoles: () => request<RoleStore>("/api/roles"),
  createRole: (role: Partial<AgentConfig>) =>
    request<RoleStore>("/api/roles", {
      method: "POST",
      body: JSON.stringify(role)
    }),
  updateRole: (roleId: string, role: Partial<AgentConfig>) =>
    request<RoleStore>(`/api/roles/${roleId}`, {
      method: "PUT",
      body: JSON.stringify(role)
    }),
  deleteRole: (roleId: string) =>
    request<RoleStore>(`/api/roles/${roleId}`, {
      method: "DELETE"
    }),
  selectRole: (roleId: string) =>
    request<RoleStore>(`/api/roles/${roleId}/select`, {
      method: "PUT"
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
  listConversations: () => request<{ conversations: ConversationSummary[] }>("/api/conversations"),
  createConversation: (options: { title?: string; roleId?: string } = {}) =>
    request<Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify(options)
    }),
  deleteConversation: (conversationId: string) =>
    request<{ ok: true }>(`/api/conversations/${conversationId}`, {
      method: "DELETE"
    }),
  setConversationRole: (conversationId: string, roleId: string) =>
    request<Conversation>(`/api/conversations/${conversationId}/role`, {
      method: "PUT",
      body: JSON.stringify({ roleId })
    }),
  getConversation: (conversationId = "default") => request<Conversation>(`/api/conversations/${conversationId}`),
  chat: (message: string, mode = "normal", useWebSearch = false, conversationId = "default") =>
    request<ChatResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, mode, useWebSearch, conversationId })
    }),
  streamChat: async (message: string, mode = "normal", useWebSearch = false, conversationId = "default", onEvent: (event: string, data: unknown) => void) => {
    const adminToken = getAdminToken();
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(adminToken ? { "X-Admin-Token": adminToken } : {})
      },
      body: JSON.stringify({ message, mode, useWebSearch, conversationId })
    });
    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.message || "流式请求失败。");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const rawEvent of events) {
        emitStreamEvent(rawEvent, onEvent);
      }
    }
    if (buffer.trim()) emitStreamEvent(buffer, onEvent);
  },
  webSearch: (query: string, limit = 5) =>
    request<WebSearchResponse>("/api/web-search", {
      method: "POST",
      body: JSON.stringify({ query, limit })
    }),
  getMemory: () => request<MemoryState>("/api/memory"),
  commitMemory: (items: MemoryItem[]) =>
    request<{ items: MemoryItem[]; rawPath: string }>("/api/memory/commit", {
      method: "POST",
      body: JSON.stringify({ items })
    }),
  updateMemoryItem: (memoryId: string, patch: Partial<MemoryItem>) =>
    request<{ items: MemoryItem[]; item: MemoryItem }>(`/api/memory/${memoryId}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  deleteMemoryItem: (memoryId: string) =>
    request<{ items: MemoryItem[] }>(`/api/memory/${memoryId}`, {
      method: "DELETE"
    }),
  organizeMemory: () =>
    request<{ items: MemoryItem[]; markdown: string; mode: string }>("/api/memory/organize", {
      method: "POST",
      body: JSON.stringify({})
    })
};

function emitStreamEvent(rawEvent: string, onEvent: (event: string, data: unknown) => void) {
  const lines = rawEvent.split("\n");
  const event = lines.find((line) => line.startsWith("event: "))?.slice(7) || "message";
  const dataLine = lines.find((line) => line.startsWith("data: "));
  if (!dataLine) return;
  onEvent(event, JSON.parse(dataLine.slice(6)));
}
