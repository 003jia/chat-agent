import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  grepWorkspace,
  listWorkspace,
  patchWorkspaceFile,
  readWorkspaceFile,
  resolveWorkspacePath,
  resolveWorkspaceRoot,
  writeWorkspaceFile
} from "./workspace.mjs";

const tempRoots = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "memory-agent-ws-"));
  tempRoots.push(root);
  return root;
}

describe("workspace path safety", () => {
  it("resolves relative paths inside the root", async () => {
    const root = await createWorkspace();
    expect(resolveWorkspacePath(root, "a/b.ts")).toBe(path.join(root, "a", "b.ts"));
  });

  it("rejects absolute paths and traversal", async () => {
    const root = await createWorkspace();
    expect(() => resolveWorkspacePath(root, "/etc/passwd")).toThrowError(/相对路径/);
    expect(() => resolveWorkspacePath(root, "../escape")).toThrowError(/工作区范围/);
    expect(() => resolveWorkspacePath(root, "")).toThrowError(/不能为空/);
  });

  it("rejects symlinks that point outside the workspace", async () => {
    const root = await createWorkspace();
    const outside = await mkdtemp(path.join(os.tmpdir(), "memory-agent-outside-"));
    tempRoots.push(outside);
    await writeFile(path.join(outside, "secret.txt"), "outside secret", "utf8");
    await mkdir(path.join(root, "links"), { recursive: true });
    await symlink(outside, path.join(root, "links", "outside"));

    await expect(readWorkspaceFile(root, { path: "links/outside/secret.txt" })).rejects.toMatchObject({
      code: "WORKSPACE_PATH_ESCAPE"
    });
  });
});

describe("workspace read tools", () => {
  it("lists entries with depth limits", async () => {
    const root = await createWorkspace();
    await mkdir(path.join(root, "src", "lib"), { recursive: true });
    await writeFile(path.join(root, "src", "index.ts"), "export const a = 1;\n", "utf8");
    await writeFile(path.join(root, "src", "lib", "helper.ts"), "export const b = 2;\n", "utf8");

    const shallow = await listWorkspace(root, { path: ".", depth: 1 });
    expect(shallow.entries.some((entry) => entry.path === "src/index.ts")).toBe(true);
    expect(shallow.entries.some((entry) => entry.path === "src/lib/helper.ts")).toBe(false);

    const deep = await listWorkspace(root, { depth: 3 });
    expect(deep.entries.some((entry) => entry.path === "src/lib/helper.ts")).toBe(true);
    expect(deep.entries.find((entry) => entry.name === "index.ts").size).toBeGreaterThan(0);
  });

  it("reads text files and detects binary files", async () => {
    const root = await createWorkspace();
    await writeFile(path.join(root, "plan.md"), "hello\nworld\n", "utf8");
    await writeFile(path.join(root, "image.bin"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]));

    const text = await readWorkspaceFile(root, { path: "plan.md" });
    expect(text.text).toBe("hello\nworld\n");
    expect(text.binary).toBe(false);

    const binary = await readWorkspaceFile(root, { path: "image.bin" });
    expect(binary.binary).toBe(true);
    expect(binary.text).toBe("");
  });

  it("truncates overlong reads and reports the flag", async () => {
    const root = await createWorkspace();
    await writeFile(path.join(root, "big.log"), "x".repeat(200), "utf8");

    const result = await readWorkspaceFile(root, { path: "big.log", maxChars: 100 });
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBe(100);
  });

  it("greps text files across directories", async () => {
    const root = await createWorkspace();
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "a.ts"), "const TARGET = 1;\n", "utf8");
    await writeFile(path.join(root, "src", "b.ts"), "// no match here\n", "utf8");
    await writeFile(path.join(root, "src", "notes.md"), "TARGET mentioned\n", "utf8");

    const result = await grepWorkspace(root, { pattern: "TARGET", maxMatches: 10 });
    expect(result.count).toBe(2);
    expect(result.matches[0]).toMatchObject({ path: "src/a.ts", line: 1 });
  });
});

describe("workspace write tools", () => {
  it("creates nested files and reports created/changed", async () => {
    const root = await createWorkspace();
    const created = await writeWorkspaceFile(root, { path: "docs/plan.md", content: "# 计划\n" });
    expect(created.created).toBe(true);
    expect(created.changed).toBe(false);
    expect(await readFile(path.join(root, "docs", "plan.md"), "utf8")).toBe("# 计划\n");

    const changed = await writeWorkspaceFile(root, { path: "docs/plan.md", content: "# 更新\n" });
    expect(changed.changed).toBe(true);
  });

  it("patches unique fragments and rejects ambiguous or missing ones", async () => {
    const root = await createWorkspace();
    await writeFile(path.join(root, "config.ts"), "const port = 8787;\nconst host = \"127.0.0.1\";\n", "utf8");

    const result = await patchWorkspaceFile(root, {
      path: "config.ts",
      oldString: "port = 8787",
      newString: "port = 9000"
    });
    expect(result.replaced).toBe(1);
    expect(result.preview.added).toContain("port = 9000");

    await expect(patchWorkspaceFile(root, {
      path: "config.ts",
      oldString: "不存在的内容",
      newString: "x"
    })).rejects.toMatchObject({ code: "WORKSPACE_PATCH_NOT_FOUND" });

    await writeFile(path.join(root, "dup.ts"), "const a = 1;\nconst b = 1;\n", "utf8");
    await expect(patchWorkspaceFile(root, {
      path: "dup.ts",
      oldString: "= 1;",
      newString: "= 2;"
    })).rejects.toMatchObject({ code: "WORKSPACE_PATCH_AMBIGUOUS" });
  });

  it("rejects patching binary files", async () => {
    const root = await createWorkspace();
    await writeFile(path.join(root, "blob.bin"), Buffer.from([1, 0, 2, 3]));
    await expect(patchWorkspaceFile(root, {
      path: "blob.bin",
      oldString: "1",
      newString: "2"
    })).rejects.toMatchObject({ code: "WORKSPACE_BINARY_FILE" });
  });
});

describe("workspace root resolution", () => {
  it("defaults under data and honors env override", () => {
    const rootDir = path.join(os.tmpdir(), "memory-agent-app");
    expect(resolveWorkspaceRoot(rootDir, {})).toBe(path.join(rootDir, "data", "workspace"));
    expect(resolveWorkspaceRoot(rootDir, { MEMORY_AGENT_WORKSPACE_DIR: "/srv/workspace" }))
      .toBe("/srv/workspace");
  });
});