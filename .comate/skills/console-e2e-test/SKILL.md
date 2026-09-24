---
name: console-e2e-test
description: Memory Agent Workbench（聊天智能体）端到端自动化测试全流程技能。用于盘点测试覆盖，编写或修改测试用例文档、Page Object 和 spec，同步 TC-ID 与标题，运行模块测试，分析失败，核对报告和视频归档，以及维护测试规则和流程。用户提到 E2E、UI 自动化、Playwright、测试用例、回归测试、运行测试、分析报告、selector/等待失败、数据清理、测试文档、用例、视频录制、Trace、归档报告，或涉及聊天智能体前端自动化测试时使用。
---

# Memory Agent Workbench E2E 测试 Skill

UI 层**回归轨**主 skill：覆盖用例文档、POM、spec 的编写维护与运行归档全流程。需求轨（新功能首轮验收）由 `prd-driven-testing` 承接，公共红线以本 skill 为准。

## 本 skill 配置表（本项目取值）

| 配置项 | 取值 | 说明 |
|---|---|---|
| 被测产品 | Memory Agent Workbench（聊天智能体） | 本地优先智能体工作台 |
| E2E 工程目录 | `e2e/` | 落地时创建：`e2e/pages/`（POM）、`e2e/specs/`、`e2e/fixtures/` |
| UI 测试框架 | Playwright | 已在 devDependencies；浏览器用 `npx playwright install chromium` 安装 |
| 回归轨用例文档目录 | `docs/test-cases/regression/` | 与 docs/ 现有测试文档体系同层 |
| 需求轨用例文档目录 | `docs/test-cases/requirements/` | 需求轨归 `prd-driven-testing` |
| 模块运行命令 | `npm run test:e2e:<module>` | 落地时在 package.json 注册（如 `test:e2e:chat`、`test:e2e:settings`、`test:e2e:memory`） |
| 运行封装单入口 | `scripts/run-and-archive.mjs` | rotate→run→generate→archive 并回传原始退出码，禁止手写四段串联 |
| 报告归档目录 | `qa-screenshots/history/` | 现有 `qa-screenshots/` 平铺截图保留不动，按次归档进 `history/<module>/<timestamp>/` |
| 归档四要素 | report.md / results.json / HTML 报告 / video+trace | 每种要素齐全，每个业务 TC 一个唯一视频 |
| 被测前端源码 | 本仓 `src/`（相对测试目录只读） | React 19 + Vite，无组件库（自研 CSS + lucide-react 图标） |
| 被测后端源码 | 本仓 `server/`（相对测试目录只读） | Express，接口文档见 `docs/api/` |
| 前置服务 | `npm run dev`（前端 5173 + 后端 8787） | 或 Playwright `webServer` 配置自动拉起 |
| 管理令牌 | `MEMORY_AGENT_ADMIN_TOKEN`（本地开发用 `dev-token`） | E2E 登录态通过 `/api/auth/login` 建立 |
| 数据目录 | `data/` 为用户真实数据，**测试禁写** | E2E 通过环境变量把 `MEMORY_AGENT_WORKSPACE_DIR`、数据根指向临时目录 |

## 边界（硬约束）

- 只修改 `e2e/`、`docs/test-cases/` 和测试相关配置（package.json test 脚本、playwright 配置）。
- 被测前端/后端源码（`src/`、`server/`）**只读**：发现产品缺陷时记录触发条件和证据（截图/trace + 复现步骤），登记 GitHub Issues，不修复业务代码。
- **禁止让 E2E 读写真实 `data/` 目录**（含用户记忆、会话、API Key）：运行被测服务时必须注入临时数据根目录，结束后清理。
- 保留历史归档，禁止删除 `qa-screenshots/history/`。
- **串行执行**测试命令，禁止同时运行多个 `test:e2e:*`。
- 对操作日志或大量测试记录做全量脚本统计，不抽样推断。

