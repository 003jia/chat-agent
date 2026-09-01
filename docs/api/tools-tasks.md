# tools-tasks 模块接口文档（工具注册表 + 可审计任务）

- synced_commit: `3f06b8ba`
- 更新时间: 2026-08-31
- 源码: `server/app.mjs`（L1222-1367）、`server/tools.mjs`、`server/tasks.mjs`、`server/workspace.mjs`、`server/office.mjs`、`server/runtimes.mjs`（agent.task）
- 数据来源: `data/tasks/<taskId>.json`（任务持久化）；工作区根目录 `MEMORY_AGENT_WORKSPACE_DIR`（默认 `data/workspace`）；审计日志 `data/audit/`

## 权限模型

- `tool.permission` 枚举：`read`（自动执行）/ `write`（需人工确认）/ `external`（需人工确认）。
- 任务状态机（`taskStatuses`，完整枚举）：`waiting_approval` → `running` → `completed` | `failed`；`waiting_approval` → `cancelled`。
- 步骤状态枚举与任务一致；step.permission 非法值归一化为 `read`，status 非法值归一化为 `failed`。

## 工具清单（GET /api/tools 返回，完整 10 个）

| id | 名称 | category | permission | 必填 input | 备注 |
|---|---|---|---|---|---|
| `web.search` | 联网搜索 | work | read | `query` (≤500) | `limit` 1..8；默认 5 条 |
| `memory.search` | 记忆检索 | work | read | `query` (≤500) | `limit` 1..8；只读不写记忆 |
| `workspace.list` | 工作区目录 | coding | read | — | `path` ≤500、`depth` 1..6 |
| `workspace.read` | 读取文件 | coding | read | `path` (≤500) | `maxChars` 100..50000；二进制只返回大小 |
| `workspace.grep` | 代码检索 | coding | read | `pattern` (≤200) | `path`、`maxMatches` 1..100 |
| `workspace.write` | 写入代码/文件 | coding | write | `path`, `content` (≤2,000,000) | 创建或覆盖；越界路径被拒 |
| `workspace.patch` | 代码补丁 | coding | write | `path`, `oldString`, `newString` (各 ≤200,000) | 目标文本必须唯一 |
| `agent.task` | Agent 任务（DeepSeek Harness / Codex） | coding | write | `task` (≤5000) | `backend` 枚举 `dsh`/`codex`；`sandbox` 默认 `read-only` |
| `office.document` | 生成办公文档 | work | write | `title` (≤200) | `summary`/`path`/`sections`(JSON 数组字符串) |
| `office.docx` | 生成 Word 文档 | work | write | `title` (≤200) | `path`/`blocks`(JSON 数组字符串) |

- inputSchema 校验规则（`validateToolInput`）：`additionalProperties: false` → 未知字段报错；string 默认 trim（`preserveWhitespace: true` 除外）；integer 校验范围；错误统一 `400 TOOL_INPUT_INVALID`（消息含字段名）。

## 任务对象结构（完整字段）

```json
{
  "id": "task-xxxx",
  "title": "…（≤80）",
  "objective": "…（≤2000）",
  "conversationId": "default",
  "roleId": "role-xxxx（可选）",
  "status": "completed",
  "createdAt": "2026-08-31T00:00:00.000Z",
  "updatedAt": "2026-08-31T00:00:00.000Z",
  "steps": [
    {
      "id": "step-xxxx",
      "toolId": "workspace.write",
      "title": "写入代码/文件",
      "permission": "write",
      "status": "completed",
      "input": { "…校验后的工具入参…": "" },
      "result": { "summary": "…（≤1000）", "data": {} },
      "error": { "code": "TOOL_EXECUTION_ERROR", "message": "…（≤1000）" },
      "startedAt": "2026-08-31T00:00:00.000Z",
      "completedAt": "2026-08-31T00:00:00.000Z"
    }
  ]
}
```

