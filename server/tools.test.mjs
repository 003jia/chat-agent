import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildDocx, buildMarkdownDocument, normalizeDocumentInput } from "./office.mjs";
import {
  grepWorkspace,
  listWorkspace,
  patchWorkspaceFile,
  readWorkspaceFile,
  writeWorkspaceFile
} from "./workspace.mjs";
import { createToolRegistry, executeRegisteredTool, listRegisteredTools, validateToolInput } from "./tools.mjs";

const tempRoots = [];

afterEach(async () => {
  await cleanupTempRoots();
});

async function createRegistry() {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "memory-agent-tools-"));
  tempRoots.push(workspaceRoot);
  return createToolRegistry({
    performWebSearch: async (query, limit) => ({
      query,
      source: "test",
      fetchedAt: "2026-07-31T00:00:00.000Z",
      results: Array.from({ length: limit }, (_item, index) => ({
        title: `Result ${index + 1}`,
        url: `https://example.com/${index + 1}`,
        source: "example.com",
        snippet: query
      }))
    }),
    getMemoryIndex: async () => [
      { id: "memory-1", content: "用户偏好先制定计划", type: "user_preference", level: "high", status: "active" }
    ],
    selectRelevantMemories: (_query, items) => items,
    workspaceRoot,
    workspace: {
      listWorkspace,
      readWorkspaceFile,
      grepWorkspace,
      writeWorkspaceFile,
      patchWorkspaceFile
    },
    office: {
      normalizeDocumentInput,
      buildMarkdownDocument,
      buildDocx
    }
  });
}

async function cleanupTempRoots() {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

describe("tool registry", () => {
  it("exposes model-readable schemas without execute functions", async () => {
    const tools = listRegisteredTools(await createRegistry());

    expect(tools.map((tool) => tool.id)).toEqual([
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
    expect(tools[0].inputSchema.required).toContain("query");
    expect(tools[0].execute).toBeUndefined();
    expect(tools.filter((tool) => tool.category === "work").map((tool) => tool.id)).toEqual([
      "web.search",
      "memory.search",
      "office.document",
      "office.docx"
    ]);
    expect(tools.filter((tool) => tool.category === "coding").map((tool) => tool.id)).toEqual([
      "workspace.list",
      "workspace.read",
      "workspace.grep",
      "workspace.write",
      "workspace.patch",
      "agent.task"
    ]);
    const writeTools = tools.filter((tool) => tool.permission === "write");
    expect(writeTools.map((tool) => tool.id)).toEqual([
      "workspace.write",
      "workspace.patch",
      "agent.task",
      "office.document",
      "office.docx"
    ]);
  });

  it("validates input before executing a tool", async () => {
    const registry = await createRegistry();

    await expect(executeRegisteredTool(registry, "web.search", { query: "" })).rejects.toMatchObject({
      code: "TOOL_INPUT_INVALID"
    });
    expect(validateToolInput(registry.get("web.search"), { query: "agent tools", limit: 2 })).toEqual({
      query: "agent tools",
      limit: 2
    });
  });

  it("executes registered read tools and returns bounded results", async () => {
    const registry = await createRegistry();
    const result = await executeRegisteredTool(registry, "memory.search", {
      query: "计划",
      limit: 3
    });

    expect(result.summary).toContain("1 条");
    expect(result.data.matches[0]).toMatchObject({ id: "memory-1", level: "high" });
  });

  it("gates workspace write tools behind approval", async () => {
    const registry = await createRegistry();

    await expect(executeRegisteredTool(registry, "workspace.write", {
      path: "README.md",
      content: "hello"
    })).rejects.toMatchObject({ code: "TOOL_APPROVAL_REQUIRED" });

    const result = await executeRegisteredTool(registry, "workspace.write", {
      path: "notes/a.md",
      content: "hello"
    }, { approved: true });

    expect(result.summary).toContain("已创建文件");
    expect(result.data.path).toBe("notes/a.md");
  });

  it("writes code files and patches unique fragments", async () => {
    const registry = await createRegistry();
    const context = { approved: true };
    await executeRegisteredTool(registry, "workspace.write", {
      path: "src/index.ts",
      content: "export const answer = 41;\n"
    }, context);
    const patched = await executeRegisteredTool(registry, "workspace.patch", {
      path: "src/index.ts",
      oldString: "answer = 41",
      newString: "answer = 42"
    }, context);

    expect(patched.data.replaced).toBe(1);
    expect(patched.data.preview.added).toContain("answer = 42");
    const read = await executeRegisteredTool(registry, "workspace.read", {
      path: "src/index.ts"
    });
    expect(read.data.text).toContain("answer = 42");
  });

  it("generates office documents and docx binaries into the workspace", async () => {
    const registry = await createRegistry();
    const context = { approved: true };
    const document = await executeRegisteredTool(registry, "office.document", {
      title: "周报",
      sections: JSON.stringify([{ heading: "进展", paragraphs: ["完成工具台"], bullets: ["a", "b"] }])
    }, context);

    expect(document.data.path.endsWith(".md")).toBe(true);
    const read = await executeRegisteredTool(registry, "workspace.read", {
      path: document.data.path
    });
    expect(read.data.text).toContain("# 周报");
    expect(read.data.text).toContain("- a");

    const docx = await executeRegisteredTool(registry, "office.docx", {
      title: "方案",
      blocks: JSON.stringify([
        { type: "heading", text: "概述" },
        { type: "paragraph", text: "正文" },
        { type: "table", rows: [["列A", "列B"], ["1", "2"]] }
      ])
    }, context);

    expect(docx.data.path.endsWith(".docx")).toBe(true);
    const readDocx = await executeRegisteredTool(registry, "workspace.read", {
      path: docx.data.path
    });
    expect(readDocx.data.binary).toBe(true);
  });

  it("rejects workspace paths that escape the root", async () => {
    const registry = await createRegistry();

    await expect(executeRegisteredTool(registry, "workspace.write", {
      path: "../outside.txt",
      content: "x"
    }, { approved: true })).rejects.toMatchObject({ code: "WORKSPACE_PATH_ESCAPE" });
    await expect(executeRegisteredTool(registry, "workspace.read", {
      path: "/etc/passwd"
    })).rejects.toMatchObject({ code: "WORKSPACE_PATH_INVALID" });
  });
});
