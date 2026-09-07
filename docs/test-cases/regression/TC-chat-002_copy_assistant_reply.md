# TC-chat-002 助手消息可复制

| 字段 | 值 |
|---|---|
| 用途 | regression |
| 覆盖范围 | 聊天主流程（助手消息复制按钮） |
| 运行命令 | `npm run test:e2e:chat` |
| 关联 spec | `e2e/specs/chat.spec.ts`（TC-chat-002 助手消息可复制） |
| 账号/登录方式 | 管理令牌登录（`POST /api/auth/login` 换临时令牌 + 临时数据根 `.e2e-tmp`） |
| 清理方式 | 隔离数据根，无持久化副作用 |

## 前置条件

同 TC-chat-001；已登录且有至少一条助手消息。

## 步骤

1. 发送一条消息并等待助手回复终态
2. 定位该助手消息操作区的「复制」按钮（aria-label=复制）
3. 点击复制
4. 断言出现复制成功提示（toast / role=status）

## 预期结果

1. 复制按钮可见（锚点：`.message-row.assistant .message-actions button[aria-label=复制]`）
2. 点击后底部状态栏显示「已复制」（锚点：`.status-line` 含「已复制」）

## 数据清理说明

同 TC-chat-001；无新增持久化数据。
