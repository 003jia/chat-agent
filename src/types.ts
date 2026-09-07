export type MemoryLevel = "high" | "medium" | "low";
export type MemoryStatus = "active" | "candidate" | "disabled";
export type ChatRole = "user" | "assistant" | "system";
export type ProviderId = "openai-compatible" | "openai" | "deepseek" | "codex" | "anthropic";

export interface AgentConfig {
  id: string;
  name: string;
  roleTitle: string;
  roleDescription: string;
  avatar?: string;
  accentColor?: string;
  backgroundImage?: string;
  backgroundMime?: "image/jpeg" | "image/png" | "image/webp";
  backgroundUpdatedAt?: string;
  personalityTone?: string;
  greeting?: string;
  capabilityIds?: string[];
  quickPrompts?: string[];
  builtIn?: boolean;
  language: "zh" | "en";
  temperature: number;
  behavior: {
    proactiveFollowup: boolean;
    citeMemory: boolean;
    autoSaveNotes: boolean;
    strictRetrieval: boolean;
  };
}

export interface RoleStore {
  selectedRoleId: string;
  roles: AgentConfig[];
}

export interface ExpertTeam {
  id: string;
  name: string;
  goal: string;
  enabled: boolean;
  leadRoleId: string | null;
  memberRoleIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ExpertTeamStore {
  selectedTeamId: string | null;
  teams: ExpertTeam[];
}

export interface ModelProviderConfig {
  id: ProviderId;
  label: string;
  baseURL: string;
  apiKey: string;
  apiKeySet?: boolean;
  apiKeySource?: "env" | "file" | "none";
  apiKeyPreview?: string;
  model: string;
  embeddingModel?: string;
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
  roleId: string;
  starred: boolean;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  roleId: string;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ConversationSearchResult {
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  role: "user" | "assistant";
  snippet: string;
  timestamp: string;
}

export interface MemoryItem {
  id: string;
  content: string;
  type: string;
  level: MemoryLevel;
  source: string;
  createdAt?: string;
  updatedAt: string;
  status: MemoryStatus;
  op?: "add" | "update" | "disable" | "noop";
  targetId?: string;
  keywords?: string[];
  hash?: string;
  accessCount?: number;
  lastAccessedAt?: string;
  supersedes?: string[];
  supersededBy?: string;
  confidence?: number;
  reason?: string;
  embedding?: number[];
  embeddingModel?: string;
  embeddingHash?: string;
  embeddingUpdatedAt?: string;
  retrieval?: {
    score: number | null;
    keywordHits: number | null;
    resident: boolean;
    semanticSimilarity?: number | null;
    mode?: "resident" | "keyword" | "semantic" | "hybrid";
  };
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

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface WebSearchResponse {
  query: string;
  source: string;
  fetchedAt: string;
  results: WebSearchResult[];
}

export type ToolPermission = "read" | "write" | "external";
export type ToolCategory = "work" | "coding";
export type TaskStatus = "waiting_approval" | "running" | "completed" | "failed" | "cancelled";

export interface AgentTool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  permission: ToolPermission;
  inputSchema: {
    type: "object";
    required?: string[];
    additionalProperties?: boolean;
    properties: Record<string, {
      type: "string" | "integer";
      minLength?: number;
      maxLength?: number;
      minimum?: number;
      maximum?: number;
      preserveWhitespace?: boolean;
    }>;
  };
}

export interface ToolTaskStep {
  id: string;
  toolId: string;
  title: string;
  permission: ToolPermission;
  status: TaskStatus;
  input: Record<string, unknown>;
  result?: {
    summary: string;
    data: unknown;
  };
  error?: ApiWarning;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentTask {
  id: string;
  title: string;
  objective: string;
  conversationId: string;
  roleId?: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  steps: ToolTaskStep[];
}

export interface ApiWarning {
  code: string;
  message: string;
}

export interface ChatResponse {
  conversation: Conversation;
  reply: ChatMessage;
  relevantMemories: MemoryItem[];
  candidates: MemoryItem[];
  candidateExtractionPending?: boolean;
  webSearch?: WebSearchResponse | null;
  webSearchError?: ApiWarning | null;
  candidateExtractionError?: ApiWarning | null;
}
