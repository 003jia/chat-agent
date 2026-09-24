# 接口文档模板（docs/api/<module>.md）

> 空骨架：生成文档时复制本结构逐模块填写。头部必须记录 `synced_commit` 供回溯。

# <module> 模块接口文档

- synced_commit: `<sha8>`
- 更新时间: YYYY-MM-DD
- 源码: `server/<module>.mjs`（路由注册于 `server/app.mjs`）
- 权限模型: 除 `POST /api/auth/login`、`GET /api/health` 外均需 `adminAuth`

## <METHOD> /api/<path>

- 权限：`adminAuth` + 限流器（`chatLimiter` / `writeLimiter`，见 `server/app.mjs`）
- 用途：
- 请求参数：

| 字段 | 类型 | 必填 | 枚举/范围 | 说明 | 数据来源 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

- 响应结构（完整示例，嵌套层级写全取值路径）：

```json
{}
```

- 错误码：

| code | HTTP | 触发条件 |
|---|---|---|
|  |  |  |

- 时序图（跨服务调用时，如 chat → 模型供应商、memory → Embedding 接口）：
- 运行配置差异（受哪些环境变量影响：`MEMORY_AGENT_ADMIN_TOKEN`、`MEMORY_AGENT_WORKSPACE_DIR`、各模型 Key、限流常量）：
