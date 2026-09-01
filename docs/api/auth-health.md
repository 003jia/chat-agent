# auth-health 模块接口文档

- synced_commit: `3f06b8ba`
- 更新时间: 2026-08-31
- 源码: `server/app.mjs`（路由，L760-792）、`server/auth.mjs`
- 说明: 本文档同时记录**全局约定**（鉴权、错误包络、限流、CORS），其余模块文档不再重复。

## 全局约定

### 鉴权（`adminAuth` 中间件，源码 `server/auth.mjs`）

- 除 `POST /api/auth/login`、`GET /api/health`、`GET /api/roles/:roleId/background`、静态资源外，所有接口都要求请求头 **`X-Admin-Token`**。
- 令牌来源：环境变量 `MEMORY_AGENT_ADMIN_TOKEN`，服务端做 timing-safe 比对。
- 未设置环境变量 → `401 AUTH_REQUIRED`「服务端未设置 MEMORY_AGENT_ADMIN_TOKEN，写入和模型调用接口已关闭。」
- 缺少请求头 → `401 AUTH_REQUIRED`「缺少 X-Admin-Token。」
- 令牌不匹配 → `403 AUTH_FAILED`「管理员令牌不正确。」

### 错误包络（`server/app.mjs` L1596-1605）

所有错误响应统一结构：

```json
{ "ok": false, "code": "VALIDATION_ERROR", "message": "…", "detail": "可选" }
```

未知异常 `code = INTERNAL_ERROR`（HTTP 500）。

### 限流（`server/constants.mjs` + `createRateLimiter`，按请求 IP）

| 限流器 | 窗口 | 上限 | 应用接口 |
|---|---|---|---|
| `chatLimiter` | 60s | 30 | `/api/chat`、`/api/chat/stream`、`/api/web-search` |
| `writeLimiter` | 60s | 60 | 其余全部写接口（POST/PUT/PATCH/DELETE） |

超限 → `429 RATE_LIMITED`「请求过于频繁，请稍后再试。」

### 运行配置差异（环境变量）

| 变量 | 影响 |
|---|---|
| `MEMORY_AGENT_ADMIN_TOKEN` | 未设置时写接口全部关闭（401） |
| `MEMORY_AGENT_ADMIN_USERNAME` / `MEMORY_AGENT_ADMIN_PASSWORD` | 登录凭证，默认 `admin` / `admin123` |
| `MEMORY_AGENT_API_KEY_<PROVIDER>` | 供应商 API Key（env 优先于界面保存的 file Key） |
| `MEMORY_AGENT_WORKSPACE_DIR` | 工具工作区根目录（默认 `data/workspace`，需绝对路径） |
| `PORT` | 监听端口，默认 `8787`，仅监听 `127.0.0.1` |

### 数据来源

鉴权状态来自进程环境变量；登录/任务/审批/取消/工具执行会写审计日志 `data/audit/YYYY-MM-DD.ndjson`（不记录消息正文）。

### 静态托管兜底（非 API）

`dist/index.html` 存在时（生产构建），同端口托管前端：`dist/` 静态资源（max-age 1h）+ 非 `/api` 开头的 GET/HEAD 全部回落 `index.html`（SPA 路由）。开发模式（Vite 5173）下不生效。

## POST /api/auth/login

- 权限：无令牌（`writeLimiter` 限流）
- 用途：账号密码登录，换取管理令牌（前端将其作为 `X-Admin-Token` 使用）
- 请求参数：

| 字段 | 类型 | 必填 | 枚举/范围 | 说明 | 数据来源 |
|---|---|---|---|---|---|
| username | string | 是 | — | 登录账号，默认 `admin` | 请求体，比对 `MEMORY_AGENT_ADMIN_USERNAME` |
| password | string | 是 | — | 登录密码，默认 `admin123` | 请求体，比对 `MEMORY_AGENT_ADMIN_PASSWORD` |

- 响应结构（200，完整示例）：

```json
{ "ok": true, "token": "<MEMORY_AGENT_ADMIN_TOKEN 原文>" }
```

- 错误码：

| code | HTTP | 触发条件 |
|---|---|---|
| AUTH_NOT_CONFIGURED | 503 | 服务端未配置 `MEMORY_AGENT_ADMIN_TOKEN` |
| AUTH_FAILED | 401 | 账号或密码不正确 |

- 权限流程图：`登录凭证比对（env）→ 通过：审计 auth.login/success + 返回令牌；失败：审计 auth.login/failure + 401`
- 成功/失败均写审计日志（metadata 含 username 与 ip）。

## GET /api/health

- 权限：无令牌
- 用途：就绪探针，检查三组本地依赖
- 响应结构（200，完整示例，取值路径 `readiness.<key>`）：

```json
{
  "ok": true,
  "readiness": { "dataStore": true, "config": true, "memory": true }
}
```

- 就绪检查项与数据来源：
  - `dataStore`：`data/` 目录可读写（自动 mkdir）
  - `config`：`data/config/{roles,models,teams}.json` 可严格解析（任一损坏即 false）
  - `memory`：`data/memory/index.json`、`data/memory/embeddings.json` 可严格解析且 `memory.md` 可读写
- 错误码：

| code | HTTP | 触发条件 |
|---|---|---|
| READINESS_FAILED | 503 | 任一检查项失败；响应体为 `{ ok:false, readiness:{…}, code:"READINESS_FAILED", detail:{<检查项>:<错误消息>} }` |
