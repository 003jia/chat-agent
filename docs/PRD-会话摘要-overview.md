# 概览：会话摘要「真接入 AI」PRD（P-2）

## 完成内容
为架构评审中的 **P-2** 撰写了完整产品规格文档：`docs/PRD-会话摘要真接入AI.md`。

## 核心结论
- 现有"生成摘要"是**前端假实现**（`useWorkbenchState.ts:547` 仅拼模板，不调模型），后端无摘要接口。
- 方案：后端新增 `POST /api/conversations/:conversationId/summary`，复用 `server/model.mjs` 的 `callModel` 与系统护栏；前端 `generateSummary()` 改为调接口；对话 JSON 新增 `summary` 字段持久化；"加入候选记忆"流程不变。
- 已明确 **Non-goals**（不做自动/定时摘要、不进系统 prompt、不替代记忆抽取），并给出指标、风险、合规与 DoD。

## 关键决策（默认项，待评审确认）
- 摘要范围：最近 30 条；一期非流式；覆盖式生成；不进上下文；仅手动触发。
- 摘要接口自备 `max_tokens=800`，不受 P-3 进度阻塞。

## 产出文件
- `docs/PRD-会话摘要真接入AI.md`（主文档）
- `docs/PRD-会话摘要-overview.md`（本概览）

## 下一步
工程评审拍板 Open Questions（Q1–Q5）→ 排期入「Now」迭代（预估 2–3 天）。
