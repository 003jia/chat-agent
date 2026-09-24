---
name: api-test-case-generator
description: |
  为 Memory Agent Workbench（聊天智能体）「生成、补充、更新、修复接口测试用例」+「新功能提测验收测试」的一体化 skill（双输入驱动：接口文档驱动 / PRD 驱动）。

  **主动触发场景：**
  - 用户说"帮我生成/补充/追加 XX 模块的接口测试用例"、"给 XX 模块写接口自动化"
  - 用户问"这个模块的测试文件在哪 / 已有哪些覆盖"
  - 用户需要基于 PRD 补充业务规则用例，或更新 docs/ 下测试汇总文档
  - 用户提到 server/*.test.mjs 下的文件需要修改
  - 用户说"帮我修复 XX 用例"、"用例跑失败了"、"分析报错"，或贴出失败报告要求分析修复
  - 用户提到 401 / READINESS_FAILED / AssertionError / Vitest 失败等错误
  - 用户说"这个用例每次跑完数据没清理"、"用例需要管理令牌前置"或"接口 403/连接失败"
  - 用户说"测试新功能"、"提测验收"、"验收一下最新迭代"，或给出 docs/ 下 PRD 文档要求"文档更新 → 用例生成 → 测试 → 结论"闭环

  只要意图与"接口自动化测试用例"或"新功能提测验收"相关（生成、补充、更新或修复），就应使用此 skill。
  输入分叉规则：只提供接口文档 → 模式一（接口文档驱动）；提供 PRD（±UI/分支）→ 模式二（PRD 驱动提测验收）。
---

# 接口测试用例生成与修复 Skill（双模式）

## 本 skill 配置表（本项目取值）

| 配置项 | 取值 | 说明 |
|---|---|---|
| 项目名 | memory-agent-workbench（聊天智能体） | 本仓即被测仓，测试与源码同仓共置 |
| 测试框架 | Vitest（Node ESM） | `npm test` = `vitest run` |
| 用例目录 | `server/*.test.mjs` | 与被测模块**同目录同名共置**（`config.mjs` ↔ `config.test.mjs`） |
| 单接口 / 业务流 | 不分目录，用 describe 分组 | 单接口 = `createApp API smoke` 式 describe；业务流 = `test_xxx_flow` 命名的 it/describe |
| API 封装层 | `server/*.mjs` 领域模块 + `server/app.mjs` 路由 | 前端客户端封装 `src/api.ts` 仅作参照 |
| 环境集合 | 单环境本地（后端 `127.0.0.1:8787`、前端 `127.0.0.1:5173`） | 无 ENV 切换；测试内通过 `createApp()` 进程内起服务，不打真实端口 |
| 分组标记 | describe 命名约定 | `API smoke` / 模块名 / `test_*_flow`；权限类用例命名含 `auth`/`token` |
| 用例元数据 | 无独立 meta 文件 | 依赖「同名映射约定」+ 用例文件头注释块（见下节） |
| 预置凭证 | 无账号体系；管理令牌 `MEMORY_AGENT_ADMIN_TOKEN` | 测试内**随机生成临时令牌**注入 createApp，禁用真实 `.env` 令牌 |
| 接口坑沉淀 | `references/api-gotchas.md` | 先建空骨架，随运行沉淀 |
| 错误速查表 | `references/fix-recipes.md` | 先建空骨架，随运行沉淀 |
| 汇总文档 | `docs/` 下测试总结文档（按需） | 仅结构性变化时更新 |
| 缺陷登记 | GitHub Issues | 仓库无 iCafe 等内部平台 |

## 模式一：接口文档驱动（生成 / 补充 / 修复）

### Step 1 生成用例（信息来源优先级：接口路径/参数名以 `docs/api/` 文档为准；业务规则/边界以源码+文档为准）

- **单接口测试**：在对应模块的 `server/<module>.test.mjs`（或 `server/app.test.mjs`）中，每个接口一个 describe，至少覆盖**正常场景、参数边界（`it.each` 参数化）、权限验证（带临时令牌→成功 / 无令牌或错令牌→401/403）**。
- **业务流程测试**：每个业务场景一个 `test_flow_xxx`（如「创建会话 → 发消息 → 提交记忆候选 → 审核通过 → 召回」），用 `// Step N:` 注释分隔步骤，创建的数据（临时目录中的会话、记忆条目、任务）在 `finally`/`afterEach` 中清理。
- **权限用例**统一遵循「注入临时令牌 → 操作 → 断言 → afterEach 还原临时目录」模式。
- **运行配置差异**：行为受环境变量影响的接口（工作区目录、令牌、限流），用例按各自配置显式注入，不互相套用真实环境配置。

### Step 2 执行

- 全量：`npm test`；单文件：`npx vitest run server/<module>.test.mjs`；单用例：`npx vitest run -t "<用例名>"`。
- 进程内 `createApp()` 起服务（参照 `server/app.test.mjs` 的 `createTestApp` 模式），不依赖 dev server 常驻。
- 测试产物只写临时目录，不归档报告（Vitest 终端输出即证据；结构性回归再补 UI 截图）。

### Step 3 失败诊断（必须按 L1→L5 顺序排查，不要直接看代码）

| 层次 | 类别 | 典型现象 | 诊断手段 |
|------|------|----------|----------|
| L1 | 环境/网络 | ECONNREFUSED、端口占用、5173/8787 未起 | 确认 dev server 是否需要；进程内测试不应有网络依赖，出现即先查注入 |
| L2 | 令牌/权限/数据状态 | 401/403、"READINESS_FAILED"、`data/` 文件损坏 | 直接调查询接口（/api/health）看实际状态；确认测试是否误用了真实 `.env` |
| L3 | 业务逻辑 | 期望字段对不上、权限边界误判 | 对照 `docs/api/` 文档；用 fetch 复现 |
| L4 | 数据假设 | 临时目录残留、假设"无数据" | 看日志中其他用例的写入；确认 mkdtemp 隔离是否生效 |
| L5 | 代码/技术 | import 失败、mock 不当、ESM 循环依赖 | 直接看代码 |

> **黄金法则**：怀疑代码 bug 之前，先走完 L1→L4。多数"代码 bug"实为环境、令牌、数据残留问题。

### Step 4 修复原则：让用例"报对"而不只是"不报错"

- **正常场景不误报**（不因测试代码缺陷崩溃），**异常场景不漏报**（接口真实出错必须失败且信息清晰）。
- **三禁**：禁软化断言（删必查断言）、禁吞断言（`catch` 后吞掉 AssertionError）、禁改断言迁就 bug。
- 失败分类处置：**用例问题**→修复并回归整个模块；**疑似产品 BUG**→在 GitHub Issues 登记，并在用例注释原因（不写死 skip）；**环境/前置问题**→按 fix-recipes 对应章节处理。
- 按错误现象查 `references/fix-recipes.md`，**打开对应章节读完整方案再修**，不要凭表格直接下结论。

### Step 5 沉淀

- 新发现的接口行为特殊点（类型不一致、错误码语义、隐含约束）追加到 `references/api-gotchas.md`（格式：`## {序号}. {接口名}（{年月日}新增）` + 现象/原因/方案）。
- 用例增删导致覆盖率变化时，同步更新 `docs/` 下对应测试总结文档（用例数、模块分布、更新时间）；仅断言微调可跳过。

## 模式二：PRD 驱动提测验收

输入：`docs/` 下 PRD 文档（如 `PRD-会话摘要-*.md`、`prd-companion-refresh.md`）。闭环四步：

1. **更新接口文档**：依据新功能代码变更增量更新（可调用 `api-doc-generator`）。
2. **生成用例**：按模式一 Step 1 规范，为 PRD 功能点生成单接口 + 业务流用例。
3. **跑测试**：`npm test` 全量或按模块执行，失败按 Step 3~4 处理。
4. **验收结论**：输出「用例清单 / 通过率 / 失败原因分类 / 遗留风险」，明确给出可否提测的结论。

## 测试数据与令牌保护规范（强制约束）

1. **测试一律使用 `mkdtemp` 临时目录**并通过依赖注入指向它（`server/app.test.mjs` 的 `tempRoots` 模式），`afterEach` 中 `rm` 清理；**禁止让任何测试读写真实 `data/` 目录**——其中含用户真实记忆、会话、API Key。
2. **管理令牌随机生成**：测试内 `randomUUID()` 生成临时令牌注入被测 app；禁止读取或复用真实 `.env` 的 `MEMORY_AGENT_ADMIN_TOKEN`，禁止把令牌写进提交内容。
3. **外部调用隔离**：涉及模型供应商、Embedding、联网搜索的用例一律 mock `callModel`/`callEmbeddings`/搜索函数，不发起真实外网请求。
4. **创建的数据必须清理**：临时会话、记忆条目、任务文件在 `finally`/`afterEach` 中删除，不允许残留。
5. **新用例合规性检查**：提交前逐条核对——是否用了临时目录与随机令牌、是否 mock 了外部调用、所有临时数据是否有清理路径。

## 用例命名与映射约定（替代 meta 工件）

本仓测试与源码**同目录同名共置**，受影响用例定位直接靠同名映射，无需独立 meta 文件：

- `server/foo.mjs` ↔ `server/foo.test.mjs`（路由类变更集中在 `server/app.mjs` ↔ `server/app.test.mjs`）。
- 跨模块业务流用例在文件头部维护注释块，供 `sync-api-tests` 检索：

```js
// [Sync Meta]
// module: memory
// doc_refs: ["docs/api/memory.md"]
// synced_commit: <sha8>
// [/Sync Meta]
```

- 用例增删时同步更新注释块的 `synced_commit` 与仓库级 `docs/api-sync-state.json`（由 `sync-api-tests` 维护），两层配合、用途不同。

## 固定约束（每次执行都遵守）

- 所有回复用中文。
- 不杜撰接口行为：写断言前先读源码 + 最新接口文档确认，拿不准先读源码。
- 新增/修改领域模块时同步补充或更新其同名测试文件，不允许模块与测试长期脱节。
- 失败先分层诊断（L1→L5），禁止直接改代码碰运气。
