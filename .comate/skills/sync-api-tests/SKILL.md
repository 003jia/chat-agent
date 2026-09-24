---
name: sync-api-tests
description: Memory Agent Workbench（聊天智能体）「根据本仓后端/前端代码变更同步更新接口测试用例」的全流程 skill。当用户说"接口用例同步一下"、"server 有新代码了帮我同步用例"、"根据代码变更更新用例"、"检测一下有没有新变更"、"只更新文档不改用例"、"只更新受影响的用例"、"更新完跑一下冒烟"、"接口用例跟一下最新代码"，或询问"哪些用例受这次改动影响"并想触发后续更新时使用。监控本仓 server/ 与 src/ 目录变更，检测变更→更新接口文档→定位受影响用例→改写用例与断言→冒烟测试→提交。支持全流程和单步执行；用户只说"只检测变更""只更新文档""只跑测试"时不要擅自扩展范围。
---

# 接口自动化：根据代码变更同步更新用例

当本仓 `server/`（后端）与 `src/api.ts`、`src/types.ts`（前端契约层）有新变更时，本 skill 负责：更新接口文档 → 定位受影响用例 → 改写用例与断言 → 冒烟验收 → 提交。是 api 三件套中的**总调度**。

> 本项目是**单体仓**：源码与测试同仓共置，没有外部上游仓。同步的「上游」= 本仓内 `server/` 与前端契约文件的 git 变更。

## 本 skill 配置表（本项目取值）

| 配置项 | 取值 | 说明 |
|---|---|---|
| 项目名 | memory-agent-workbench（聊天智能体） | 仓库根 = 测试工程根 |
| 监控范围 | `server/`、`src/api.ts`、`src/types.ts` | 无外部上游仓，git log 限定路径即可 |
| 同步状态文件 | `docs/api-sync-state.json` | 记录每个监控路径上次同步到的 sha；缺失时可用 `git log --grep "test(sync)"` 反查兜底 |
| 接口文档目录 | `docs/api/` | `api-doc-generator` 的产物 |
| 测试框架与命令 | Vitest，`npm test` / `npx vitest run <file>` | 冒烟只跑受影响文件 |
| 用例元数据 | 无独立 meta 文件 | 「同名映射约定」+ 用例文件头 `[Sync Meta]` 注释块（见 api-test-case-generator） |
| 提交流程 | 常规 git 分支 + commit（`test(sync): ...`） | 仓库无 Gerrit/GitLab refs/for 流程；如需评审走 GitHub PR |
| 通知渠道 | 无 | 无内部群机器人；同步小结输出到对话即可 |
| 缺陷登记 | GitHub Issues | 发现产品 BUG 时登记并在用例注释原因 |
| 网络约束 | 本地直连，无代理 | 仅 `npm install` 需访问 registry；测试内不发起真实外网请求 |

## 监控路径配置表

| 监控路径 | 语言 | 内容 | 文档更新 skill |
| --- | --- | --- | --- |
| `server/` | Node.js (ESM .mjs) | Express 路由 + 领域模块 | api-doc-generator |
| `src/api.ts`、`src/types.ts` | TypeScript | 前端 API 客户端与类型契约 | api-doc-generator（前端契约节） |

**路径 → 测试模块映射**（用于步骤 4 定位受影响用例，对应 `[Sync Meta]` 注释块的 `module` 字段）：

| 变更路径 | 影响模块 |
| --- | --- |
| `server/app.mjs`（路由注册） | 按变更路由归属判断：roles / teams / conversations / memory / tasks / tools / chat / model-config |
| `server/memory*.mjs` | memory |
| `server/tasks.mjs`、`server/tools.mjs`、`server/runtimes.mjs` | tasks、tools |
| `server/conversations.mjs`、`server/summary.mjs` | conversations |
| `server/config.mjs`、`server/auth.mjs` | config、auth（全模块令牌链路受影响） |
| `server/workspace*.mjs`、`server/office.mjs` | workspace、office |
| `server/model.mjs`、`server/search.mjs`、`server/prompt.mjs` | chat、web-search |
| `src/api.ts`、`src/types.ts` | 按变更类型/函数归属模块判断 |

## 执行模式（用户说什么 → 只执行哪些步骤，不自动扩展）

| 用户说 | 执行范围 |
| --- | --- |
| "同步接口用例" / "全流程" | 步骤 1-6（完整流程） |
| "检测一下有没有新变更" | 步骤 1-2 |
| "只更新文档" | 步骤 1-3 |
| "只更新用例" | 步骤 1-4（不跑测试不提交） |
| "更新并跑测试，不提交" | 步骤 1-5 |
| "只跑测试" | 步骤 5 |

有歧义时先问清楚范围，不要猜测后擅自扩大。

## 完整流程（6 步）

### 步骤 1：计算变更范围

确认工作区无未提交的测试/文档改动（有则先请用户处理，不要 stash 他人的进行中工作）→ 记录当前 HEAD sha。
从 `docs/api-sync-state.json` 读取上次同步到的 sha 作为 diff 起点：`git log --oneline FROM..HEAD -- server/ src/api.ts src/types.ts`；state 缺失时用 `git log --grep "test(sync)" -1` 反查，再缺失则人工确认起点；`FROM == HEAD` 则整体跳过。汇总 `{path, from, to, commits[]}`。

