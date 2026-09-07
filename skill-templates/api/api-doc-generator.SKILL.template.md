---
name: api-doc-generator
description: Use when generating, updating, reviewing, or validating the Memory Agent Workbench API documentation, including route inventories, request/response schemas, error codes, SSE events, authentication, and code-diff synchronization.
---

# Memory Agent Workbench API 文档

## 项目边界

- 后端是 Node.js + Express 5，采用 ESM，源码位于 `server/`。
- 路由集中在 `server/app.mjs`；领域实现位于 `auth`、`config`、`conversations`、`memory`、`model`、`search`、`tasks`、`tools`、`workspace`、`office`、`teams` 等模块。
- 文档统一写入 `docs/api/<module>.md`，当前是单本地环境：后端默认 `127.0.0.1:8787`。
- `src/api.ts` 和 `src/types.ts` 只用于补充调用方契约，不能覆盖后端源码事实。

## 触发与输入

用户要求生成、补充、检查、优化、增量更新 API 文档，或要求对比 `server/`、`src/api.ts`、`src/types.ts` 的变更时使用本 skill。

开始前读取：

1. `server/app.mjs` 的全部 `app.get/post/put/patch/delete` 路由注册；
2. 对应领域模块和 `server/errors.mjs`、`server/constants.mjs`；
3. `docs/api/` 已有文档；
4. `src/api.ts`、`src/types.ts` 的调用方与类型；
5. 涉及聊天、搜索、模型、记忆、任务时，读取对应 `docs/api/*.md`。

## 生成与更新流程

1. 建立路由清单：Method、完整 Path、鉴权中间件、限流器、模块归属。
2. 沿 `Express 路由 → 领域模块 → 本地 JSON/Markdown、模型供应商或工作区` 跟踪真实逻辑。
3. 记录请求参数的类型、必填、范围、枚举和来源；展开所有嵌套对象。
4. 记录响应完整结构、必有字段、错误码、状态语义、数据来源、调用方和副作用。
5. `/api/chat/stream` 必须记录 SSE 事件顺序、结束条件和“HTTP 200 后发送 error 事件”的语义。
6. 按模块写入或局部更新 `docs/api/<module>.md`。增量更新只改受变更影响的段落，并更新头部 `synced_commit`。
7. 生成后核对路由总数、文档索引、接口详情和 `docs/api-sync-state.json` 是否一致。

## 事实与安全门禁

- 源码优先；无法确认的字段或行为写 `TODO(源码待确认)`，不得猜测。
- 枚举必须列出 `server/` 中全部常量及语义。
- 显式说明 `MEMORY_AGENT_ADMIN_TOKEN`、账号密码、模型 API Key、`MEMORY_AGENT_WORKSPACE_DIR` 和限流配置的影响。
- 文档、日志和示例不得写入真实令牌、密码、API Key、会话正文或用户记忆。
- 只读 `data/` 结构，不以真实 `data/` 内容作为测试或文档样例。
- PRD、路线图和架构文档不由本 skill 修改。

## 文档最小结构

每个模块文档至少包含：元数据与 commit、接口索引、通用响应/错误约定、每个接口的请求/响应/鉴权/逻辑/边界测试点，以及复杂链路时序图。简单查询不强行添加时序图。

## 完成条件

- 所有实际路由均已收录，排除项有依据。
- 请求、响应、错误码、鉴权、限流和调用方可回溯到源码位置。
- 变更范围与 `synced_commit` 一致；未受影响段落无无谓 diff。