## 标准流程

1. 环境搭建或环境问题时：`npm install` → `npx playwright install chromium` → `npm run dev` 确认 5173/8787 可达；设置 `MEMORY_AGENT_ADMIN_TOKEN`。
2. 读 `e2e/README.md` 和目标模块现有文档、POM、spec。
3. 从只读源码确认字段、真实文案、DOM、接口参数和空状态：接口以后端 `server/` 与 `docs/api/` 为准，页面结构以前端 `src/` 源码为准（含移动端布局分支——桌面聊天主视图 vs 移动端聊天/设置页是两套 DOM）。
4. 创建或修改用例文档时，完整读 `references/test-case-doc.md`。**回归轨 TC md 一律落在 `docs/test-cases/regression/`**，元信息表必须含 `| 用途 | regression |`。
5. 创建或修改 POM、spec、fixture、数据清理时，完整读 `references/test-code-patterns.md`。
6. 用 `references/sync-validation.md` 同步核对文档、关联命令和归档标题。
7. 运行和调试时，完整读 `references/execution-and-debugging.md`。
8. 完整串行运行指定模块（`npm run test:e2e:<module>`），核对当次报告、TC 目录和视频；修复后重跑完整模块。
9. 报告由运行命令自动生成；`scripts/run-and-archive.mjs` 单入口封装 rotate→run→generate→archive 并回传原始退出码，禁止手写四段串联。

## 登录态与前置（本项目特有）

- 应用受管理令牌保护：spec 前置先经登录页或直接 `POST /api/auth/login` 建立会话；登录用例本身覆盖「错误令牌 → 错误提示」与「正确令牌 → 进入工作台」。
- 聊天主流程依赖模型供应商：E2E 一律 mock 后端模型调用（或使用本地桥接 stub），**不在 E2E 中打真实模型 API**；联网搜索同理。
- 记忆相关 E2E 的数据落在临时数据根的 `data/memory/`，用例内自建自清，不污染真实记忆。

## 用例设计

- 一条业务用例对应：一个 TC-ID、一个 `test()`、一个归档目录、一个业务视频。
- 按用户路径排列：入口与登录 → 基础结构（角色/会话侧栏）→ 主流程（发消息/工具任务/记忆审核）→ 搜索/筛选 → 详情/边界（设置页、移动端）。
- 优先断言业务结果（消息气泡内容、会话标题、记忆条目、弹窗内容、URL），不只断言输入框值或容器可见。
- 搜索同时覆盖存在和不存在的数据；先等初始列表稳定，再等携带目标参数的请求，最后验证结果集合。
- 下拉、Tabs、状态筛选（角色切换、供应商切换、会话筛选）**实际切换选项**并断言生效。
- 删除角色、删除会话、删除/禁用记忆、清空数据等**不可逆操作默认停在最终确认前**；确需真实删除的，由当前用例自建专属数据并在清理段验证删除成功。
- 批量操作由当前用例创建至少两条专属数据，实际执行并逐条验证，不借用环境已有数据。

## 终态校验（红线）

- 用例最终的「通过」判定必须落在 **UI 层断言**上（`toBeVisible`、`toHaveText`、`toHaveCount` 等 Locator 行为型 matcher，或 URL pathname 变化）。
- 接口只允许三类辅助用途：①前置数据准备与事后清理；②关键交互前时序同步（`waitForResponse` 配合点击）；③对已成立 UI 结果的交叉复核。
- **以下任一情况视为违规，即使 spec 报绿也属假阳性**：仅凭 `response.ok()` 或 body 字段结束用例；把「接口创建/删除成功」等同「界面出现/消失」而未回 DOM 核实；以「接口返回空数组」当页面空态证据而未核验 DOM。
- 编写 TC md 时，「预期结果」每条必须映射到浏览器可视区域内一个观测锚点，不接受纯接口语义的预期。
- 失败排查优先从 trace 视频/截图中的界面现象出发；HTTP 200 不能单独用于关掉失败报告或缺陷工单。