### 步骤 2：识别 API 相关变更文件

筛出「接口相关」变更文件：

| 类别 | 判定正则 |
| --- | --- |
| 后端路由/领域 | `server/.*\.mjs$`（重点：`app.mjs` 中 `app\.(get\|post\|put\|patch\|delete)\(` 注册处、各领域模块） |
| 前端契约 | `src/api\.ts$`、`src/types\.ts$` |

输出变更概览：改了几个文件、接口相关几个、涉及哪些模块（按上方「路径 → 测试模块映射」）。无 API 变更的提交标记 `has_api_change=false`（文档仍可更新，用例匹配跳过）。

### 步骤 3：更新接口文档

以本仓根目录为 cwd 调用 `api-doc-generator`，统一指令「对比代码差异并更新接口文档，只更新因代码变更需要修改的部分」。产物写入 `docs/api/`，作为步骤 4 定位与步骤 5 改写用例的依据。
> 若用户明确跳过文档更新，需提醒：用例改写依赖最新文档，跳过可能导致断言与实际接口不符。

### 步骤 4：定位受影响的测试文件

本仓测试与源码**同名共置**，三种匹配方式（命中其一即受影响）：

1. **同名映射**：`server/foo.mjs` 变更 → `server/foo.test.mjs` 受影响；`server/app.mjs` 路由变更 → 按映射表定位对应模块的测试文件与 `server/app.test.mjs`。
2. **module 映射**：变更模块 ∈ 测试文件头 `[Sync Meta]` 注释块的 `module` 字段。
3. **doc_refs 关键词**：从 API 变更文件路径提取关键词（文件名去后缀、长度>3）命中注释块 `doc_refs` 任一条目。

去重后输出「受影响用例清单」：test_file、module、match_reason、关联 api_files。

### 步骤 5：改写受影响用例（核心步骤——真正依据变更改写，而非仅插注释头）

对每个受影响测试文件：

1. **先读源码 + `docs/api/` 最新接口文档**，确认入参、返回结构、权限规则、枚举值的真实变化。
2. **按变化改写**（结构规范对齐 `api-test-case-generator` 模式一 Step 1）：
   - 新增字段/参数 → 补充断言；返回结构变化 → 修正取值路径；权限/规则变化 → 更新流程期望；
   - 接口删除/废弃 → 删除或标记用例，**不得保留对已不存在接口的断言**；
   - 新增接口 → 按 `api-test-case-generator` 规范补充用例。
3. **严禁杜撰**：任何断言必须能在源码/文档中找到依据。
4. **更新同步记录**：用例文件头 `[Sync Meta]` 注释块的 `synced_commit = <to_sha>`；增删用例同步核对 `module`/`doc_refs` 准确。该 `to` sha 即步骤 6 写回 `docs/api-sync-state.json` 的值——注释块是文件级记录，state 是仓库级基线，两层都写。
5. 测试文件结构性变化（新增/删除模块测试）时，同步更新 `docs/` 下对应测试总结文档。
6. 全程遵守「测试数据与令牌保护规范」：临时目录 + 随机令牌 + mock 外部调用，禁止触碰真实 `data/`。

### 步骤 6：冒烟测试 + 更新状态 + 提交

1. 对受影响文件跑 `npx vitest run <file>`，随后跑整模块确认无回归。
2. 失败分析按 `api-test-case-generator` 的 **L1→L5 分层诊断**与修复三禁执行，失败分类处置：**用例问题**→修复后先单跑再跑整模块；**疑似产品 BUG**→GitHub Issues 登记并在用例注释原因；**环境/前置问题**→按 fix-recipes 处理。
3. 修复中发现的新接口坑沉淀到 `references/api-gotchas.md`。
4. 把 `to` sha 写回 `docs/api-sync-state.json`。
5. **提交**：只提交 `server/*.test.mjs` 等测试文件、本次更新的 `docs/api/` 与 `docs/api-sync-state.json`（不提交临时产物）。commit message 形如：`test(sync): 同步代码变更并更新接口用例 [<module>@<sha8>, ...]`。

## 测试数据与令牌保护规范（强制约束）

与 `api-test-case-generator` 完全一致（mkdtemp 临时目录、随机令牌、mock 外部调用、禁止写真实 `data/`、临时数据 finally 清理、新用例过合规性检查）——本 skill 在步骤 5/6 及调用子 skill 时一律遵守。

## 固定约束（每次执行都遵守）

- 所有回复用中文。
- 不杜撰接口行为：改断言前先读源码 + 最新接口文档确认。
- 不擅自扩大执行范围：严格按「执行模式」表对应指令的步骤。
- 源码与测试同仓：改测试时**不得顺手修改 `server/`、`src/` 业务代码**；发现产品缺陷走 GitHub Issues。
- 测试临时目录与真实 `data/` 严格隔离，禁止任何测试触达用户真实记忆/会话/密钥文件。

## 关联 skill 分工

| skill | 使用环节 |
|---|---|
| `api-doc-generator` | 步骤 3 更新接口文档 |
| `api-test-case-generator` | 步骤 5 改写/新增用例的规范来源；步骤 6 修复失败用例 |
| GitHub Issues | 步骤 6 发现产品 BUG 时登记 |
