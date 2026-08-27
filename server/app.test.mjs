import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { createApp } from "./app.mjs";

const tempRoots = [];
const testServers = [];

afterEach(async () => {
  await Promise.all(testServers.splice(0).map((server) => server.waitForBackgroundTasks?.()));
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("createApp API smoke", () => {
  it("returns readiness from /api/health", async () => {
    const server = await createTestApp();
    const response = await invokeApp(server.app, { method: "GET", url: "/api/health" });

    expect(response.status).toBe(200);
    expect(response.json).toEqual({
      ok: true,
      readiness: {
        dataStore: true,
        config: true,
        memory: true
      }
    });
  });

  it("reports readiness failure when config is invalid", async () => {
    const server = await createTestApp();
    await writeFile(path.join(server.paths.configDir, "roles.json"), "{bad json", "utf8");
    const response = await invokeApp(server.app, { method: "GET", url: "/api/health" });

    expect(response.status).toBe(503);
    expect(response.json.code).toBe("READINESS_FAILED");
    expect(response.json.readiness.config).toBe(false);
  });

  it("allows whitelisted origins and rejects unlisted origins", async () => {
    const server = await createTestApp();
    const allowed = await invokeApp(server.app, {
      method: "GET",
      url: "/api/health",
      headers: { Origin: "http://127.0.0.1:5173" }
    });
    const rejected = await invokeApp(server.app, {
      method: "GET",
      url: "/api/health",
      headers: { Origin: "http://evil.test" }
    });

    expect(allowed.status).toBe(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
    expect(rejected.status).toBe(403);
    expect(rejected.json.code).toBe("CORS_FORBIDDEN");
  });

  it("requires admin token for chat and memory writes", async () => {
    const server = await createTestApp();
    const chat = await invokeApp(server.app, {
      method: "POST",
      url: "/api/chat",
      body: { message: "hello" }
    });
    const commit = await invokeApp(server.app, {
      method: "POST",
      url: "/api/memory/commit",
      body: { items: [] }
    });

    expect(chat.status).toBe(401);
    expect(chat.json.code).toBe("AUTH_REQUIRED");
    expect(commit.status).toBe(401);
    expect(commit.json.code).toBe("AUTH_REQUIRED");
  });

  it("rejects overlong chat messages before model calls", async () => {
    const server = await createTestApp();
    const response = await invokeApp(server.app, {
      method: "POST",
      url: "/api/chat",
      headers: { "X-Admin-Token": "secret" },
      body: { message: "x".repeat(8001) }
    });

    expect(response.status).toBe(400);
    expect(response.json.code).toBe("VALIDATION_ERROR");
  });

  it("returns a mock chat response without calling a real provider", async () => {
    const server = await createTestApp();
    const response = await invokeApp(server.app, {
      method: "POST",
      url: "/api/chat",
      headers: { "X-Admin-Token": "secret" },
      body: { message: "以后请记住我偏好先计划再执行。" }
    });

    expect(response.status).toBe(200);
    expect(response.json.reply.content).toBe("mock reply");
    expect(response.json.candidates).toEqual([]);
    expect(response.json.candidateExtractionPending).toBe(true);
    expect(response.json.conversation.messages.at(-1).role).toBe("assistant");
  });

  it("uses semantic memory retrieval and caches embeddings when configured", async () => {
    const server = await createTestApp({
      modelClient: {
        callModel: async () => "semantic reply",
        callEmbeddings: async (_provider, inputs) => inputs.map((input) => String(input).includes("界面") ? [1, 0] : [0.99, 0.01]),
        extractCandidatesWithModel: async () => ({ candidates: [], error: null })
      }
    });
    const modelsPath = path.join(server.paths.configDir, "models.json");
    const modelConfig = JSON.parse(await readFile(modelsPath, "utf8"));
    modelConfig.providers["openai-compatible"].embeddingModel = "test-embedding";
    await writeFile(modelsPath, `${JSON.stringify(modelConfig, null, 2)}\n`, "utf8");
    await writeFile(path.join(server.paths.memoryDir, "index.json"), JSON.stringify([{
      id: "theme-memory",
      content: "用户喜欢深色主题",
      type: "user_preference",
      level: "medium",
      source: "test",
      status: "active",
      updatedAt: "2026-07-08T00:00:00.000Z"
    }]), "utf8");

    const response = await invokeApp(server.app, {
      method: "POST",
      url: "/api/chat",
      headers: { "X-Admin-Token": "secret" },
      body: { message: "给我一些界面风格建议" }
    });
    const saved = JSON.parse(await readFile(path.join(server.paths.memoryDir, "embeddings.json"), "utf8"));

    expect(response.status).toBe(200);
    expect(response.json.relevantMemories.map((item) => item.id)).toContain("theme-memory");
    expect(response.json.relevantMemories[0].retrieval.mode).toBe("semantic");
    expect(saved["theme-memory"].embeddingModel).toBe("test-embedding");
    expect(saved["theme-memory"].embedding).toEqual([0.99, 0.01]);
  });

  it("falls back to keyword retrieval when embedding calls fail", async () => {
    const server = await createTestApp({
      modelClient: {
        callModel: async () => "fallback reply",
        callEmbeddings: async () => {
          throw new Error("embedding unavailable");
        },
        extractCandidatesWithModel: async () => ({ candidates: [], error: null })
      }
    });
    const modelsPath = path.join(server.paths.configDir, "models.json");
    const modelConfig = JSON.parse(await readFile(modelsPath, "utf8"));
    modelConfig.providers["openai-compatible"].embeddingModel = "test-embedding";
    await writeFile(modelsPath, `${JSON.stringify(modelConfig, null, 2)}\n`, "utf8");
    await writeFile(path.join(server.paths.memoryDir, "index.json"), JSON.stringify([{
      id: "express-memory",
      content: "项目后端使用 Express",
      type: "project_fact",
      level: "medium",
      source: "test",
      status: "active"
    }]), "utf8");

    const response = await invokeApp(server.app, {
      method: "POST",
      url: "/api/chat",
      headers: { "X-Admin-Token": "secret" },
      body: { message: "Express 后端怎么调整" }
    });

    expect(response.status).toBe(200);
    expect(response.json.reply.content).toBe("fallback reply");
    expect(response.json.relevantMemories.map((item) => item.id)).toContain("express-memory");
    expect(response.json.relevantMemories[0].retrieval.mode).toBe("keyword");
  });

  it("generates an embedding cache after an active memory is committed", async () => {
    const server = await createTestApp({
      modelClient: {
        callEmbeddings: async (_provider, inputs) => inputs.map(() => [0.5, 0.5])
      }
    });
    const modelsPath = path.join(server.paths.configDir, "models.json");
    const modelConfig = JSON.parse(await readFile(modelsPath, "utf8"));
    modelConfig.providers["openai-compatible"].embeddingModel = "test-embedding";
    await writeFile(modelsPath, `${JSON.stringify(modelConfig, null, 2)}\n`, "utf8");

    const committed = await invokeApp(server.app, {
      method: "POST",
      url: "/api/memory/commit",
      headers: { "X-Admin-Token": "secret" },
      body: {
        items: [{
          id: "new-memory",
          content: "项目使用液态玻璃界面",
          type: "project_fact",
          level: "medium",
          source: "test",
          status: "candidate"
        }]
      }
    });
    await server.waitForBackgroundTasks();
    const saved = JSON.parse(await readFile(path.join(server.paths.memoryDir, "embeddings.json"), "utf8"));
    const item = saved["new-memory"];

    expect(committed.status).toBe(200);
    expect(item.embedding).toEqual([0.5, 0.5]);
    expect(item.embeddingModel).toBe("test-embedding");
    const index = JSON.parse(await readFile(path.join(server.paths.memoryDir, "index.json"), "utf8"));
    expect(item.embeddingHash).toBe(index.find((memory) => memory.id === "new-memory").hash);
  });

  it("streams message.done before memory candidate extraction completes", async () => {
    const server = await createTestApp();
    const response = await invokeApp(server.app, {
      method: "POST",
      url: "/api/chat/stream",
      headers: { "X-Admin-Token": "secret" },
      body: { message: "以后请记住我偏好先计划再执行。" }
    });

    expect(response.status).toBe(200);
    expect(response.text).toContain("event: message.delta");
    expect(response.text).toContain("event: message.done");
    expect(response.text).toContain("event: memory.candidates");
    expect(response.text.indexOf("event: message.done")).toBeLessThan(response.text.indexOf("event: memory.candidates"));
  });

  it("persists streamed memory candidates and allows rejecting one", async () => {
    const server = await createTestApp();
    const headers = { "X-Admin-Token": "secret" };
    await invokeApp(server.app, {
      method: "POST",
      url: "/api/chat/stream",
      headers,
      body: { message: "以后请记住我偏好先计划再执行。" }
    });
    const memory = await invokeApp(server.app, { method: "GET", url: "/api/memory", headers });
    const candidate = memory.json.items.find((item) => item.id === "candidate-test");

    expect(candidate.status).toBe("candidate");

    const rejected = await invokeApp(server.app, {
      method: "PATCH",
      url: "/api/memory/candidate-test",
      headers,
      body: { status: "disabled" }
    });

    expect(rejected.status).toBe(200);
    expect(rejected.json.item.status).toBe("disabled");
  });

  it("does not persist provider API keys when environment keys are configured", async () => {
    const server = await createTestApp();
    const response = await invokeApp(server.app, {
      method: "PUT",
      url: "/api/model-config",
      headers: { "X-Admin-Token": "secret" },
      body: {
        selectedProvider: "openai-compatible",
        providers: {
          "openai-compatible": {
            model: "custom-model",
            apiKey: "new-file-key"
          }
        }
      }
    });
    const saved = JSON.parse(await readFile(path.join(server.paths.configDir, "models.json"), "utf8"));

    expect(response.status).toBe(200);
    expect(response.json.providers["openai-compatible"].apiKeySet).toBe(true);
    expect(saved.providers["openai-compatible"].apiKey).toBe("");
    expect(saved.providers["openai-compatible"].model).toBe("custom-model");
  });

  it("rate-limits protected chat routes", async () => {
    const server = await createTestApp({ rateLimits: { chat: { max: 1, windowMs: 60_000 } } });
    const first = await invokeApp(server.app, { method: "POST", url: "/api/chat", body: { message: "hello" } });
    const second = await invokeApp(server.app, { method: "POST", url: "/api/chat", body: { message: "hello again" } });

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    expect(second.json.code).toBe("RATE_LIMITED");
  });

  it("serializes concurrent memory commits without losing items", async () => {
    const server = await createTestApp();
    const headers = { "X-Admin-Token": "secret" };
    await Promise.all([
      invokeApp(server.app, {
        method: "POST",
        url: "/api/memory/commit",
        headers,
        body: { items: [{ id: "memory-a", content: "Alpha memory", type: "project_fact", level: "medium", source: "test", status: "candidate" }] }
      }),
      invokeApp(server.app, {
        method: "POST",
        url: "/api/memory/commit",
        headers,
        body: { items: [{ id: "memory-b", content: "Beta memory", type: "project_fact", level: "medium", source: "test", status: "candidate" }] }
      })
    ]);
    const memory = await invokeApp(server.app, { method: "GET", url: "/api/memory", headers });
    const ids = memory.json.items.map((item) => item.id);

    expect(ids).toContain("memory-a");
    expect(ids).toContain("memory-b");
  });

  it("organizes memory into review candidates instead of directly overwriting active memory", async () => {
    const server = await createTestApp();
    const headers = { "X-Admin-Token": "secret" };
    await invokeApp(server.app, {
      method: "POST",
      url: "/api/memory/commit",
      headers,
      body: {
        items: [
          { id: "candidate-plan-a", content: "用户偏好先给计划再执行", type: "user_preference", level: "high", source: "test", status: "candidate" },
          { id: "candidate-plan-b", content: "用户偏好先计划再执行", type: "user_preference", level: "medium", source: "test", status: "candidate" }
        ]
      }
    });

    const organized = await invokeApp(server.app, {
      method: "POST",
      url: "/api/memory/organize",
      headers
    });

    expect(organized.status).toBe(200);
    expect(organized.json.mode).toBe("local-dedupe");
    expect(organized.json.candidates.length).toBeGreaterThan(0);
    expect(organized.json.items.find((item) => item.status === "candidate" && item.op === "disable")).toBeTruthy();
  });

  it("supports role preset CRUD and selection", async () => {
    const server = await createTestApp();
    const headers = { "X-Admin-Token": "secret" };
    const created = await invokeApp(server.app, {
      method: "POST",
      url: "/api/roles",
      headers,
      body: { name: "Coach", roleTitle: "教练", roleDescription: "鼓励式反馈" }
    });
    expect(created.status).toBe(201);
    expect(created.json.roles).toHaveLength(3);
    const newRoleId = created.json.roles.find((role) => role.name === "Coach").id;

    const selected = await invokeApp(server.app, {
      method: "PUT",
      url: `/api/roles/${newRoleId}/select`,
      headers
    });
    expect(selected.status).toBe(200);
    expect(selected.json.selectedRoleId).toBe(newRoleId);

    const updated = await invokeApp(server.app, {
      method: "PUT",
      url: `/api/roles/${newRoleId}`,
      headers,
      body: { roleTitle: "首席教练" }
    });
    expect(updated.json.roles.find((role) => role.id === newRoleId).roleTitle).toBe("首席教练");

    const deleted = await invokeApp(server.app, {
      method: "DELETE",
      url: `/api/roles/${newRoleId}`,
      headers
    });
    expect(deleted.status).toBe(200);
    expect(deleted.json.roles.find((role) => role.id === newRoleId)).toBeUndefined();
  });

  it("supports conversation search, metadata updates, and export", async () => {
    const server = await createTestApp();
    const headers = { "X-Admin-Token": "secret" };
    const updated = await invokeApp(server.app, {
      method: "PATCH",
      url: "/api/conversations/default",
      headers,
      body: { title: "置顶项目讨论", starred: true }
    });

    expect(updated.status).toBe(200);
    expect(updated.json).toMatchObject({ title: "置顶项目讨论", starred: true });

    const list = await invokeApp(server.app, { method: "GET", url: "/api/conversations", headers });
    expect(list.json.conversations[0]).toMatchObject({ id: "default", starred: true });

    const search = await invokeApp(server.app, {
      method: "GET",
      url: "/api/conversations/search?q=%E4%B8%B4%E6%97%B6%E6%83%B3%E6%B3%95",
      headers
    });
    expect(search.status).toBe(200);
    expect(search.json.results[0]).toMatchObject({ conversationId: "default", role: "user" });

    const exported = await invokeApp(server.app, {
      method: "GET",
      url: "/api/conversations/default/export?format=markdown",
      headers
    });
    expect(exported.status).toBe(200);
    expect(exported.text).toContain("# 置顶项目讨论");
    expect(exported.headers["content-disposition"]).toContain("attachment");
  });

  it("uploads, serves, and resets a role background image", async () => {
    const server = await createTestApp();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
    const unauthorized = await invokeApp(server.app, {
      method: "PUT",
      url: "/api/roles/role-default/background",
      headers: { "Content-Type": "image/png" },
      body: png
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.json.code).toBe("AUTH_REQUIRED");

    const uploaded = await invokeApp(server.app, {
      method: "PUT",
      url: "/api/roles/role-default/background",
      headers: { "Content-Type": "image/png", "X-Admin-Token": "secret" },
      body: png
    });
    const uploadedRole = uploaded.json.roles.find((role) => role.id === "role-default");
    expect(uploaded.status).toBe(200);
    expect(uploadedRole.backgroundMime).toBe("image/png");
    expect(uploadedRole.backgroundImage).toContain("/api/roles/role-default/background?v=");

    const image = await invokeApp(server.app, {
      method: "GET",
      url: "/api/roles/role-default/background"
    });
    expect(image.status).toBe(200);
    expect(image.headers["content-type"]).toContain("image/png");
    expect(image.body.equals(png)).toBe(true);

    const reset = await invokeApp(server.app, {
      method: "DELETE",
      url: "/api/roles/role-default/background",
      headers: { "X-Admin-Token": "secret" }
    });
    expect(reset.status).toBe(200);
    expect(reset.json.roles.find((role) => role.id === "role-default").backgroundImage).toBeUndefined();

    const missing = await invokeApp(server.app, {
      method: "GET",
      url: "/api/roles/role-default/background"
    });
    expect(missing.status).toBe(404);
    expect(missing.json.code).toBe("BACKGROUND_NOT_FOUND");
  });

  it("creates and updates an expert team with selective role membership", async () => {
    const server = await createTestApp();
    const headers = { "X-Admin-Token": "secret" };
    const created = await invokeApp(server.app, {
      method: "POST",
      url: "/api/teams",
      headers,
      body: {
        name: "研发专家团",
        goal: "完成产品研发",
        enabled: true,
        leadRoleId: "role-expert-team-author",
        memberRoleIds: ["role-default", "role-expert-team-author"]
      }
    });

    expect(created.status).toBe(201);
    expect(created.json.teams).toHaveLength(1);
    const team = created.json.teams[0];
    expect(team.memberRoleIds).toEqual(["role-default", "role-expert-team-author"]);
    expect(team.leadRoleId).toBe("role-expert-team-author");

    const updated = await invokeApp(server.app, {
      method: "PUT",
      url: `/api/teams/${team.id}`,
      headers,
      body: {
        name: "精简研发团",
        goal: "只保留架构角色",
        enabled: false,
        leadRoleId: "role-expert-team-author",
        memberRoleIds: ["role-expert-team-author"]
      }
    });

    expect(updated.status).toBe(200);
    expect(updated.json.teams[0]).toMatchObject({
      name: "精简研发团",
      enabled: false,
      memberRoleIds: ["role-expert-team-author"]
    });
  });

  it("rejects a team whose lead has not joined", async () => {
    const server = await createTestApp();
    const response = await invokeApp(server.app, {
      method: "POST",
      url: "/api/teams",
      headers: { "X-Admin-Token": "secret" },
      body: {
        name: "无效专家团",
        leadRoleId: "role-expert-team-author",
        memberRoleIds: ["role-default"]
      }
    });

    expect(response.status).toBe(400);
    expect(response.json.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a background whose content does not match its image type", async () => {
    const server = await createTestApp();
    const response = await invokeApp(server.app, {
      method: "PUT",
      url: "/api/roles/role-default/background",
      headers: { "Content-Type": "image/png", "X-Admin-Token": "secret" },
      body: Buffer.from("not a png")
    });

    expect(response.status).toBe(400);
    expect(response.json.code).toBe("INVALID_IMAGE");
  });

  it("exposes and protects the built-in expert-team role", async () => {
    const server = await createTestApp();
    const roles = await invokeApp(server.app, { method: "GET", url: "/api/roles", headers: { "X-Admin-Token": "secret" } });
    const expertRole = roles.json.roles.find((role) => role.id === "role-expert-team-author");

    expect(expertRole).toMatchObject({
      name: "专家团架构师",
      builtIn: true,
      capabilityIds: ["expert-team-authoring"]
    });
    expect(expertRole.quickPrompts).toHaveLength(3);

    const deleted = await invokeApp(server.app, {
      method: "DELETE",
      url: "/api/roles/role-expert-team-author",
      headers: { "X-Admin-Token": "secret" }
    });

    expect(deleted.status).toBe(400);
    expect(deleted.json.code).toBe("ROLE_PROTECTED");
  });

  it("supports listing, creating, and switching conversations", async () => {
    const server = await createTestApp();
    const headers = { "X-Admin-Token": "secret" };
    const created = await invokeApp(server.app, {
      method: "POST",
      url: "/api/conversations",
      headers,
      body: { title: "新的讨论" }
    });
    expect(created.status).toBe(201);
    expect(created.json.title).toBe("新的讨论");

    const list = await invokeApp(server.app, { method: "GET", url: "/api/conversations", headers });
    const ids = list.json.conversations.map((item) => item.id);
    expect(ids).toContain("default");
    expect(ids).toContain(created.json.id);

    const fetched = await invokeApp(server.app, { method: "GET", url: `/api/conversations/${created.json.id}`, headers });
    expect(fetched.json.id).toBe(created.json.id);

    const roleSwitch = await invokeApp(server.app, {
      method: "PUT",
      url: `/api/conversations/${created.json.id}/role`,
      headers,
      body: { roleId: "role-default" }
    });
    expect(roleSwitch.status).toBe(200);
    expect(roleSwitch.json.roleId).toBe("role-default");
  });

  it("keeps embeddings in a sidecar file instead of the memory index", async () => {
    const server = await createTestApp();
    const headers = { "X-Admin-Token": "secret" };
    const indexPath = path.join(server.paths.memoryDir, "index.json");
    const sidecarPath = path.join(server.paths.memoryDir, "embeddings.json");
    const seeded = JSON.parse(await readFile(indexPath, "utf8"));
    const target = seeded.find((item) => item.id === "api-key-handling");
    target.embedding = [0.25, 0.5, 0.75];
    target.embeddingModel = "test-embedding";
    target.embeddingHash = target.hash;
    target.embeddingUpdatedAt = new Date().toISOString();
    await writeFile(indexPath, JSON.stringify(seeded), "utf8");

    const patched = await invokeApp(server.app, {
      method: "PATCH",
      url: "/api/memory/verification-habit",
      headers,
      body: { level: "high" }
    });
    expect(patched.status).toBe(200);

    const nextIndex = JSON.parse(await readFile(indexPath, "utf8"));
    expect(nextIndex.some((item) => item.embedding !== undefined)).toBe(false);
    expect(nextIndex.some((item) => item.embeddingModel !== undefined)).toBe(false);

    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
    expect(sidecar["api-key-handling"].embedding).toEqual([0.25, 0.5, 0.75]);
    expect(sidecar["api-key-handling"].embeddingModel).toBe("test-embedding");
    expect(sidecar["verification-habit"]).toBeUndefined();
  });

  it("batches memory access counters instead of rewriting the index on every read", async () => {
    const server = await createTestApp({ memoryAccess: { flushThreshold: 100, flushIntervalMs: 0 } });
    const headers = { "X-Admin-Token": "secret" };
    const indexPath = path.join(server.paths.memoryDir, "index.json");
    const before = await readFile(indexPath, "utf8");

    await server.recordMemoryAccess(["project-workflow"]);
    await server.recordMemoryAccess(["project-workflow"]);

    expect(await readFile(indexPath, "utf8")).toBe(before);

    const pendingView = await invokeApp(server.app, { method: "GET", url: "/api/memory", headers });
    expect(pendingView.json.items.find((item) => item.id === "project-workflow").accessCount).toBe(2);

    await server.flushMemoryAccess();

    const persisted = JSON.parse(await readFile(indexPath, "utf8"));
    expect(persisted.find((item) => item.id === "project-workflow").accessCount).toBe(2);
  });

  it("flushes memory access counters once the batch threshold is reached", async () => {
    const server = await createTestApp({ memoryAccess: { flushThreshold: 2, flushIntervalMs: 0 } });
    const indexPath = path.join(server.paths.memoryDir, "index.json");

    await server.recordMemoryAccess(["project-workflow"]);
    await server.recordMemoryAccess(["api-key-handling"]);
    await server.waitForBackgroundTasks();

    const persisted = JSON.parse(await readFile(indexPath, "utf8"));
    expect(persisted.find((item) => item.id === "project-workflow").accessCount).toBe(1);
    expect(persisted.find((item) => item.id === "api-key-handling").accessCount).toBe(1);
  });

  it("soft-deletes a memory and keeps the record on disk until purged", async () => {
    const server = await createTestApp();
    const headers = { "X-Admin-Token": "secret" };
    const indexPath = path.join(server.paths.memoryDir, "index.json");

    const deleted = await invokeApp(server.app, {
      method: "DELETE",
      url: "/api/memory/api-key-handling",
      headers
    });

    expect(deleted.status).toBe(200);
    expect(deleted.json.item.status).toBe("deleted");

    const persisted = JSON.parse(await readFile(indexPath, "utf8"));
    expect(persisted.find((item) => item.id === "api-key-handling").status).toBe("deleted");

    const listed = await invokeApp(server.app, { method: "GET", url: "/api/memory", headers });
    expect(listed.json.items.some((item) => item.id === "api-key-handling")).toBe(false);
    expect(listed.json.stats.deleted).toBe(1);

    const markdown = await readFile(path.join(server.paths.memoryDir, "memory.md"), "utf8");
    expect(markdown).not.toContain("Visible API entry");

    const purged = await invokeApp(server.app, { method: "POST", url: "/api/memory/purge", headers });
    expect(purged.status).toBe(200);
    expect(purged.json.purged).toBe(1);

    const afterPurge = JSON.parse(await readFile(indexPath, "utf8"));
    expect(afterPurge.some((item) => item.id === "api-key-handling")).toBe(false);
  });

  it("returns 404 when soft-deleting an unknown memory", async () => {
    const server = await createTestApp();
    const response = await invokeApp(server.app, {
      method: "DELETE",
      url: "/api/memory/does-not-exist",
      headers: { "X-Admin-Token": "secret" }
    });

    expect(response.status).toBe(404);
    expect(response.json.code).toBe("MEMORY_NOT_FOUND");
  });

  it("leaves no temporary files behind when persisting memory", async () => {
    const server = await createTestApp();
    await invokeApp(server.app, {
      method: "POST",
      url: "/api/memory/commit",
      headers: { "X-Admin-Token": "secret" },
      body: { items: [{ id: "memory-atomic", content: "原子写入校验记忆", type: "project_fact", level: "medium", source: "test", status: "candidate" }] }
    });

    const entries = await readdir(server.paths.memoryDir);
    expect(entries.filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("passes a bounded, relevance-ranked conflict context to the extraction model", async () => {
    let receivedExisting = null;
    const server = await createTestApp({
      modelClient: {
        extractCandidatesWithModel: async (_provider, _agentConfig, input) => {
          receivedExisting = input.existingMemories;
          return { candidates: [], error: null };
        }
      }
    });
    const headers = { "X-Admin-Token": "secret" };
    const bulk = Array.from({ length: 40 }, (_item, index) => ({
      id: `memory-bulk-${index}`,
      content: `无关的批量记忆条目编号 ${index}`,
      type: "project_fact",
      level: "low",
      source: "test",
      status: "candidate"
    }));
    bulk.push({
      id: "memory-express",
      content: "项目使用 Express 后端提供接口",
      type: "project_fact",
      level: "high",
      source: "test",
      status: "candidate"
    });
    await invokeApp(server.app, {
      method: "POST",
      url: "/api/memory/commit",
      headers,
      body: { items: bulk }
    });

    await invokeApp(server.app, {
      method: "POST",
      url: "/api/chat",
      headers,
      body: { message: "把 Express 后端换成 Fastify 吧" }
    });

    expect(Array.isArray(receivedExisting)).toBe(true);
    expect(receivedExisting.length).toBeLessThanOrEqual(16);
    expect(receivedExisting.map((item) => item.id)).toContain("memory-express");
    expect(receivedExisting.every((item) => item.status === "active")).toBe(true);
  });

  it("lists registered tools and persists a completed read-tool task", async () => {
    const server = await createTestApp();
    const headers = { "X-Admin-Token": "secret" };
    const tools = await invokeApp(server.app, {
      method: "GET",
      url: "/api/tools",
      headers
    });

    expect(tools.status).toBe(200);
    expect(tools.json.tools.map((tool) => tool.id)).toEqual([
      "web.search",
      "memory.search",
      "workspace.list",
      "workspace.read",
      "workspace.grep",
      "workspace.write",
      "workspace.patch",
      "agent.task",
      "office.document",
      "office.docx"
    ]);
    expect(tools.json.tools.every((tool) => tool.execute === undefined)).toBe(true);
    expect(tools.json.tools.every((tool) => ["work", "coding"].includes(tool.category))).toBe(true);
    expect(tools.json.workspaceRoot).toContain("workspace");

    const execution = await invokeApp(server.app, {
      method: "POST",
      url: "/api/tools/memory.search/execute",
      headers,
      body: {
        objective: "查找计划偏好",
        conversationId: "default",
        input: { query: "计划", limit: 3 }
      }
    });

    expect(execution.status).toBe(201);
    expect(execution.json.status).toBe("completed");
    expect(execution.json.steps[0]).toMatchObject({
      toolId: "memory.search",
      permission: "read",
      status: "completed"
    });

    const tasks = await invokeApp(server.app, {
      method: "GET",
      url: "/api/tasks?conversationId=default",
      headers
    });
    expect(tasks.json.tasks[0].id).toBe(execution.json.id);
    expect(await readFile(path.join(server.paths.tasksDir, `${execution.json.id}.json`), "utf8")).toContain("memory.search");
  });

  it("rejects invalid tool input before creating a task", async () => {
    const server = await createTestApp();
    const response = await invokeApp(server.app, {
      method: "POST",
      url: "/api/tools/memory.search/execute",
      headers: { "X-Admin-Token": "secret" },
      body: { input: { query: "", limit: 99 } }
    });

    expect(response.status).toBe(400);
    expect(response.json.code).toBe("TOOL_INPUT_INVALID");
    expect(await readdir(server.paths.tasksDir)).toHaveLength(0);
  });

  it("queues workspace writes for approval and executes them once approved", async () => {
    const server = await createTestApp();
    const headers = { "X-Admin-Token": "secret" };
    const pending = await invokeApp(server.app, {
      method: "POST",
      url: "/api/tools/workspace.write/execute",
      headers,
      body: {
        objective: "写一个示例脚本",
        conversationId: "default",
        input: { path: "scripts/demo.ts", content: "export const demo = true;\n" }
      }
    });

    expect(pending.status).toBe(202);
    expect(pending.json.status).toBe("waiting_approval");
    expect(await readdir(server.paths.tasksDir)).toHaveLength(1);

    const approved = await invokeApp(server.app, {
      method: "POST",
      url: `/api/tasks/${pending.json.id}/approve`,
      headers,
      body: {}
    });

    expect(approved.status).toBe(200);
    expect(approved.json.id).toBe(pending.json.id);
    expect(approved.json.status).toBe("completed");
    expect(await readdir(server.paths.tasksDir)).toHaveLength(1);
    expect(await readFile(path.join(server.paths.workspaceRoot, "scripts", "demo.ts"), "utf8"))
      .toBe("export const demo = true;\n");
    const auditFiles = await readdir(server.paths.auditDir);
    const auditLog = await readFile(path.join(server.paths.auditDir, auditFiles[0]), "utf8");
    expect(auditLog).toContain('"action":"task.created"');
    expect(auditLog).toContain('"action":"task.approved"');
    expect(auditLog).toContain('"action":"tool.executed"');
    expect(auditLog).not.toContain("export const demo");

    const duplicateApproval = await invokeApp(server.app, {
      method: "POST",
      url: `/api/tasks/${pending.json.id}/approve`,
      headers,
      body: {}
    });
    expect(duplicateApproval.status).toBe(409);
    expect(duplicateApproval.json.code).toBe("TASK_NOT_WAITING_APPROVAL");
  });

  it("creates an office document task with approval", async () => {
    const server = await createTestApp();
    const pending = await invokeApp(server.app, {
      method: "POST",
      url: "/api/tools/office.document/execute",
      headers: { "X-Admin-Token": "secret" },
      body: {
        objective: "生成项目周报",
        conversationId: "default",
        input: {
          title: "项目周报",
          path: "reports/weekly.md",
          sections: JSON.stringify([{ heading: "进展", paragraphs: ["完成办公与代码工具"] }])
        }
      }
    });
    const response = await invokeApp(server.app, {
      method: "POST",
      url: `/api/tasks/${pending.json.id}/approve`,
      headers: { "X-Admin-Token": "secret" },
      body: {}
    });

    expect(response.status).toBe(200);
    expect(response.json.status).toBe("completed");
    const content = await readFile(path.join(server.paths.workspaceRoot, "reports", "weekly.md"), "utf8");
    expect(content).toContain("# 项目周报");
    expect(content).toContain("完成办公与代码工具");
  });

  it("cancels a waiting task without executing it", async () => {
    const server = await createTestApp();
    const headers = { "X-Admin-Token": "secret" };
    const pending = await invokeApp(server.app, {
      method: "POST",
      url: "/api/tools/workspace.write/execute",
      headers,
      body: {
        objective: "取消写入",
        input: { path: "cancelled.txt", content: "must not exist" }
      }
    });
    const cancelled = await invokeApp(server.app, {
      method: "POST",
      url: `/api/tasks/${pending.json.id}/cancel`,
      headers,
      body: {}
    });

    expect(cancelled.status).toBe(200);
    expect(cancelled.json.id).toBe(pending.json.id);
    expect(cancelled.json.status).toBe("cancelled");
    await expect(readFile(path.join(server.paths.workspaceRoot, "cancelled.txt"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("marks interrupted running tasks as failed during startup recovery", async () => {
    const server = await createTestApp();
    const taskId = "task-interrupted-test";
    await writeFile(path.join(server.paths.tasksDir, `${taskId}.json`), JSON.stringify({
      id: taskId,
      title: "Interrupted",
      objective: "recover",
      conversationId: "default",
      status: "running",
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
      steps: [{
        id: "step-interrupted-test",
        toolId: "workspace.write",
        title: "write",
        permission: "write",
        status: "running",
        input: { path: "x.txt", content: "x" },
        startedAt: "2026-08-13T00:00:00.000Z"
      }]
    }), "utf8");

    await server.ensureDataStore();
    const recovered = JSON.parse(await readFile(path.join(server.paths.tasksDir, `${taskId}.json`), "utf8"));
    expect(recovered.status).toBe("failed");
    expect(recovered.steps[0].error.code).toBe("TASK_INTERRUPTED");
  });
});

async function createTestApp(options = {}) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "memory-agent-test-"));
  tempRoots.push(rootDir);
  const { modelClient: modelClientOverrides, ...appOptions } = options;
  const server = createApp({
    rootDir,
    env: {
      MEMORY_AGENT_ADMIN_TOKEN: "secret",
      MEMORY_AGENT_API_KEY_OPENAI_COMPATIBLE: "test-key"
    },
    logger: { error: () => undefined },
    ...appOptions,
    modelClient: {
      callModel: async () => "mock reply",
      streamModelDeltas: async function* () {
        yield "mock";
        yield " stream";
      },
      extractCandidatesWithModel: async () => ({
        candidates: [{
          id: "candidate-test",
          content: "用户偏好先计划再执行。",
          type: "user_preference",
          level: "medium",
          source: "chat",
          updatedAt: new Date().toISOString(),
          status: "candidate"
        }],
        error: null
      }),
      organizeMemoryWithModel: async () => ({ candidates: [], error: null }),
      ...(modelClientOverrides || {})
    }
  });
  testServers.push(server);
  await server.ensureDataStore();
  return server;
}

function invokeApp(app, options) {
  return new Promise((resolve, reject) => {
    const method = options.method || "GET";
    const headers = normalizeHeaders(options.headers || {});
    let payload = null;
    if (options.body !== undefined) {
      const binaryBody = Buffer.isBuffer(options.body) || options.body instanceof Uint8Array;
      payload = binaryBody ? Buffer.from(options.body) : Buffer.from(JSON.stringify(options.body));
      headers["content-type"] = headers["content-type"] || (binaryBody ? "application/octet-stream" : "application/json");
      headers["content-length"] = String(payload.length);
    }

    const request = new PassThrough();
    bindStreamMethods(request);
    request.method = method;
    request.url = options.url;
    request.headers = headers;
    const socket = new PassThrough();
    bindStreamMethods(socket);
    socket.remoteAddress = "127.0.0.1";
    request.socket = socket;
    request.connection = request.socket;

    const chunks = [];
    const responseHeaders = {};
    const response = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      }
    });
    response.statusCode = 200;
    response.write = (chunk, encoding, callback) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === "string" ? encoding : undefined));
      if (typeof callback === "function") callback();
      return true;
    };
    response.setHeader = (name, value) => {
      responseHeaders[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
      return response;
    };
    response.getHeader = (name) => responseHeaders[name.toLowerCase()];
    response.getHeaders = () => ({ ...responseHeaders });
    response.removeHeader = (name) => {
      delete responseHeaders[name.toLowerCase()];
    };
    response.writeHead = (statusCode, headersOrMessage, maybeHeaders) => {
      response.statusCode = statusCode;
      const nextHeaders = typeof headersOrMessage === "object" ? headersOrMessage : maybeHeaders;
      for (const [name, value] of Object.entries(nextHeaders || {})) response.setHeader(name, value);
      return response;
    };
    response.end = (chunk, encoding, callback) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === "string" ? encoding : undefined));
      const body = Buffer.concat(chunks);
      const text = body.toString("utf8");
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      resolve({ status: response.statusCode, headers: responseHeaders, body, text, json });
      if (typeof callback === "function") callback();
      return response;
    };

    app.handle(request, response, reject);
    process.nextTick(() => {
      request.end(payload || undefined);
    });
  });
}

function normalizeHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function bindStreamMethods(stream) {
  for (const method of ["end", "write", "on", "once", "emit", "pipe", "read", "resume", "pause", "unpipe", "destroy", "_read", "_write", "_transform", "_flush"]) {
    if (typeof stream[method] === "function") {
      stream[method] = stream[method].bind(stream);
    }
  }
}
