# 自动化测试 Skill 模板包

从两个实战项目提炼的 5 个测试 skill 模板及接口 references 模板，用于把「接口文档 ↔ 接口用例同步」与「PRD → UI 用例 → 回归」的方法论复用到新项目。

> 来源项目：
> - 接口层：`comate-api-automation`（pytest 接口自动化，3 个 skill）
> - UI 层：`comate-webui-automation`（Playwright E2E，2 个 skill）

## 模板清单

| 模板 | 层 | 适用场景 | 职责 |
|---|---|---|---|
| [api/api-doc-generator](api/api-doc-generator.SKILL.template.md) | 接口 | 后端接口文档缺失或与代码脱节 | 源码 → 标准接口文档（生成 + 增量更新） |
| [api/api-test-case-generator](api/api-test-case-generator.SKILL.template.md) | 接口 | 需要接口自动化用例与修复 | 接口文档/PRD → 用例生成、失败诊断与修复 |
| [api/sync-api-tests](api/sync-api-tests.SKILL.template.md) | 接口 | 上游代码频繁迭代 | 监听上游仓变更 → 同步文档与用例 → 冒烟 → 提 CR |
| [webui/console-e2e-test](webui/console-e2e-test.SKILL.template.md) | UI | 存量功能回归巡检 | E2E 用例/POM/spec 编写、运行、归档、回归维护 |
| [webui/prd-driven-testing](webui/prd-driven-testing.SKILL.template.md) | UI | 新需求首轮功能验收 | PRD/需求卡片 → 变动清单 → TC 文档 → POM/spec |

## 推荐组合

| 项目形态 | 建议安装 |
|---|---|
| 纯接口测试项目 | api 三件套（doc-generator + test-case-generator + sync-api-tests） |
| 纯 UI 测试项目 | webui 双轨（console-e2e-test + prd-driven-testing） |
| 接口 + UI 全覆盖 | 5 个全装（两套互不依赖，可并存于同一项目） |
| 文档已有专人维护，只想同步用例 | 仅 sync-api-tests，删去其步骤 3 |

## 使用方法（3 步）

1. **复制**：本仓已将五个模板适配为可直接加载的项目 skill，生效副本位于 `.comate/skill/<skill-name>/SKILL.md`；其他项目仍可按需复制到其约定的 skill 根目录。
2. **复用**：本仓版本已移除项目占位符，真实项目事实以 `README.md`、`docs/api/`、`server/`、`src/` 为准。
3. **自检**：检查 `.comate/skill/` 下五个 `SKILL.md` 的 frontmatter、路径和命令，再按 checklist 做冷启动验证。

## 方法论骨架（所有模板共享的设计思想）

模板刻意把「方法论」与「项目配置」分离：

- **保留为骨架（适配时不要改）**：流程步骤与门禁顺序、质量红线（断言原则 / 数据清理 / 失败诊断分层）、工件契约（meta.json、TC-ID、归档结构）
- **占位符化（必须按项目填）**：上游仓清单、目录结构、环境集合、账号体系、平台链路（CR / 通知 / 卡片 / 用例归档平台）

换项目时只动占位符、不动骨架——这是模板能跨项目复用的根本原因。

## references 附属文件

模板正文内联了核心方法论；接口模板同时提供了可直接迁移的 `references/` 和 `evals/`。落地时按下表将 `.template.md` 去掉并放到对应 skill：

| skill | 建议保留 | 说明 |
|---|---|---|
| api-test-case-generator | api-client-standards / test-standards / test-patterns / conftest-patterns / fix-recipes / api-gotchas | 客户端、用例、fixture、错误和坑点规范 |
| sync-api-tests | api-client-standards / test-standards / fix-recipes / api-gotchas | 同步改写和冒烟诊断共享规范 |
| api-doc-generator | doc-template / api-gotchas | 文档格式与接口特殊行为 |
| console-e2e-test | setup / test-code-patterns / execution-and-debugging / regression-workflow / faq | 环境搭建、代码范式、调试纪律 |
| prd-driven-testing | card-ingest / conversion-checklist / expectation-provenance / artifact-templates | 卡片摄取、转化清单、溯源门槛、产物模板 |

## 接口 references 模板

接口三件套共享以下可迁移规范，复制 skill 时按需一并复制到对应 skill 的 `references/`：

| 文件 | 作用 |
|---|---|
| [api-client-standards](api/references/api-client-standards.template.md) | API 客户端分层、认证、响应、超时、重试和资源管理 |
| [test-standards](api/references/test-standards.template.md) | 数据、断言、权限、清理、日志和提交门禁 |
| [test-patterns](api/references/test-patterns.template.md) | 单接口、流程、权限、批量、分页、上传和异步模板 |
| [conftest-patterns](api/references/conftest-patterns.template.md) | fixture 生命周期、账号前置和临时数据 |
| [fix-recipes](api/references/fix-recipes.template.md) | L1→L5 失败诊断、修复三禁和缺陷判定 |
| [api-gotchas](api/references/api-gotchas.template.md) | 运行中沉淀接口特殊行为和断言影响 |
| [doc-template](api/references/doc-template.template.md) | 接口文档头部、索引、接口详情和质量门禁 |

`api/evals/evals.json` 提供三个冷启动验证提示词；复制到新项目后，将其中的 `{{...}}` 替换为项目真实路径和模块。
