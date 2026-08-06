import { apiError } from "./errors.mjs";

const MAX_TOOL_RESULT_CHARS = 50_000;

export function createToolRegistry(deps) {
  const tools = [
    {
      id: "web.search",
      name: "联网搜索",
      description: "搜索公开网页并返回标题、来源、链接和摘要。",
      permission: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1, maxLength: 500 },
          limit: { type: "integer", minimum: 1, maximum: 8 }
        }
      },
      execute: async (input) => {
        const search = await deps.performWebSearch(input.query, input.limit || 5);
        return {
          summary: `联网搜索完成，找到 ${search.results.length} 条结果。`,
          data: search
        };
      }
    },
    {
      id: "memory.search",
      name: "记忆检索",
      description: "在已激活的长期记忆中检索与目标相关的条目，不修改记忆。",
      permission: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1, maxLength: 500 },
          limit: { type: "integer", minimum: 1, maximum: 8 }
        }
      },
      execute: async (input) => {
        const items = await deps.getMemoryIndex();
        const matches = deps.selectRelevantMemories(input.query, items, false)
          .slice(0, input.limit || 5)
          .map((item) => ({
            id: item.id,
            content: item.content,
            type: item.type,
            level: item.level,
            retrieval: item.retrieval
          }));
        return {
          summary: matches.length ? `检索到 ${matches.length} 条相关长期记忆。` : "没有检索到相关长期记忆。",
          data: { query: input.query, matches }
        };
      }
    }
  ];
  return new Map(tools.map((tool) => [tool.id, Object.freeze(tool)]));
}

export function listRegisteredTools(registry) {
  return Array.from(registry.values()).map(({ execute: _execute, ...tool }) => tool);
}

export function getRegisteredTool(registry, toolId) {
  const tool = registry.get(String(toolId || ""));
  if (!tool) throw apiError(404, "TOOL_NOT_FOUND", "工具不存在或未启用。");
  return tool;
}

export async function executeRegisteredTool(registry, toolId, input, context = {}) {
  const tool = getRegisteredTool(registry, toolId);
  if (tool.permission !== "read" && !context.approved) {
    throw apiError(409, "TOOL_APPROVAL_REQUIRED", "该工具需要人工确认后才能执行。");
  }
  const normalizedInput = validateToolInput(tool, input);
  const result = await tool.execute(normalizedInput, context);
  return limitToolResult(result);
}

export function validateToolInput(tool, input) {
  const schema = tool.inputSchema || {};
  const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const properties = schema.properties || {};
  const normalized = {};

  for (const field of schema.required || []) {
    if (value[field] === undefined || value[field] === null || value[field] === "") {
      throw apiError(400, "TOOL_INPUT_INVALID", `缺少工具参数：${field}`);
    }
  }
  if (schema.additionalProperties === false) {
    const unknown = Object.keys(value).find((key) => !Object.hasOwn(properties, key));
    if (unknown) throw apiError(400, "TOOL_INPUT_INVALID", `不支持的工具参数：${unknown}`);
  }

  for (const [field, definition] of Object.entries(properties)) {
    if (value[field] === undefined) continue;
    if (definition.type === "string") {
      const text = String(value[field]).trim();
      if (text.length < (definition.minLength || 0) || text.length > (definition.maxLength || Infinity)) {
        throw apiError(400, "TOOL_INPUT_INVALID", `工具参数 ${field} 长度无效。`);
      }
      normalized[field] = text;
      continue;
    }
    if (definition.type === "integer") {
      const number = Number(value[field]);
      if (!Number.isInteger(number) || number < (definition.minimum ?? -Infinity) || number > (definition.maximum ?? Infinity)) {
        throw apiError(400, "TOOL_INPUT_INVALID", `工具参数 ${field} 必须是有效整数。`);
      }
      normalized[field] = number;
    }
  }
  return normalized;
}

function limitToolResult(result) {
  const normalized = {
    summary: String(result?.summary || "工具执行完成。").slice(0, 1000),
    data: result?.data ?? null
  };
  const serialized = JSON.stringify(normalized);
  if (serialized.length <= MAX_TOOL_RESULT_CHARS) return normalized;
  return {
    summary: `${normalized.summary} 结果体过大，已截断保存。`,
    data: { truncated: true, preview: serialized.slice(0, MAX_TOOL_RESULT_CHARS) }
  };
}
