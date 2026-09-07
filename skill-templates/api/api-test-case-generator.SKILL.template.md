---
name: api-test-case-generator
description: Use when generating, extending, updating, repairing, or accepting API tests for Memory Agent Workbench, especially `server/*.test.mjs`, Vitest failures, route smoke tests, auth failures, data cleanup, or PRD-driven backend acceptance.
---

# Memory Agent Workbench API 测试

## 项目配置

- 框架：Vitest + Node ESM；全量命令 `npm test`，单文件命令 `npx vitest run server/<name>.test.mjs`。
- 测试与源码同目录同名：`server/foo.mjs` ↔ `server/foo.test.mjs`；路由集成测试主要位于 `server/app.test.mjs`。
- 路由和客户端契约：`server/app.mjs`、`src/api.ts`、`src/types.ts`；接口事实以 `docs/api/` 与后端源码为准。
- 测试通过 `createApp()` 依赖注入，参照 `server/app.test.mjs` 的 `createTestApp`、`mkdtemp` 和 `invokeApp` 模式；不依赖常驻 dev server。

## 标准流程

1. 读取 `docs/api/<module>.md`、相关 `server/*.mjs`、已有同名测试，列出现有覆盖和缺口。
2. 新增/修改用例：正常、边界、未认证/错误令牌、业务拒绝、写后查询闭环、异常依赖路径按适用性覆盖。
3. 业务流用例用 `// Step N:` 分段，所有临时文件和数据在 `finally`/`afterEach` 清理。
4. 运行单文件，再运行受影响模块，最后按需求运行 `npm test`。
5. 失败严格按 L1→L5 诊断；修复后保留强断言并复跑。

## 测试数据、令牌与外部依赖

- 每个需要持久化的测试都使用 `mkdtemp`，通过 `createApp({ rootDir, env, modelClient })` 注入临时根目录；禁止触碰真实 `data/`，其中包含用户会话、记忆和 API Key。
- 令牌由测试动态生成或使用测试专用常量注入；覆盖无令牌、错误令牌和正确令牌三态，不读取真实 `.env` 凭证。
- 模型、Embedding、联网搜索、Codex/DSH 运行时等外部调用必须 mock 或使用明确的 stub；禁止测试发起真实外网或真实 CLI 副作用。
- 写操作必须验证最终持久化状态；临时会话、记忆、任务和工作区资源必须有清理路径。

## 断言红线

- 不用 `or {}`、`or []`、`catch` 或“任意 2xx”掩盖结构错误。
- HTTP 状态、业务错误码、关键字段和持久化结果分别断言。
- 禁止删除必查断言、`catch AssertionError` 后放过、或把产品 bug 改成允许结果。
- 失败先排环境/网络、令牌/数据状态、业务逻辑、数据假设，最后才检查测试代码。

## 同步追踪

跨模块业务流可在测试文件头部维护：

```js
// [Sync Meta]
// module: memory
// doc_refs: ["docs/api/memory.md"]
// synced_commit: <sha8>
// [/Sync Meta]
```

不创建 `.py.meta.json` 或其他 Python 工件；仓库级同步基线由 `docs/api-sync-state.json` 维护。

## 完成条件

- 用例与源码/文档一致，无重复和无依据断言。
- 真实数据目录零写入，外部调用零越界，清理失败可见。
- 报告给出命令、通过/失败/跳过数量、失败分层、证据和遗留风险。
