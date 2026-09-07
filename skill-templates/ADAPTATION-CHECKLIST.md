# 新项目适配清单（ADAPTATION-CHECKLIST）

拿到新项目时，按本清单从上到下回答问题 → 填占位符 → 冷启动验证。
「影响的 skill」列标注该答案需要回填到哪些模板。

## A. 项目画像（决定装哪些模板）

| # | 问题 | 答案示例 | 影响 |
|---|---|---|---|
| A1 | 被测对象是接口、UI 还是两者？ | 接口 + UI | 决定 api 三件套 / webui 双轨 / 全装 |
| A2 | 被测产品名？ | XX 控制台 | `{{PRODUCT_NAME}}`（全部） |
| A3 | 上游代码仓有哪些？语言、分支、本地路径？ | 见 sync 模板配置表 | `{{UPSTREAM_REPOS}}`（sync、doc-generator） |
| A4 | 上游迭代频率？（决定是否需要 sync 总调度） | 每天 ~10 commit | sync-api-tests |
| A5 | 接口文档是否已有专人维护？ | 无 | doc-generator 是否需要 |

## B. 测试工程结构（决定占位符取值）

| # | 问题 | 填入的占位符 | 影响的 skill |
|---|---|---|---|
| B1 | 接口测试框架？（pytest / restassured / …） | `{{TEST_FRAMEWORK}}` | test-case-generator |
| B2 | 用例目录怎么分？（按环境 / 按模块） | `{{TEST_DIR_SINGLE}}`、`{{TEST_DIR_FLOW}}` | test-case-generator、sync |
| B3 | 环境集合与切换方式？ | `{{ENV_SET}}`（如 `ENV=saas/poc/vpc`） | 全部 api 模板 |
| B4 | API 封装层目录？ | `{{API_LAYER_DIR}}` | test-case-generator |
| B5 | 用例元数据格式？（有无 meta 文件 / 命名） | `{{META_SUFFIX}}` | test-case-generator、sync |
| B5a | API 客户端使用什么 HTTP 库、统一返回格式和响应解析器？ | `{{HTTP_CLIENT_LIBRARY}}`、`{{RESPONSE_FORMAT}}`、`{{RESPONSE_PARSER}}` | api-client-standards |
| B5b | Base URL、认证头、超时、重试和唯一数据如何配置？ | `{{ENV_CONFIG_SOURCE}}`、`{{AUTH_HEADER}}`、`{{AUTH_ENTRY}}`、`{{UNIQUE_DATA_METHOD}}` | api-client-standards |
| B5c | 分页、上传、下载、异步任务等特殊接口有哪些？ | `{{PAGINATION_FIELDS}}`、`{{CLIENT_EXAMPLES_REF}}` | api-client-standards、test-patterns |
| B5d | API 客户端示例代码需如何映射到目标语言/框架？ | `{{HTTP_CLIENT_LIBRARY}}`、`{{TEST_FRAMEWORK}}` | api-client-standards、test-patterns、conftest |
| B6 | UI 测试框架与工程目录？ | `{{TEST_FRAMEWORK}}`、`{{E2E_DIR}}` | 两个 webui 模板 |
| B7 | 用例文档双轨目录怎么分？ | `{{TC_DIR_REGRESSION}}`、`{{TC_DIR_REQUIREMENT}}` | 两个 webui 模板 |
| B8 | 报告归档目录与「归档四要素」？ | `{{ARCHIVE_DIR}}`、`{{ARCHIVE_QUAD}}` | console-e2e-test |
| B9 | 运行命令与单入口封装脚本？ | `{{RUN_CMD}}`、`{{RUN_ENTRY}}` | 两个 webui 模板、prd |

## C. 账号与数据（安全红线本地化）

| # | 问题 | 填入的占位符 | 影响的 skill |
|---|---|---|---|
| C1 | 各环境预置测试账号字段清单？ | `{{PRESET_ACCOUNTS}}` | test-case-generator、sync |
| C2 | 哪些账号/数据绝对不可改？ | 写入「账号保护」节 | 全部 |
| C3 | 临时数据清理责任模式？（finally / afterEach） | 写入「数据清理」节 | 全部 |
| C4 | 有无共享租户/共享环境（数据残留风险）？ | 写入 L4 诊断提示 | api 层 |
| C5 | 临时资源的清理顺序和失败策略？ | `{{CLEANUP_POLICY}}`、`{{BLOCK_OR_SKIP_POLICY}}` | conftest、test-standards |

