// E2E 专用后端启动器：把数据根指向临时目录并注入 mock 模型客户端，禁止触达真实 data/。
// 用法：MEMORY_AGENT_E2E_ROOT=<临时目录> node scripts/e2e-server.mjs
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.mjs";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";

// 数据根：显式 env 优先（playwright webServer 注入），否则每次随机临时目录。
const rootDir = process.env.MEMORY_AGENT_E2E_ROOT
  ? path.resolve(process.env.MEMORY_AGENT_E2E_ROOT)
  : await mkdtemp(path.join(os.tmpdir(), "memory-agent-e2e-"));

const { app, ensureDataStore, waitForBackgroundTasks } = createApp({
  rootDir,
  env: {
    ...process.env,
    MEMORY_AGENT_ADMIN_TOKEN: process.env.MEMORY_AGENT_ADMIN_TOKEN || "dev-token",
    MEMORY_AGENT_WORKSPACE_DIR: path.join(rootDir, "workspace"),
    // 默认选中供应商为 openai-compatible；providerFromConfig 在进入 modelClient 前先校验 Key，
    // 注入 mock Key 让请求能走到 mock 模型客户端（不发起真实外网请求）
    MEMORY_AGENT_API_KEY_OPENAI_COMPATIBLE: "e2e-mock-key"
  },
  // 聊天/流式/记忆整理均走 mock，不打真实模型 API
  modelClient: {
    callModel: async () => "E2E mock 回复：这是用于界面验证的固定内容。",
    streamModelDeltas: async function* () {
      yield "E2E mock ";
      yield "回复：";
      yield "流式增量。";
    },
    callEmbeddings: async () => [],
    extractCandidatesWithModel: async () => ({ candidates: [], error: null }),
    organizeMemoryWithModel: async () => ({ candidates: [], error: null })
  }
});

await ensureDataStore();

const server = app.listen(port, host, () => {
  console.log(`[e2e-server] Memory Agent API (isolated root=${rootDir}) on http://${host}:${port}`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  const forceExitTimer = setTimeout(() => process.exit(1), 10_000);
  forceExitTimer.unref?.();
  server.close(async (error) => {
    try {
      await waitForBackgroundTasks();
    } catch (backgroundError) {
      console.error("[e2e-server] failed to flush background tasks", backgroundError);
      process.exitCode = 1;
    }
    if (error) {
      console.error("[e2e-server] failed to close", error);
      process.exitCode = 1;
    }
    clearTimeout(forceExitTimer);
  });
  server.closeIdleConnections?.();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

server.on("error", (error) => {
  console.error("[e2e-server] failed to start", error);
  process.exitCode = 1;
});
