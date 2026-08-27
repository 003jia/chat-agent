import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultBackend, getRuntime, runAgentTask } from "./runtimes.mjs";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "runtimes-test-"));
const fakeCodexEntry = path.join(tmpDir, "fake-codex-entry.mjs");
const emptyCache = path.join(tmpDir, "empty-cache");

beforeAll(() => {
  fs.mkdirSync(emptyCache, { recursive: true });
  fs.writeFileSync(
    fakeCodexEntry,
    "process.stdout.write('argv=' + process.argv.slice(1).join(' '));"
  );
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("默认后端选择", () => {
  it("默认使用 dsh", () => {
    expect(defaultBackend({})).toBe("dsh");
  });

  it("可通过 AGENT_BACKEND 切换", () => {
    expect(defaultBackend({ AGENT_BACKEND: "codex" })).toBe("codex");
    expect(defaultBackend({ AGENT_BACKEND: "Codex" })).toBe("codex");
  });

  it("未知的 AGENT_BACKEND 回退到 dsh", () => {
    expect(defaultBackend({ AGENT_BACKEND: "copilot" })).toBe("dsh");
  });
});

describe("getRuntime", () => {
  it("拒绝未知后端", () => {
    expect(() => getRuntime("copilot")).toThrowError(expect.objectContaining({ code: "AGENT_BACKEND_INVALID" }));
  });

  it("能取到已注册的 dsh 与 codex", () => {
    expect(getRuntime("dsh").displayName).toBe("DeepSeek Harness");
    expect(getRuntime("codex").displayName).toBe("Codex CLI");
  });
});

describe("runAgentTask(codex)", () => {
  it("无 CODEX_BIN 且无缓存时抛出 CODEX_NOT_FOUND", async () => {
    await expect(runAgentTask({ backend: "codex", task: "hi", workdir: tmpDir, env: {}, npxCacheDir: emptyCache }))
      .rejects.toMatchObject({ code: "CODEX_NOT_FOUND" });
  });

  it("拒绝非法沙箱级别，错误码带 codex 前缀", async () => {
    await expect(runAgentTask({
      backend: "codex",
      task: "hi",
      sandbox: "danger-full-access",
      workdir: tmpDir,
      env: { CODEX_BIN: fakeCodexEntry }
    })).rejects.toMatchObject({ code: "CODEX_SANDBOX_INVALID" });
  });

  it("以 codex exec --sandbox <task> 方式调用并返回运行信息", async () => {
    const result = await runAgentTask({
      backend: "codex",
      task: "summarize",
      sandbox: "workspace-write",
      workdir: tmpDir,
      env: { CODEX_BIN: fakeCodexEntry }
    });
    expect(result.data.backend).toBe("codex");
    expect(result.data.sandbox).toBe("workspace-write");
    expect(result.data.exitCode).toBe(0);
    expect(result.data.output).toContain("exec --sandbox workspace-write summarize");
    expect(result.summary).toContain("Codex CLI");
  });
});