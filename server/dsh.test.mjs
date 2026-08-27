import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { normalizeSandbox, resolveDshEntry, runDshTask } from "./dsh.mjs";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-test-"));
const fakeEntry = path.join(tmpDir, "fake-dsh-entry.mjs");
const emptyCache = path.join(tmpDir, "empty-npx-cache");

beforeAll(() => {
  fs.mkdirSync(emptyCache, { recursive: true });
  fs.writeFileSync(
    fakeEntry,
    [
      "const mode = process.env.DSH_TOOLS_MODE || 'read-only';",
      "if (process.argv.some((a) => a.includes('--hang'))) setInterval(() => {}, 1000);",
      "process.stdout.write('fake-dsh-answer ' + mode);"
    ].join("\n")
  );
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("normalizeSandbox", () => {
  it("接受 read-only 与 workspace-write", () => {
    expect(normalizeSandbox("read-only")).toBe("read-only");
    expect(normalizeSandbox("workspace-write")).toBe("workspace-write");
    expect(normalizeSandbox(undefined)).toBe("read-only");
  });

  it("拒绝未知沙箱级别", () => {
    expect(() => normalizeSandbox("danger-full-access")).toThrowError();
    expect(() => normalizeSandbox("danger-full-access")).toThrowError(expect.objectContaining({ code: "DSH_SANDBOX_INVALID" }));
  });
});

describe("resolveDshEntry", () => {
  it("优先使用 DSH_BIN", () => {
    expect(resolveDshEntry({ DSH_BIN: fakeEntry })).toBe(fakeEntry);
  });

  it("无 DSH_BIN 且找不到 npx 缓存时返回 null", () => {
    expect(resolveDshEntry(process.env, { npxCacheDir: emptyCache })).toBeNull();
  });

  it("能在 npx 缓存中扫描到已安装的 dsh", () => {
    const cache = path.join(tmpDir, "npx-cache");
    const foundEntry = path.join(cache, "abcdef", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
    fs.mkdirSync(path.dirname(foundEntry), { recursive: true });
    fs.writeFileSync(foundEntry, "export default {};");
    expect(resolveDshEntry({}, { npxCacheDir: cache })).toBe(foundEntry);
  });
});

describe("runDshTask", () => {
  const base = { workdir: tmpDir, env: { DSH_BIN: fakeEntry } };

  it("在无 DSH_BIN 且无缓存时抛出 DSH_NOT_FOUND", async () => {
    await expect(runDshTask({ task: "hi", workdir: tmpDir, env: {}, npxCacheDir: emptyCache }))
      .rejects.toMatchObject({ code: "DSH_NOT_FOUND" });
  });

  it("拒绝空任务", async () => {
    await expect(runDshTask({ task: "", workdir: tmpDir, env: { DSH_BIN: fakeEntry } }))
      .rejects.toMatchObject({ code: "DSH_TASK_INVALID" });
  });

  it("拒绝非法沙箱级别", async () => {
    await expect(runDshTask({ task: "hi", sandbox: "full", workdir: tmpDir, env: { DSH_BIN: fakeEntry } }))
      .rejects.toMatchObject({ code: "DSH_SANDBOX_INVALID" });
  });

  it("正常执行并返回最终答复与运行信息", async () => {
    const result = await runDshTask({ task: "hi", sandbox: "workspace-write", workdir: tmpDir, env: { DSH_BIN: fakeEntry } });
    expect(result.data.output).toContain("fake-dsh-answer workspace-write");
    expect(result.data.sandbox).toBe("workspace-write");
    expect(result.data.exitCode).toBe(0);
    expect(result.data.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("超时会中止并抛出 DSH_TIMEOUT", async () => {
    await expect(runDshTask({
      task: "hi --hang",
      workdir: tmpDir,
      env: { DSH_BIN: fakeEntry },
      timeoutMs: 150
    })).rejects.toMatchObject({ code: "DSH_TIMEOUT" });
  });
});