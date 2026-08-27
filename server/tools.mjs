import { apiError } from "./errors.mjs";

const MAX_TOOL_RESULT_CHARS = 50_000;

export function createToolRegistry(deps) {
  const tools = [
    {
      id: "web.search",
      name: "联网搜索",
      description: "搜索公开网页并返回标题、来源、链接和摘要。",
      category: "work",
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
      category: "work",
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
    },
    {
      id: "workspace.list",
      name: "工作区目录",
      description: "列出本地工作区中的文件和目录结构，不修改任何文件。",
      category: "coding",
      permission: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", minLength: 1, maxLength: 500 },
          depth: { type: "integer", minimum: 1, maximum: 6 }
        }
      },
      execute: async (input) => {
        const result = await deps.workspace.listWorkspace(deps.workspaceRoot, input);
        return {
          summary: `工作区「${result.root}」下共有 ${result.count} 个条目。`,
          data: result
        };
      }
    },
    {
      id: "workspace.read",
      name: "读取文件",
      description: "读取本地工作区内的文本文件内容（二进制文件仅返回大小）。",
      category: "coding",
      permission: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: {
          path: { type: "string", minLength: 1, maxLength: 500 },
          maxChars: { type: "integer", minimum: 100, maximum: 50000 }
        }
      },
      execute: async (input) => {
        const result = await deps.workspace.readWorkspaceFile(deps.workspaceRoot, input);
        return {
          summary: result.binary
            ? `文件 ${result.path} 是二进制文件（${result.size} 字节），未读取内容。`
            : `已读取 ${result.path}（${result.size} 字节，${result.charCount} 字符）。`,
          data: result
        };
      }
    },
    {
      id: "workspace.grep",
      name: "代码检索",
      description: "在本地工作区中按文本子串搜索代码或文档内容，返回命中的文件和行号。",
      category: "coding",
      permission: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["pattern"],
        properties: {
          pattern: { type: "string", minLength: 1, maxLength: 200 },
          path: { type: "string", minLength: 1, maxLength: 500 },
          maxMatches: { type: "integer", minimum: 1, maximum: 100 }
        }
      },
      execute: async (input) => {
        const result = await deps.workspace.grepWorkspace(deps.workspaceRoot, input);
        return {
          summary: `在工作区中找到 ${result.count} 处与「${input.pattern}」匹配的内容。`,
          data: result
        };
      }
    },
    {
      id: "workspace.write",
      name: "写入代码/文件",
      description: "在本地工作区创建或覆盖文件，用于写代码、配置、笔记或文档。写入需人工确认。",
      category: "coding",
      permission: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["path", "content"],
        properties: {
          path: { type: "string", minLength: 1, maxLength: 500 },
          content: { type: "string", preserveWhitespace: true, minLength: 1, maxLength: 2000000 }
        }
      },
      execute: async (input) => {
        const result = await deps.workspace.writeWorkspaceFile(deps.workspaceRoot, input);
        return {
          summary: result.created
            ? `已创建文件 ${result.path}（${result.size} 字节）。`
            : `已更新文件 ${result.path}（${result.size} 字节）。`,
          data: result
        };
      }
    },
    {
      id: "workspace.patch",
      name: "代码补丁",
      description: "对本地工作区文件做精确文本替换，目标文本必须唯一出现，用于小范围修改代码。需人工确认。",
      category: "coding",
      permission: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["path", "oldString", "newString"],
        properties: {
          path: { type: "string", minLength: 1, maxLength: 500 },
          oldString: { type: "string", preserveWhitespace: true, minLength: 1, maxLength: 200000 },
          newString: { type: "string", preserveWhitespace: true, minLength: 1, maxLength: 200000 }
        }
      },
      execute: async (input) => {
        const result = await deps.workspace.patchWorkspaceFile(deps.workspaceRoot, input);
        return {
          summary: `已对 ${result.path} 完成 1 处文本替换。`,
          data: result
        };
      }
    },
    {
      id: "agent.task",
      name: "Agent 任务（DeepSeek Harness / Codex）",
      description: "把整个任务交给本机 Agent CLI 自主规划并执行，返回最终答复。可切换底层：DeepSeek Harness（dsh）或 Codex CLI。任务级黑盒执行，需人工确认；沙箱默认只读。",
      category: "coding",
      permission: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["task"],
        properties: {
          task: { type: "string", preserveWhitespace: true, minLength: 1, maxLength: 5000 },
          backend: { type: "string", enum: ["dsh", "codex"], minLength: 1, maxLength: 20 },
          sandbox: { type: "string", minLength: 1, maxLength: 30 }
        }
      },
      execute: (input, context) => {
        if (!deps.agentRuntime) throw apiError(503, "AGENT_UNAVAILABLE", "当前进程未启用 Agent 执行底层。");
        return deps.agentRuntime.run({
          backend: input.backend,
          task: input.task,
          sandbox: input.sandbox || "read-only",
          conversationId: context.conversationId
        });
      }
    },
    {
      id: "office.document",
      name: "生成办公文档",
      description: "按标题、摘要和章节结构生成本地 Markdown 办公文档（报告、纪要、方案），写入工作区。需人工确认。",
      category: "work",
      permission: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["title"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          summary: { type: "string", minLength: 1, maxLength: 200000 },
          path: { type: "string", minLength: 1, maxLength: 500 },
          sections: { type: "string", minLength: 1, maxLength: 2000000 }
        }
      },
      execute: async (input) => {
        const { title, path } = deps.office.normalizeDocumentInput(input, false);
        let sections;
        try {
          sections = input.sections ? JSON.parse(input.sections) : [];
        } catch {
          throw apiError(400, "OFFICE_SECTIONS_INVALID", "sections 必须是合法的 JSON 数组。");
        }
        const content = deps.office.buildMarkdownDocument({ title, summary: input.summary, sections });
        const result = await deps.workspace.writeWorkspaceFile(deps.workspaceRoot, { path, content });
        return {
          summary: `已生成办公文档 ${result.path}（${result.size} 字节）。`,
          data: { path: result.path, size: result.size, created: result.created, title }
        };
      }
    },
    {
      id: "office.docx",
      name: "生成 Word 文档",
      description: "生成 .docx Word 文档（支持标题、段落和表格），写入工作区。需人工确认。",
      category: "work",
      permission: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["title"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          path: { type: "string", minLength: 1, maxLength: 500 },
          blocks: { type: "string", minLength: 1, maxLength: 2000000 }
        }
      },
      execute: async (input) => {
        const { title, path } = deps.office.normalizeDocumentInput(input, true);
        let blocks;
        try {
          blocks = input.blocks ? JSON.parse(input.blocks) : [];
        } catch {
          throw apiError(400, "OFFICE_BLOCKS_INVALID", "blocks 必须是合法的 JSON 数组。");
        }
        const buffer = deps.office.buildDocx({ title, blocks });
        const result = await deps.workspace.writeWorkspaceFile(deps.workspaceRoot, { path, content: buffer });
        return {
          summary: `已生成 Word 文档 ${result.path}（${result.size} 字节）。`,
          data: { path: result.path, size: result.size, created: result.created, title }
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
      const text = definition.preserveWhitespace ? String(value[field]) : String(value[field]).trim();
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
