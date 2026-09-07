# TC-summary-002 摘要加入候选记忆

| 字段 | 值 |
|---|---|
| 用途 | requirement |
| 覆盖范围 | 会话摘要（加入候选记忆 → 记忆面板候选区可见） |
| 运行命令 | `npm run test:e2e:summary`（待接入） |
| 关联 spec | `e2e/specs/summary.spec.ts`（待落地） |
| 账号/登录方式 | 管理令牌登录（临时令牌 + 临时数据根 `.e2e-tmp`） |
| 清理方式 | 隔离数据根，候选记忆落在 `.e2e-tmp/data/memory/`，结束自清 |

## 前置条件

同 TC-summary-001；已完成摘要生成。

## 步骤

1. 在摘要面板点击「加入候选记忆」按钮（`text.summaryPanel.addToCandidates` = 加入候选记忆）
2. 等待面板切换为记忆面板
3. 在记忆面板候选区找到 `conversation_summary` 类型条目

## 预期结果

1. 摘要面板中「加入候选记忆」按钮可用（非 disabled，锚点：`.desktop-workbench .drawer-panel button` 含「加入候选记忆」）
2. 点击后记忆面板候选区出现条目（锚点：`.candidate-row` 中 `strong` 含「新增 · 摘要」，`shortTypes.conversation_summary` = 摘要）
3. 候选条目标识类型为会话摘要（`humanMemoryType` 短标签「摘要」）

## 数据清理说明

候选记忆未提交前不落库（仅 `pendingCandidates` 内存态）；隔离数据根运行前清理。
