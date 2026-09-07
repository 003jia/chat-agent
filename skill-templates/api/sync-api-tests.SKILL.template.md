---
name: sync-api-tests
description: Use when synchronizing Memory Agent Workbench API documentation and Vitest tests after changes in `server/`, `src/api.ts`, or `src/types.ts`, or when checking the sync baseline and affected test files.
---

# Memory Agent Workbench API 变更同步

## 监控范围与基线

- 单体仓库，无外部上游仓；监控 `server/`、`src/api.ts`、`src/types.ts`。
- 文档目录：`docs/api/`；基线文件：`docs/api-sync-state.json`。
- 测试为 `server/*.test.mjs`，采用同名映射和可选 `[Sync Meta]` 注释，不使用独立 meta 文件。
- 测试命令：`npx vitest run <file>`，之后按影响范围运行 `npm test`。
- 本 skill 不自动提交、推送、发群通知或创建外部缺陷单；需要时只输出建议和证据。

## 用户指令范围

| 用户意图 | 只执行 |
|---|---|
| 检测变更 | 读取基线并分析 `FROM..HEAD` |
| 只更新文档 | 检测 + 更新 `docs/api/` |
| 只更新用例 | 检测 + 定位并改写受影响测试，不运行 |
| 更新并跑测试 | 检测 + 文档 + 用例 + 受影响测试 |
| 全流程同步 | 上述全部，再更新基线并报告；提交需用户另行授权 |

有歧义先确认范围，不扩大操作。

## 流程

1. 先检查工作区状态，保留用户已有未提交改动；读取 `docs/api-sync-state.json`。缺失时用 `git log` 反查并说明人工确认点。
2. 执行 `git diff FROM..HEAD -- server/ src/api.ts src/types.ts`，按路由、领域模块、前端 API 客户端和类型契约分类。
3. 受路由或响应契约影响时调用 `api-doc-generator` 更新对应 `docs/api/<module>.md`。
4. 定位测试：同名映射、`[Sync Meta] module`、`doc_refs` 三种方式去重；路由集中变更要纳入 `server/app.test.mjs`。
5. 先读源码与最新文档，再实际改写参数、响应路径、错误码、权限和业务流断言；删除的接口不得保留断言。
6. 先单文件后全量测试；失败按环境/权限数据/业务/数据假设/测试代码五层排查。
7. 仅在用户明确要求完成同步时更新 `docs/api-sync-state.json`；不把临时产物或真实 `data/` 纳入提交。

## 强制门禁

- 不得只给测试文件加同步注释而不改真实断言。
- 不得凭前端类型、历史响应或猜测生成接口行为。
- 测试必须使用临时目录、测试令牌和外部依赖 mock，禁止污染真实用户数据。
- `FROM == HEAD` 时报告“无变更”，不要伪造同步结果。
