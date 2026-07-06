export type MemoryLevel = "high" | "medium" | "low";
export type MemoryStatus = "active" | "candidate" | "disabled";
export type ChatRole = "user" | "assistant" | "system";
export type ProviderId = "openai-compatible" | "openai" | "deepseek" | "anthropic";

export interface AgentConfig {
  name: string;
  roleTitle: string;
  roleDescription: string;
  language: "zh" | "en";
  temperature: number;
  behavior: {
    proactiveFollowup: boolean;
    citeMemory: boolean;
    autoSaveNotes: boolean;
    strictRetrieval: boolean;
  };
}

export interface ModelProviderConfig {
  id: ProviderId;
  label: string;
  baseURL: string;
  apiKey: string;
  apiKeySet?: boolean;
  model: string;
  contextLength: number;
  status: "missing" | "ready" | "error";
}

export interface ModelConfig {
  selectedProvider: ProviderId;
  providers: Record<ProviderId, ModelProviderConfig>;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  memoryRefs: string[];
  candidateMemoryIds: string[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryItem {
  id: string;
  content: string;
  type: string;
  level: MemoryLevel;
  source: string;
  updatedAt: string;
  status: MemoryStatus;
}

export interface MemoryState {
  items: MemoryItem[];
  markdown: string;
  stats: {
    loaded: number;
    candidates: number;
    editedMinutesAgo: number;
  };
}
