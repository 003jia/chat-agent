export const seedConversation = {
  id: "default",
  title: "产品策略讨论",
  roleId: "role-default",
  starred: false,
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

export function createSeedConversation(conversationId = "default", roleId = "role-default") {
  const now = new Date().toISOString();
  return {
    ...seedConversation,
    id: conversationId,
    title: conversationId === "default" ? seedConversation.title : "新对话",
    roleId,
    starred: false,
    createdAt: now,
    updatedAt: now,
    messages:
      conversationId === "default"
        ? seedConversation.messages.map((message) => ({
            ...message,
            timestamp: now,
            memoryRefs: [...message.memoryRefs],
            candidateMemoryIds: [...message.candidateMemoryIds]
          }))
        : []
  };
}

export function normalizeConversation(conversation, fallback = {}) {
  const source = conversation && typeof conversation === "object" ? conversation : fallback;
  const now = new Date().toISOString();
  return {
    ...source,
    id: String(source.id || fallback.id || "default"),
    title: String(source.title || "新对话").trim().slice(0, 80) || "新对话",
    roleId: String(source.roleId || fallback.roleId || "role-default"),
    starred: Boolean(source.starred),
    createdAt: source.createdAt || fallback.createdAt || now,
    updatedAt: source.updatedAt || fallback.updatedAt || now,
    messages: Array.isArray(source.messages) ? source.messages : []
  };
}

export function summarizeConversation(conversation) {
  const normalized = normalizeConversation(conversation);
  return {
    id: normalized.id,
    title: normalized.title,
    roleId: normalized.roleId,
    starred: normalized.starred,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    messageCount: normalized.messages.length
  };
}

export function searchConversationMessages(conversations, query, limit = 50) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return [];
  const boundedLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const results = [];
  for (const rawConversation of conversations || []) {
    const conversation = normalizeConversation(rawConversation);
    const titleMatches = conversation.title.toLowerCase().includes(normalizedQuery);
    for (const message of conversation.messages) {
      const content = String(message.content || "");
      if (!titleMatches && !content.toLowerCase().includes(normalizedQuery)) continue;
      results.push({
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        messageId: String(message.id || ""),
        role: message.role === "user" ? "user" : "assistant",
        snippet: createSearchSnippet(content, normalizedQuery),
        timestamp: message.timestamp || conversation.updatedAt
      });
    }
  }
  return results
    .sort((left, right) => (left.timestamp < right.timestamp ? 1 : -1))
    .slice(0, boundedLimit);
}

export function renderConversationExport(conversation, format = "markdown") {
  const normalized = normalizeConversation(conversation);
  const exportFormat = String(format || "markdown").toLowerCase();
  if (exportFormat === "json") {
    return `${JSON.stringify(normalized, null, 2)}\n`;
  }
  if (exportFormat === "txt" || exportFormat === "text") {
    const lines = [normalized.title, "=".repeat(Math.max(4, normalized.title.length)), ""];
    for (const message of normalized.messages) {
      lines.push(`${message.role === "user" ? "用户" : "智能体"} · ${message.timestamp || ""}`.trim());
      lines.push(String(message.content || "").trim(), "");
    }
    return `${lines.join("\n").trim()}\n`;
  }
  const lines = [`# ${normalized.title}`, ""];
  for (const message of normalized.messages) {
    lines.push(`## ${message.role === "user" ? "用户" : "智能体"}`);
    if (message.timestamp) lines.push(`_${message.timestamp}_`);
    lines.push("", String(message.content || "").trim(), "");
  }
  return `${lines.join("\n").trim()}\n`;
}

function createSearchSnippet(content, query) {
  const compact = String(content || "").replace(/\s+/g, " ").trim();
  if (compact.length <= 180) return compact;
  const index = compact.toLowerCase().indexOf(query);
  const start = Math.max(0, index < 0 ? 0 : index - 60);
  const end = Math.min(compact.length, start + 180);
  return `${start > 0 ? "..." : ""}${compact.slice(start, end)}${end < compact.length ? "..." : ""}`;
}
