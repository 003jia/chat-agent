import { describe, expect, it } from "vitest";
import { commitMemoryItems, generateCandidatesFromMessages, mergeCandidateMemories, selectRelevantMemories, tokenizeMemoryText } from "./memory.mjs";

describe("selectRelevantMemories", () => {
  it("only returns memories that match at least one keyword", () => {
    const memories = [
      { id: "a", content: "TypeScript 项目使用本地 Express 后端", type: "project_fact", level: "high", status: "active" },
      { id: "b", content: "偏好简短回复", type: "user_preference", level: "low", status: "active" },
      { id: "c", content: "禁用内容", type: "project_fact", level: "high", status: "disabled" },
      { id: "d", content: "后端使用 Express 5", type: "project_fact", level: "medium", status: "active" }
    ];

    const result = selectRelevantMemories("TypeScript Express", memories, false);

    expect(result.map((item) => item.id)).toEqual(["a", "d"]);
    expect(result.some((item) => item.id === "b")).toBe(false);
  });

  it("tokenizes CJK text so related Chinese memories can be recalled", () => {
    const memories = [
      { id: "theme", content: "用户喜欢深色主题界面", type: "user_preference", level: "medium", status: "active", updatedAt: "2026-07-08T00:00:00.000Z" },
      { id: "api", content: "模型 API Key 使用环境变量", type: "project_fact", level: "medium", status: "active", updatedAt: "2026-07-08T00:00:00.000Z" }
    ];

    const result = selectRelevantMemories("给我一些配色建议", memories, false);

    expect(Array.from(tokenizeMemoryText("深色主题"))).toContain("色");
    expect(result.map((item) => item.id)).toContain("theme");
    expect(result.map((item) => item.id)).not.toContain("api");
  });

  it("keeps a small resident bucket for high-priority user preferences", () => {
    const memories = [
      { id: "language", content: "始终使用中文回复", type: "user_preference", level: "high", status: "active", updatedAt: "2026-07-08T00:00:00.000Z" },
      { id: "api", content: "模型 API Key 使用环境变量", type: "project_fact", level: "medium", status: "active", updatedAt: "2026-07-08T00:00:00.000Z" }
    ];

    const result = selectRelevantMemories("今天的天气如何", memories, false);

    expect(result.map((item) => item.id)).toEqual(["language"]);
  });

  it("uses the strict retrieval limit", () => {
    const memories = Array.from({ length: 8 }, (_item, index) => ({
      id: String(index),
      content: `memory ${index}`,
      type: "project_fact",
      level: "medium",
      status: "active"
    }));

    expect(selectRelevantMemories("memory", memories, true)).toHaveLength(5);
  });
});

describe("memory candidate structure", () => {
  it("persists candidates without duplicating existing active memories", () => {
    const existing = [
      { id: "theme", content: "用户喜欢深色主题", type: "user_preference", level: "medium", status: "active", updatedAt: "2026-07-08T00:00:00.000Z" }
    ];
    const merged = mergeCandidateMemories(existing, [
      { id: "candidate-theme", content: "用户喜欢深色主题", type: "user_preference", level: "medium", status: "candidate", updatedAt: "2026-07-08T00:00:00.000Z" }
    ]);
    const candidate = merged.find((item) => item.id === "candidate-theme");

    expect(candidate.op).toBe("update");
    expect(candidate.targetId).toBe("theme");
  });

  it("commits update candidates into the target memory", () => {
    const existing = [
      { id: "theme", content: "用户喜欢浅色主题", type: "user_preference", level: "medium", status: "active", updatedAt: "2026-07-01T00:00:00.000Z" },
      { id: "candidate-theme", content: "用户改为喜欢深色主题", type: "user_preference", level: "high", status: "candidate", op: "update", targetId: "theme", updatedAt: "2026-07-08T00:00:00.000Z" }
    ];
    const result = commitMemoryItems(existing, [existing[1]], "2026-07-08T00:00:00.000Z");
    const updated = result.items.find((item) => item.id === "theme");

    expect(updated.content).toBe("用户改为喜欢深色主题");
    expect(updated.level).toBe("high");
    expect(result.items.some((item) => item.id === "candidate-theme")).toBe(false);
  });
});

describe("generateCandidatesFromMessages", () => {
  it("extracts candidates only from user messages", () => {
    const candidates = generateCandidatesFromMessages([
      { role: "assistant", content: "以后记住 API 密钥应该进入长期记忆" },
      { role: "user", content: "你好，普通闲聊。" }
    ]);

    expect(candidates).toEqual([]);
  });

  it("creates preference candidates from stable user preference text", () => {
    const candidates = generateCandidatesFromMessages([
      { role: "user", content: "以后请记住，我偏好先给计划再执行。" }
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      type: "user_preference",
      level: "medium",
      source: "chat",
      status: "candidate"
    });
  });
});
