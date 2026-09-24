---
name: api-doc-generator
description: 生成、更新和优化 Memory Agent Workbench（聊天智能体）Node.js/Express 后端的接口文档。当用户需要生成接口文档、增量更新接口文档、优化现有文档格式、检查文档准确性、添加缺失接口、补充枚举值、添加时序图/权限流程图、对比代码差异并同步接口文档时使用。触发词：生成接口文档、更新接口文档、接口文档、API 文档、补充枚举、数据来源、时序图、权限流程、对比代码差异更新文档、增量更新、同步接口文档。
---

# API 接口文档 Skill（生成 + 更新）

本 skill 定义为本仓 `server/`（Node.js/Express，ESM `.mjs`）后端接口文档的生成与**增量更新**工作流和质量标准。被 `sync-api-tests` 在「更新文档」步骤中以子 skill 方式调用（调用契约见第三节）。

## 本 skill 配置表（本项目取值）

| 配置项 | 取值 | 说明 |
|---|---|---|
| 被测后端栈 | Node.js/Express（ESM） | `server/*.mjs`，无 TypeScript 注解，以 JSDoc 为辅 |
| 产品名 | Memory Agent Workbench（聊天智能体） | 本地优先智能体工作台 |
| 文档产物目录 | `docs/api/` | 随本仓入库 |
| 环境集合 | 单环境（本地 `127.0.0.1:8787`） | 无多环境文档分层；受 `MEMORY_AGENT_ADMIN_TOKEN` 等环境变量影响的默认行为在文档内单独说明 |
| 接口源码位置 | 本仓 `server/`（无外部上游仓） | 路由集中在 `server/app.mjs`，领域逻辑在各模块 |
| 文档模板样例 | `references/doc-template.md` | 落地时先建空骨架，随运行沉淀 |

## 一、核心原则

1. **源码优先**：字段定义、枚举值、参数类型、错误码均以 `server/` 源文件为准；JSDoc 注释和前端 `src/api.ts`、`src/types.ts` 只可作辅助参考，不可作为唯一依据——注释可能未及时更新。
2. **枚举必须完整**：凡标注为枚举类型的字段，必须列出该枚举的**全部常量值**及语义（含 `constants.mjs` 中导出的上限/阈值），不允许只写"枚举类型"或"见代码"。
3. **标注数据来源**：每个字段的取值来源（请求体 / `data/` 本地文件 / 下游模型供应商 / 计算生成）必须标注，便于用例断言取值。
4. **运行配置差异显式化**：接口行为受环境变量影响时（`MEMORY_AGENT_ADMIN_TOKEN`、`MEMORY_AGENT_WORKSPACE_DIR`、各模型 API Key、限流常量），在文档中说明默认值与影响，不允许混写。
5. **响应层级显式化**：嵌套响应（如 `readiness.dataStore`、记忆索引的 `active/candidate/disabled` 分桶）必须在文档示例中完整展示取值路径。

## 二、生成模式（首次产出 / 重新生成）

1. 从 `server/app.mjs` 的 `app.get/post/put/patch/delete(...)` 路由注册处入手，按模块定位领域源码（当前模块：auth/health、roles（含 background）、teams、model-config、conversations（含 search/export/summary/role）、web-search、tools/tasks（execute/approve/cancel）、chat（含 stream）、memory（candidates/commit/organize/purge））。
2. 按 `references/doc-template.md` 模板产出文档：接口路径 + 方法、权限要求（是否 `adminAuth`、限流器）、请求参数（含类型/必填/枚举）、响应结构（含完整示例）、错误码（`errors.mjs` 的 apiError 约定）、时序图（跨服务调用时，如 chat → 模型供应商、memory → Embedding 接口）、权限流程图（令牌相关接口）。
3. 质量自检：枚举完整性、字段与源码逐一比对、响应示例与真实返回结构一致。

## 三、更新模式（增量同步）

调用契约（供 `sync-api-tests` 步骤 3 使用）：

> 以本仓根目录为 cwd 触发本 skill，指令统一为：
> 「对比代码差异并更新接口文档，只更新因代码变更需要修改的部分」

增量更新规则：
1. 输入为代码变更范围（from..to commit，限 `server/` 与 `src/api.ts`、`src/types.ts`），先定位变更涉及的路由与领域模块文件。
2. **只改动因本次变更需要修改的部分**，未变内容保持原样（避免文档无谓 diff）。
3. 接口删除/废弃 → 从文档移除或标记废弃；新增接口 → 按生成模式补齐。
4. 更新后在文档头部记录 `synced_commit`，供回溯。
5. 产物统一写入 `docs/api/<module>.md`，作为下游用例改写的唯一依据。

## 四、固定约束

- 所有回复用中文。
- 不杜撰接口行为：写不进文档的字段/枚举，先读源码确认，确认不了就标 `TODO(源码待确认)` 而不是编造。
- 技术文档与 PRD 分层：本 skill 只产出接口文档；`docs/` 下的 PRD、路线图等不在本 skill 范围内更新。
