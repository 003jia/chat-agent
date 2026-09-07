# TC-summary-005 摘要面板入口可达

| 字段 | 值 |
|---|---|
| 用途 | requirement |
| 覆盖范围 | 会话摘要（入口清点） |
| 运行命令 | `npm run test:e2e:summary`（待接入） |
| 关联 spec | `e2e/specs/summary.spec.ts`（待落地） |
| 账号/登录方式 | 管理令牌登录（临时令牌 + 临时数据根 `.e2e-tmp`） |
| 清理方式 | 隔离数据根，无持久化副作用 |

## 前置条件

已登录；已有对话消息。

## 步骤

1. 打开聊天区，检查「生成摘要」入口存在（`.quick-actions` 中含 `text.chat.summary`）
2. 点击入口，确认摘要面板打开

## 预期结果

1. 生成摘要按钮在聊天区快捷操作栏可见（锚点：`.desktop-workbench .quick-actions button` 含「生成摘要」）
2. 点击后摘要面板打开（锚点：`.drawer-panel` 含「重新生成」「加入候选记忆」按钮）

## 数据清理说明

无持久化副作用。
