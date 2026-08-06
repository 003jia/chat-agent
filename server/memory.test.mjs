import { describe, expect, it } from "vitest";
import { attachMemoryEmbedding, commitMemoryItems, createLocalOrganizeCandidates, generateCandidatesFromMessages, hydrateMemoryEmbeddings, mergeCandidateMemories, needsMemoryEmbedding, normalizeMemoryItem, purgeDeletedMemoryItems, selectConflictContext, selectRelevantMemories, softDeleteMemoryItem, splitMemoryEmbeddings, tokenizeMemoryText } from "./memory.mjs";

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

  it("boosts frequently accessed memories when other signals tie", () => {
    const recent = "2026-07-08T00:00:00.000Z";
    const cold = { id: "cold", content: "后端使用 Express", type: "project_fact", level: "medium", status: "active", updatedAt: recent, accessCount: 0 };
    const hot = { id: "hot", content: "后端使用 Fastify", type: "project_fact", level: "medium", status: "active", updatedAt: recent, accessCount: 12 };

    const result = selectRelevantMemories("后端", [cold, hot], false);

    expect(result.map((item) => item.id)[0]).toBe("hot");
  });

  it("deduplicates near-duplicate memories in the returned set", () => {
    const recent = "2026-07-08T00:00:00.000Z";
    const memories = [
      { id: "dup-a", content: "用户偏好深色主题界面", type: "user_preference", level: "medium", status: "active", updatedAt: recent },
      { id: "dup-b", content: "用户偏好深色主题界面", type: "user_preference", level: "medium", status: "active", updatedAt: recent },
      { id: "dup-c", content: "用户偏好深色主题", type: "user_preference", level: "medium", status: "active", updatedAt: recent },
      { id: "distinct", content: "项目使用 Express 后端", type: "project_fact", level: "medium", status: "active", updatedAt: recent }
    ];

    const result = selectRelevantMemories("深色主题 Express", memories, false);
    const ids = result.map((item) => item.id);

    const dupCount = ids.filter((id) => id.startsWith("dup-")).length;
    expect(dupCount).toBeLessThanOrEqual(1);
    expect(ids).toContain("distinct");
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

describe("generateCandidatesFromMessages", () => {  it("extracts candidates only from user messages", () => {
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

describe("embedding sidecar split and hydrate", () => {
  it("moves embeddings out of the index and restores them on hydrate", () => {
    const embedded = attachMemoryEmbedding({
      id: "theme",
      content: "用户偏好深色主题",
      type: "user_preference",
      level: "medium",
      status: "active"
    }, [0.5, 0.5], "test-embedding");
    const plain = normalizeMemoryItem({ id: "plain", content: "项目使用 Express 后端", type: "project_fact", level: "medium", status: "active" });

    const { items, embeddings } = splitMemoryEmbeddings([embedded, plain]);

    expect(items.find((item) => item.id === "theme").embedding).toBeUndefined();
    expect(items.find((item) => item.id === "theme").embeddingModel).toBeUndefined();
    expect(embeddings.theme).toMatchObject({ embeddingModel: "test-embedding", embeddingHash: embedded.hash });
    expect(embeddings.theme.embedding).toEqual([0.5, 0.5]);
    expect(embeddings.plain).toBeUndefined();

    const hydrated = hydrateMemoryEmbeddings(items, embeddings);
    const restored = hydrated.find((item) => item.id === "theme");

    expect(restored.embedding).toEqual([0.5, 0.5]);
    expect(restored.embeddingModel).toBe("test-embedding");
    expect(needsMemoryEmbedding(restored, "test-embedding")).toBe(false);
  });

  it("drops a sidecar embedding whose hash no longer matches the memory content", () => {
    const embedded = attachMemoryEmbedding({
      id: "theme",
      content: "用户偏好深色主题",
      type: "user_preference",
      level: "medium",
      status: "active"
    }, [1, 0], "test-embedding");
    const { embeddings } = splitMemoryEmbeddings([embedded]);
    const rewritten = normalizeMemoryItem({ ...embedded, embedding: undefined, content: "用户改为偏好浅色主题" });

    const hydrated = hydrateMemoryEmbeddings([rewritten], embeddings);

    expect(hydrated[0].embedding).toBeUndefined();
    expect(needsMemoryEmbedding(hydrated[0], "test-embedding")).toBe(true);
  });
});

describe("selectConflictContext", () => {
  it("fills the conflict budget with the most relevant memories even without keyword overlap", () => {
    const recent = "2026-07-08T00:00:00.000Z";
    const memories = [
      { id: "theme", content: "用户偏好深色主题", type: "user_preference", level: "high", status: "active", updatedAt: recent },
      { id: "plan", content: "用户偏好先计划再执行", type: "user_preference", level: "medium", status: "active", updatedAt: recent },
      { id: "express", content: "项目使用 Express 后端", type: "project_fact", level: "low", status: "active", updatedAt: recent },
      { id: "candidate", content: "尚未确认的候选记忆", type: "project_fact", level: "high", status: "candidate", updatedAt: recent }
    ];

    const context = selectConflictContext("完全无关的查询内容", memories, 2);

    expect(context).toHaveLength(2);
    expect(context.every((item) => item.status === "active")).toBe(true);
    expect(context.map((item) => item.id)).not.toContain("candidate");
  });

  it("ranks keyword-matching memories ahead of unrelated ones", () => {
    const recent = "2026-07-08T00:00:00.000Z";
    const memories = [
      { id: "express", content: "项目使用 Express 后端", type: "project_fact", level: "low", status: "active", updatedAt: recent },
      { id: "theme", content: "用户偏好深色主题", type: "user_preference", level: "high", status: "active", updatedAt: recent }
    ];

    const context = selectConflictContext("Express 后端换成 Fastify", memories, 2);

    expect(context[0].id).toBe("express");
  });
});

describe("soft delete and purge", () => {
  it("marks a memory as deleted instead of dropping the record", () => {
    const items = [
      normalizeMemoryItem({ id: "keep", content: "保留的记忆", type: "project_fact", level: "medium", status: "active" }),
      normalizeMemoryItem({ id: "gone", content: "要删除的记忆", type: "project_fact", level: "medium", status: "active" })
    ];

    const result = softDeleteMemoryItem(items, "gone", "2026-07-31T00:00:00.000Z");

    expect(result.found).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.item.status).toBe("deleted");
    expect(result.item.updatedAt).toBe("2026-07-31T00:00:00.000Z");
    expect(result.items.find((item) => item.id === "keep").status).toBe("active");
  });

  it("reports not found for an unknown memory id", () => {
    const items = [normalizeMemoryItem({ id: "keep", content: "保留的记忆", type: "project_fact", level: "medium", status: "active" })];

    expect(softDeleteMemoryItem(items, "missing").found).toBe(false);
  });

  it("purges only deleted memories and clears dangling supersededBy pointers", () => {
    const items = [
      normalizeMemoryItem({ id: "keep", content: "保留的记忆", type: "project_fact", level: "medium", status: "active", supersededBy: "gone" }),
      normalizeMemoryItem({ id: "gone", content: "要删除的记忆", type: "project_fact", level: "medium", status: "deleted" }),
      normalizeMemoryItem({ id: "off", content: "被禁用的记忆", type: "project_fact", level: "medium", status: "disabled" })
    ];

    const result = purgeDeletedMemoryItems(items);

    expect(result.purged).toBe(1);
    expect(result.items.map((item) => item.id).sort()).toEqual(["keep", "off"]);
    expect(result.items.find((item) => item.id === "keep").supersededBy).toBeUndefined();
  });

  it("never retrieves a deleted memory", () => {
    const memories = [
      { id: "gone", content: "项目使用 Express 后端", type: "project_fact", level: "high", status: "deleted", updatedAt: "2026-07-08T00:00:00.000Z" },
      { id: "live", content: "项目使用 Express 后端做接口", type: "project_fact", level: "medium", status: "active", updatedAt: "2026-07-08T00:00:00.000Z" }
    ];

    const result = selectRelevantMemories("Express", memories, false);

    expect(result.map((item) => item.id)).toEqual(["live"]);
  });
});