## D. 平台链路（外部系统对接）

| # | 问题 | 填入的占位符 | 影响的 skill |
|---|---|---|---|
| D1 | 缺陷提卡平台与默认优先级？ | `{{BUG_PLATFORM}}` | api 层 |
| D2 | CR 流程（push 方式、评审人、可提交范围）？ | `{{CR_FLOW}}` | sync |
| D3 | 群通知渠道（群 ID / webhook / 可选）？ | `{{NOTIFY_CHANNEL}}` | sync |
| D4 | 需求卡片平台及链接格式？ | `{{CARD_PLATFORM}}` | prd-driven-testing |
| D5 | PRD 母本在哪个知识库/文档系统？有无本地镜像？ | `{{PRD_SOURCE}}`、`{{KB_MIRROR}}` | prd |
| D6 | 用例归档平台？导入接口是否幂等？ | `{{TCASE_PLATFORM}}` | prd |
| D7 | 网络约束（代理、内网直连、SSH 特殊处理）？ | `{{PROXY_NOTE}}` | sync、webui |

## E. 落地与自检

1. **复制模板** → 新项目 `.comate/skills/<name>/SKILL.md`（name = frontmatter `name`）。
2. **逐模板填写**其开头的「本 skill 配置表」，并按上表回填正文占位符。
3. **占位符清零检查**：
   ```bash
   grep -rn '{{' .comate/skills/   # 输出为空才算适配完成
   ```
4. **冷启动验证**（每 skill 至少跑一次最小闭环）：
   - doc-generator：挑 1 个模块按模板产出文档，人工核对枚举完整性；
   - test-case-generator：生成 1 个单接口 + 1 条业务流用例并跑通；人为制造一次失败验证 L1→L5 诊断路径；
   - sync-api-tests：对 1 个仓执行「只检测变更」（步骤 1-2），确认 state 基线读取正常；
   - console-e2e-test：串行跑 1 个模块，核对归档四要素齐全；
   - prd-driven-testing：用 1 条已合入的历史卡片走完九步（可跳过平台归档），重点验证评审门禁与 TC↔POM↔spec 三角一致性。
5. **沉淀启动文件**：`{{GOTCHAS_REF}}`、`{{FIX_RECIPES_REF}}` 可先建空骨架（表格头 + 示例行），随运行沉淀。
6. **接口模板附属文件**：将 `api/references/` 下的模板复制到实际 skill 的 `references/`，把 `.template.md` 去掉；`evals/evals.json` 仅作为冷启动评估输入，不要当作业务配置。

## 常见适配错误

- ❌ 只换名字不换目录：`{{TEST_DIR_*}}` 与实际目录不一致，导致 sync 步骤 4 扫不到 meta。
- ❌ 环境集合写死：新项目只有 1 个环境却保留多环境模板段——应删除对应段落而不是留空。
- ❌ 平台链路照抄：CR push 方式、卡片平台、归档平台是公司/团队特定的，必须逐项确认。
- ❌ 删掉红线：适配时觉得「终态校验」「L1→L5」太繁琐而删减——这些是两个来源项目踩坑后的沉淀，是模板的核心价值，禁止删。

## 本项目适配结果（Memory Agent Workbench）

- 产品：Memory Agent Workbench（聊天智能体），单体仓库，无外部上游仓。
- 后端：Node.js + Express 5 ESM，源码 `server/`，路由入口 `server/app.mjs`。
- 前端：React 19 + TypeScript + Vite，源码 `src/`；UI 测试使用 Playwright，当前已有截图 QA，完整 E2E 预留 `e2e/`。
- 接口测试：Vitest + Node ESM，测试与源码同目录共置于 `server/*.test.mjs`；集成测试通过 `createApp()` + `mkdtemp`，不打真实端口。
- 环境：单本地环境，后端 `127.0.0.1:8787`、前端 `127.0.0.1:5173`；管理鉴权为 `X-Admin-Token`，凭证来自测试注入或环境变量。
- 数据红线：真实 `data/` 含会话、记忆和 API Key，任何测试和 E2E 均不得读写；必须使用临时数据根。
- 文档与同步：接口文档在 `docs/api/`，同步基线为 `docs/api-sync-state.json`；无 iCafe、如流、Gerrit 或强制外部归档平台。
- 生效目录：五个适配 skill 位于项目 `.comate/skill/`；`skill-templates/` 保留同版底稿。
