import { describe, expect, it } from "vitest";
import { attachMemoryEmbedding, commitMemoryItems, createLocalOrganizeCandidates, generateCandidatesFromMessages, mergeCandidateMemories, needsMemoryEmbedding, normalizeMemoryItem, selectRelevantMemories, tokenizeMemoryText } from "./memory.mjs";

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
    expect(result[0].retrieval.resident).toBe(true);
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

  it("recalls a semantically similar memory without keyword overlap", () => {
    const embedded = attachMemoryEmbedding({
      id: "theme",
      content: "用户偏好深色主题",
      type: "user_preference",
      level: "medium",
      status: "active"
    }, [1, 0], "test-embedding");
    const unrelated = attachMemoryEmbedding({
      id: "api",
      content: "API Key 使用环境变量",
      type: "project_fact",
      level: "medium",
      status: "active"
    }, [0, 1], "test-embedding");

    const result = selectRelevantMemories("界面风格建议", [embedded, unrelated], false, {
      queryEmbedding: [0.98, 0.02],
      embeddingModel: "test-embedding",
      semanticThreshold: 0.8
    });

    expect(result.map((item) => item.id)).toEqual(["theme"]);
    expect(result[0].retrieval.mode).toBe("semantic");
    expect(result[0].retrieval.semanticSimilarity).toBeGreaterThan(0.99);
  });

  it("invalidates a cached embedding when memory content changes", () => {
    const embedded = attachMemoryEmbedding({
      id: "theme",
      content: "用户偏好深色主题",
      type: "user_preference",
      level: "medium",
      status: "active"
    }, [1, 0], "test-embedding");
    const changed = normalizeMemoryItem({ ...embedded, content: "用户改为偏好浅色主题" });

    expect(changed.embedding).toBeUndefined();
    expect(needsMemoryEmbedding(changed, "test-embedding")).toBe(true);
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

  it("commits disable candidates by disabling the target memory", () => {
    const existing = [
      { id: "old-theme", content: "用户喜欢浅色主题", type: "user_preference", level: "medium", status: "active", updatedAt: "2026-07-01T00:00:00.000Z" },
      { id: "candidate-disable", content: "重复或过期", type: "user_preference", level: "medium", status: "candidate", op: "disable", targetId: "old-theme", updatedAt: "2026-07-08T00:00:00.000Z" }
    ];
    const result = commitMemoryItems(existing, [existing[1]], "2026-07-08T00:00:00.000Z");

    expect(result.items.find((item) => item.id === "old-theme").status).toBe("disabled");
    expect(result.items.some((item) => item.id === "candidate-disable")).toBe(false);
  });

  it("creates local organize candidates for near-duplicate memories", () => {
    const candidates = createLocalOrganizeCandidates([
      { id: "a", content: "用户偏好先给计划再执行", type: "user_preference", level: "high", status: "active", updatedAt: "2026-07-08T00:00:00.000Z" },
      { id: "b", content: "用户偏好先计划再执行", type: "user_preference", level: "medium", status: "active", updatedAt: "2026-07-07T00:00:00.000Z" }
    ], "2026-07-09T00:00:00.000Z");

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ op: "disable", targetId: "b", status: "candidate" });
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
