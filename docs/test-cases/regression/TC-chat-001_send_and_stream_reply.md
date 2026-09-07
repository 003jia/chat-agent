# TC-chat-001 发送消息并收到流式回复

| 字段 | 值 |
|---|---|
| 用途 | regression |
| 覆盖范围 | 聊天主流程（欢迎屏 → 发消息 → 流式回复终态） |
| 运行命令 | `npm run test:e2e:chat` |
| 关联 spec | `e2e/specs/chat.spec.ts`（TC-chat-001 发送消息并收到流式回复） |
| 账号/登录方式 | 管理令牌登录（`POST /api/auth/login` 换临时令牌 + 临时数据根 `.e2e-tmp`） |
| 清理方式 | `scripts/e2e-server.mjs` 使用隔离数据根；用例无持久化副作用，结束即废弃 |

## 前置条件

- 前后端已由 `playwright.config.mjs` webServer 自动拉起（vite 5173 + e2e-server 8787）
- 模型调用走 e2e-server 注入的 mock（不打真实模型 API）
- 已通过 `loginViaApi` 注入管理令牌到 sessionStorage

## 步骤

1. 访问 `http://127.0.0.1:5173/`
2. 空会话显示欢迎屏 composer（placeholder「发消息，或让智能体记住一件事...」）
3. 输入「请记住：我偏好先计划再执行。」并点击发送（aria-label=发送）
4. 等待用户消息气泡出现
5. 等待助手消息气泡终态并包含 mock 回复文本「E2E mock 回复：流式增量。」

## 预期结果

1. 欢迎屏 composer 可见（浏览器可视区域观测锚点：`input[placeholder=发消息...]`）
2. 用户消息以气泡显示且正文含「请记住：我偏好先计划再执行。」（锚点：`.message-row.user .bubble`）
3. 助手消息气泡正文含「E2E mock 回复：流式增量。」（锚点：`.message-row.assistant .bubble`）

## 数据清理说明

无新增持久化数据（记忆候选抽取被 mock 为空）；测试用隔离数据根 `.e2e-tmp`，运行前由 global-setup 清理。
