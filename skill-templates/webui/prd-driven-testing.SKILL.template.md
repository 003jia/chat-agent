---
name: prd-driven-testing
description: Use when turning a Memory Agent Workbench PRD in `docs/` into first-pass UI acceptance tests, especially new or changed chat, memory, tools, settings, or responsive-layout behavior not yet covered by regression E2E.
---

# Memory Agent Workbench PRD 驱动需求测试

## 事实源与产物

- PRD 来源：`docs/`，例如 `prd-companion-refresh.md`、`PRD-会话摘要真接入AI.md`。
- 实现核实：`src/`、`server/`、`docs/api/`；变动对照：`git log`/`git show`，只读。
- 需求轨用例写入 `docs/test-cases/requirements/`，命名 `TC-<module>-00N_<short-name>.md`。
- 稳定后移交 `console-e2e-test`，回归轨写入 `docs/test-cases/regression/`。

## 门禁顺序

用例文档 → 用户显式 review → TC-ID 本地登记 → POM/spec → 试跑。未获得 review 不得写 E2E 代码，避免实现与评审后的需求分叉。

## 九步工作流

1. 通读 PRD，锁定 P0/P1/P2、验收标准、非目标和开放问题。
2. 结合 `git log` 与当前 `src/`/`server/` 产出“新增/变更/删除/未变”清单；每行附 PRD 小节和源码锚点。
3. 检查 `docs/api/` 是否覆盖相关接口；缺失时先请求 `api-doc-generator` 补文档。
4. 每个清单行至少映射一条 TC；删除项要有“旧入口不存在”断言，未实现项登记延期，不假装通过。
5. 过缺口检查：主流程、搜索/筛选、批量/多选、锁定或待审核状态、空态 DOM。
6. 将完整 TC md 交用户评审，报告模块、TC 数量、P 级分布、延期项和偏差登记。
7. 评审通过后做 TC-ID 查重和目录登记，不复制第二份用例正文。
8. 生成 POM/spec，建立 TC↔POM↔spec 矩阵；最终断言必须是 UI 可观测结果。
9. 串行试跑，核对命令、临时数据、报告、截图/video/trace；发现实现偏差时回写 TC 和登记表。

## 约束

- PRD 是“应然”，实现是“实然”；两者不一致必须记录偏差并请用户确认，不可用实现自证需求。
- P2（空态、极值、长文本、展开收起、入口清点）必须覆盖；P3 可延期但要写理由。
- 禁止触碰真实 `data/`、真实 API Key、真实模型和不可逆外部操作。
- 需求轨稳定后同一次改动完成 `git mv` 到回归目录，并将“用途”改为 `regression`。

## 完成条件

- 变动清单逐行闭合，TC-ID 唯一，评审结论已记录。
- 测试代码只在评审后生成，所有预期都有浏览器观测锚点。
- 报告明确通过/失败/跳过、证据、偏差、延期和遗留风险。
