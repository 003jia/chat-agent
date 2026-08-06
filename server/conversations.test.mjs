import { describe, expect, it } from "vitest";
import { normalizeConversation, renderConversationExport, searchConversationMessages, summarizeConversation } from "./conversations.mjs";

const sample = {
  id: "conv-1",
  title: "项目讨论",
  roleId: "role-default",
  starred: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  messages: [
    { id: "m1", role: "user", content: "请先制定实施计划", timestamp: "2026-08-01T01:00:00.000Z" },
    { id: "m2", role: "assistant", content: "已整理三步计划", timestamp: "2026-08-01T01:01:00.000Z" }
  ]
};

describe("conversation utilities", () => {
  it("normalizes and summarizes starred conversations", () => {
    const normalized = normalizeConversation({ ...sample, title: "  项目讨论  " });
    expect(normalized.title).toBe("项目讨论");
    expect(summarizeConversation(normalized)).toMatchObject({ starred: true, messageCount: 2 });
  });

  it("searches message content and returns bounded snippets", () => {
    const results = searchConversationMessages([sample], "实施计划", 10);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ conversationId: "conv-1", messageId: "m1", role: "user" });
    expect(results[0].snippet).toContain("实施计划");
  });

  it("exports markdown, text and JSON without configuration data", () => {
    expect(renderConversationExport(sample, "markdown")).toContain("# 项目讨论");
    expect(renderConversationExport(sample, "txt")).toContain("用户 · 2026-08-01");
    expect(JSON.parse(renderConversationExport(sample, "json")).messages).toHaveLength(2);
    expect(renderConversationExport(sample, "markdown")).not.toContain("apiKey");
  });
});
