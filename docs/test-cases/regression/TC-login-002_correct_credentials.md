# TC-login-002 正确凭证进入工作台

| 字段 | 值 |
|---|---|
| 用途 | regression |
| 覆盖范围 | 登录（正确凭证 → 进入工作台） |
| 运行命令 | `npm run test:e2e:login` |
| 关联 spec | `e2e/specs/login.spec.ts`（TC-login-002 正确凭证进入工作台） |
| 账号/登录方式 | 管理令牌登录（e2e-server 默认 admin/admin123 + `dev-token`） |
| 清理方式 | 隔离数据根，无持久化副作用 |

## 前置条件

同 TC-login-001。

## 步骤

1. 访问 `http://127.0.0.1:5173/`
2. 登录页输入账号 `admin`、密码 `admin123`
3. 点击「登录并进入」
4. 断言进入工作台（`[data-companion]` 可见）

## 预期结果

1. 登录成功后工作台可见（锚点：`[data-companion]`）

## 数据清理说明

登录成功写审计日志（隔离数据根）；无持久化用户数据。
