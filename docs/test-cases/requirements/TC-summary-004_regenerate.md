# TC-summary-004 摘要重新生成

| 字段 | 值 |
|---|---|
| 用途 | requirement |
| 覆盖范围 | 会话摘要（重新生成） |
| 运行命令 | `npm run test:e2e:summary`（待接入） |
| 关联 spec | `e2e/specs/summary.spec.ts`（待落地） |
| 账号/登录方式 | 管理令牌登录（临时令牌 + 临时数据根 `.e2e-tmp`） |
| 清理方式 | 隔离数据根，无持久化副作用 |

## 前置条件

同 TC-summary-001；已完成首次摘要生成。

## 步骤

1. 在摘要面板点击「重新生成」按钮（`text.summaryPanel.regenerate` = 重新生成）
2. 等待摘要内容刷新

## 预期结果

1. 重新生成按钮可见可点（锚点：`.desktop-workbench .drawer-panel button` 含「重新生成」）
2. 点击后 `.markdown-preview` 内容更新为最新 mock 摘要（spec 内 `page.route` 二次响应返回不同文本，断言内容变化）
3. 状态栏提示「摘要已生成」

## 数据清理说明

mock 摘要不落库；隔离数据根运行前清理。