- 工具执行结果统一 `{ summary, data }`；序列化超 50,000 字符时降级为 `{ summary: "<原文> 结果体过大，已截断保存。", data: { truncated: true, preview: "<前 50000 字符>" } }`。

## GET /api/tools

- 权限：`adminAuth`
- 响应：`{ "tools": [ { id, name, description, category, permission, inputSchema } ]（不含 execute）、"workspaceRoot": "<绝对路径>" }`

## GET /api/tasks

- 权限：`adminAuth`
- 请求参数：`conversationId`（query，可选过滤）、`limit`（query，1..100，默认 30）
- 响应：`{ "tasks": [ <任务对象，按 updatedAt 降序> ] }`

## GET /api/tasks/:taskId

- 权限：`adminAuth`
- 错误码：

| code | HTTP | 触发条件 |
|---|---|---|
| VALIDATION_ERROR | 400 | taskId 不匹配 `^[a-zA-Z0-9_-]+$` |
| TASK_NOT_FOUND | 404 | 任务文件不存在 |

- 响应：任务对象（全量）

## POST /api/tools/:toolId/execute

- 权限：`adminAuth` + `writeLimiter`
- 用途：创建并（对 read 工具）立即执行工具任务
- 请求参数：

| 字段 | 类型 | 必填 | 说明 | 数据来源 |
|---|---|---|---|---|
| input | object | 视工具 schema | 工具入参，按 schema 校验 | 请求体 |
| objective | string | 否 | 任务目标，截断 ≤2000，默认工具描述 | 请求体 |
| conversationId | string | 否 | 默认 `"default"`；不存在时自动用种子会话 | 请求体 |

- 响应：
  - `read` 工具：`201` + 任务对象（终态 `completed` 或 `failed`——**执行异常也返回 201**，错误落在 `steps[-1].error`，不抛 HTTP 错误）
  - `write`/`external` 工具：`202` + 任务对象（`waiting_approval`，等待 approve/cancel）
- 错误码（任务创建前）：`404 TOOL_NOT_FOUND`、`400 TOOL_INPUT_INVALID`
- 审计：任务创建（`task.created`）与执行（`tool.executed` success/failure）均写审计日志

## POST /api/tasks/:taskId/approve

- 权限：`adminAuth` + `writeLimiter`
- 用途：批准 `waiting_approval` 任务并立即执行
- 错误码：

| code | HTTP | 触发条件 |
|---|---|---|
| TASK_NOT_FOUND | 404 | 任务不存在 |
| VALIDATION_ERROR | 400 | taskId 格式非法 |
| TASK_NOT_WAITING_APPROVAL | 409 | 任务不在待确认状态（「只有待确认任务可以批准执行。」） |

- 响应：`200` + 任务对象（终态 `completed` / `failed`；执行失败仍是 200，看 `status` 与 `steps[-1].error`）
- 原子性：状态迁移在任务写锁内完成，重复批准第二次得 409

## POST /api/tasks/:taskId/cancel

- 权限：`adminAuth` + `writeLimiter`
- 错误码：同 approve，状态冲突消息为「只有待确认任务可以取消。」
- 响应：`200` + 任务对象（`status: "cancelled"`，`steps[-1].status: "cancelled"`）

## 备注（供用例断言）

1. `agent.task` 在未启用 Agent 底层的进程中执行会返回任务 `failed`，step.error.code = `AGENT_UNAVAILABLE`（HTTP 仍 201/200）。
2. `office.document` 的 `sections`、`office.docx` 的 `blocks` 若不是合法 JSON 数组 → 任务 `failed`，error.code 为 `OFFICE_SECTIONS_INVALID` / `OFFICE_BLOCKS_INVALID`。
3. workspace 类工具的路径越界（相对路径逃逸、绝对路径、符号链接逃逸）会被 `server/workspace.mjs` 拒绝并落入任务失败态。
