# TC-summary-001 生成摘要并显示在摘要面板

| 字段 | 值 |
|---|---|
| 用途 | requirement |
| 覆盖范围 | 会话摘要（生成 → 面板展示） |
| 运行命令 | `npm run test:e2e:summary`（待接入） |
| 关联 spec | `e2e/specs/summary.spec.ts`（待落地） |
| 账号/登录方式 | 管理令牌登录（临时令牌 + 临时数据根 `.e2e-tmp`） |
| 清理方式 | 隔离数据根，用例自建会话自清 |

## 前置条件

- 前后端已由 `playwright.config.mjs` webServer 自动拉起
- 模型调用走 e2e-server 注入的 mock；**摘要接口（`/api/conversations/:id/summary`）由 spec 内 `page.route` mock**（`summary.mjs` 直连 `callModel`，不走 createApp modelClient）
- 已通过 `loginViaApi` 注入管理令牌

## 步骤

1. 访问 `http://127.0.0.1:5173/`，等待欢迎屏 composer 可见
2. 发送一条消息「请记住：我偏好先计划再执行。」
3. 等待助手回复终态
4. 点击聊天区「生成摘要」按钮（`.quick-actions` 中 `text.chat.summary` = 生成摘要）
5. 等待摘要面板打开并展示摘要内容

## 预期结果

1. 欢迎屏 composer 可见（锚点：`.desktop-workbench input[placeholder=发消息...]`）
2. 用户消息气泡出现（锚点：`.desktop-workbench .message-row.user .bubble`）
3. 助手消息气泡出现（锚点：`.desktop-workbench .message-row.assistant .bubble`）
4. 摘要面板打开且 `.markdown-preview` 非空（锚点：`.desktop-workbench .drawer-panel .markdown-preview`，`toContainText` mock 摘要文本「mock summary」）
5. 状态栏提示「摘要已生成」（锚点：`.desktop-workbench .status-line`）

## 数据清理说明

mock 摘要不落库（`page.route` 拦截）；隔离数据根 `.e2e-tmp` 运行前清理。
