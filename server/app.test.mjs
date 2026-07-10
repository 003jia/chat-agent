import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    const memory = await invokeApp(server.app, { method: "GET", url: "/api/memory" });
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
    const memory = await invokeApp(server.app, { method: "GET", url: "/api/memory" });
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
    expect(created.json.roles).toHaveLength(2);
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

    const list = await invokeApp(server.app, { method: "GET", url: "/api/conversations" });
    const ids = list.json.conversations.map((item) => item.id);
    expect(ids).toContain("default");
    expect(ids).toContain(created.json.id);

    const fetched = await invokeApp(server.app, { method: "GET", url: `/api/conversations/${created.json.id}` });
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
});

async function createTestApp(options = {}) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "memory-agent-test-"));
  tempRoots.push(rootDir);
  const server = createApp({
    rootDir,
    env: {
      MEMORY_AGENT_ADMIN_TOKEN: "secret",
      MEMORY_AGENT_API_KEY_OPENAI_COMPATIBLE: "test-key"
    },
    logger: { error: () => undefined },
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
      organizeMemoryWithModel: async () => ({ candidates: [], error: null })
    },
    ...options
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
      payload = Buffer.from(JSON.stringify(options.body));
      headers["content-type"] = headers["content-type"] || "application/json";
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
      const text = Buffer.concat(chunks).toString("utf8");
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      resolve({ status: response.statusCode, headers: responseHeaders, text, json });
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
