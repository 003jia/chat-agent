import { describe, expect, it } from "vitest";
import { createToolRegistry, executeRegisteredTool, listRegisteredTools, validateToolInput } from "./tools.mjs";

function createRegistry() {
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
    selectRelevantMemories: (_query, items) => items
  });
}

describe("tool registry", () => {
  it("exposes model-readable schemas without execute functions", () => {
    const tools = listRegisteredTools(createRegistry());

    expect(tools.map((tool) => tool.id)).toEqual(["web.search", "memory.search"]);
    expect(tools[0].inputSchema.required).toContain("query");
    expect(tools[0].execute).toBeUndefined();
  });

  it("validates input before executing a tool", async () => {
    const registry = createRegistry();

    await expect(executeRegisteredTool(registry, "web.search", { query: "" })).rejects.toMatchObject({
      code: "TOOL_INPUT_INVALID"
    });
    expect(validateToolInput(registry.get("web.search"), { query: "agent tools", limit: 2 })).toEqual({
      query: "agent tools",
      limit: 2
    });
  });

  it("executes registered read tools and returns bounded results", async () => {
    const result = await executeRegisteredTool(createRegistry(), "memory.search", {
      query: "计划",
      limit: 3
    });

    expect(result.summary).toContain("1 条");
    expect(result.data.matches[0]).toMatchObject({ id: "memory-1", level: "high" });
  });
});
