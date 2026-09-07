# TC-login-001 错误凭证登录提示

| 字段 | 值 |
|---|---|
| 用途 | regression |
| 覆盖范围 | 登录（错误凭证 → 错误提示） |
| 运行命令 | `npm run test:e2e:login` |
| 关联 spec | `e2e/specs/login.spec.ts`（TC-login-001 错误凭证登录提示） |
| 账号/登录方式 | 管理令牌登录（e2e-server 默认 admin/admin123 + `dev-token`） |
| 清理方式 | 隔离数据根，无持久化副作用 |

## 前置条件

- 前后端已由 webServer 自动拉起
- 服务端已配置 `MEMORY_AGENT_ADMIN_TOKEN=dev-token`

## 步骤

1. 访问 `http://127.0.0.1:5173/`
2. 登录页输入账号 `admin`、密码 `wrong-password`
3. 点击「登录并进入」
4. 断言错误提示可见且含「账号或密码不正确」

## 预期结果

1. 错误提示可见（锚点：`.access-setup-error[role=alert]`）
2. 提示文本含「账号或密码不正确」

## 数据清理说明

登录失败会写审计日志（落在隔离数据根 `.e2e-tmp`）；无持久化用户数据。