## 数据复原

- 新增：开始前清理同名残留，结束时删除并确认不存在。
- 修改：保存原值，结束写回并重读确认。
- 删除：保存完整数据，结束重建；无法可靠恢复时不要执行真实删除。
- 状态切换：记录初始状态并恢复。
- 在当前用例或 `afterEach` 完成清理，不依赖后续用例；清理失败不得静默吞掉，最终断言残留集合为空。
- **一切数据的落点都在临时数据根**，用例结束连临时根一起清理。

## 等待与视频

- 用接口响应、URL、Locator 状态或业务结果等待；**禁止固定等待替代条件等待**（现有 `scripts/capture-screenshots.mjs` 中的 `waitForTimeout(300)` 仅截图脚本可用，不得带入 E2E）。
- 自研下拉/抽屉/弹层（角色菜单、供应商切换、工具抽屉）容器可见后，等内部选项可见再 count/click/断言。
- 展示已验证的中间状态可短暂停留约 0.8~1.2 秒；不在 test 末尾加录制等待（fixture 已统一保留最终画面）。
- 流式聊天回复逐段渲染：等待流结束标记或消息气泡进入终态，再断言内容。

## 完成条件

- 文档和 spec 的 TC-ID、标题、步骤、预期、登录方式与清理方式一致；元信息中的覆盖范围、链接和运行命令有效。
- `npm run test:e2e:<module>` 完整运行对应模块；跳过项有明确原因。
- 当次历史目录包含归档四要素（每种要素齐全，每个业务 TC 一个唯一视频）。
- 汇报执行命令、通过/失败/跳过数量、归档位置和未解决的产品问题。

## 全量回归与用例更新维护

完整流程读 `references/regression-workflow.md`。要点：

1. **启动自检**：扫历史归档识别环境性集体 skipped；出现 `expected===0` + 短 duration + 秒挂信号时先修环境（服务未起/令牌缺失/临时根未建），再谈测试。
2. **执行纪律**：始终 `npm run test:e2e:<module>` 串行；并行会写破 meta 竞态导致归档串目录。
3. **失败归类四型分别处置**：
   - A 环境 → 修环境（dev server、令牌、Playwright 浏览器版本）；
   - B 种子数据缺失 → spec 内 detect empty state + `test.skip(condition, reason)` + 同步 TC md 预期段补空态分支；
   - C 组件时序耦合（弹层、流式渲染等）→ 三层防御（预清理 + force-click + goto 兜底），终态改业务级不变量断言；
   - D 清理流水线抖动 → retry-with-reset helper 包裹但末尾保留硬 expect。
4. **Fix 应用范围**：单条修完先重跑所在模块定论；受同一 POM 变更影响的兄弟模块排进同一 sweep 依次过一遍。
5. **绿灯收尾判据**：各模块最近一次归档满足 `unexpected===0 && flaky===0 && expected>0`；允许合规 skipped 但需列明 TC-ID 与豁免类别。
6. **合规豁免只接受 B/D 两类**且必须同步文档与代码——不允许为通过而弱化核心业务 Locator 断言。

## 与 prd-driven-testing 的分工界面

| 场景 | 归属 |
|---|---|
| 某个 docs/ 下 PRD 功能从未有过 automation → 首轮功能验收 | prd-driven-testing |
| 存量功能日常巡检/失败分析/视频核对 | 本 skill |
| 既存用例随产品迭代微调 selector/文案 | 本 skill |
| PRD 变更引发的新分支用例补充评估 | prd-driven-testing 评估，必要时新建 |
| 终态校验红线/等待视频纪律/归档链路细节 | 两轨共用，以本 skill 为准 |

需求轨用例转为长期巡检资产时，`git mv` 到 `docs/test-cases/regression/` 与改「用途」列值必须同一次改动完成。
