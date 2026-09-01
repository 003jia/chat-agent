# model-config 模块接口文档（多供应商模型配置）

- synced_commit: `3f06b8ba`
- 更新时间: 2026-08-31
- 源码: `server/app.mjs`（L1045-1097）、`server/config.mjs`
- 数据来源: `data/config/models.json`（持久化）；环境变量 `MEMORY_AGENT_API_KEY_<PROVIDER>`（Key 的 env 来源，优先级高于文件）

## 供应商 ID 枚举（完整，`defaultModelConfig.providers`）

| id | label | 默认 baseURL | 默认 model | contextLength |
|---|---|---|---|---|
| `openai-compatible` | OpenAI Compatible | `https://api.openai.com/v1` | `gpt-4.1-mini` | 64000 |
| `openai` | OpenAI | `https://api.openai.com/v1` | `gpt-4.1-mini` | 64000 |
| `deepseek` | DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | 64000 |
| `codex` | Codex GPT-5.6 | `http://127.0.0.1:8899/v1` | `gpt-5.6-sol` | 272000 |
| `anthropic` | Anthropic | `https://api.anthropic.com/v1` | `claude-3-5-sonnet-latest` | 64000 |

- 对应环境变量：`MEMORY_AGENT_API_KEY_OPENAI_COMPATIBLE` / `_OPENAI` / `_DEEPSEEK` / `_CODEX` / `_ANTHROPIC`
- `contextLength` 归一化下限 1000；`status` 枚举：`ready`（有 Key）/ `missing`（无 Key）

## GET /api/model-config

- 权限：`adminAuth`
- 用途：读取模型配置（**apiKey 恒为空串**，前端只见是否已配置）
- 响应结构（完整示例，注意取值路径 `providers.<id>.apiKey*`）：

```json
{
  "selectedProvider": "openai-compatible",
  "providers": {
    "openai-compatible": {
      "id": "openai-compatible",
      "label": "OpenAI Compatible",
      "baseURL": "https://api.openai.com/v1",
      "model": "gpt-4.1-mini",
      "embeddingModel": "",
      "contextLength": 64000,
      "status": "missing",
      "apiKey": "",
      "apiKeySource": "env",
      "apiKeySet": true,
      "apiKeyPreview": "sk-••••••••"
    }
  }
}
```

- 字段语义：`apiKeySource` 枚举 `env` / `file` / `none`；`apiKeyPreview` 仅两种：`sk-••••••••`（sk- 开头）或 `••••••••`；`status = apiKey ? (status || "ready") : "missing"`

## PUT /api/model-config

- 权限：`adminAuth` + `writeLimiter`
- 用途：按供应商合并更新配置并持久化（未传的供应商保持原样）
- 请求参数（body，均可选）：

| 字段 | 类型 | 约束 | 说明 | 数据来源 |
|---|---|---|---|---|
| selectedProvider | string | 必须是供应商枚举 id，否则回落默认 | 切换选中供应商 | 请求体 |
| providers | object | key ∈ 供应商枚举；逐字段合并 | 更新供应商字段 | 请求体 |
| providers.<id>.baseURL | string | `validateProviderBaseURL` 校验（见错误码） | 接口地址 | 请求体 |
| providers.<id>.apiKey | string | 若该供应商已有 env Key，则文件中存空串（env 优先） | API Key | 请求体 |

- baseURL 校验规则（源码 `server/config.mjs` L174-191）：
  1. 必须是合法 URL，且不能内嵌账号密码；
  2. **仅允许 HTTPS**；例外：`localhost` / `127.0.0.1` / `::1` / `[::1]` 允许 HTTP（兼容 Ollama 等本地模型）；
  3. 通过后去除 hash 与尾部 `/`。
- 错误码：

| code | HTTP | 触发条件 |
|---|---|---|
| PROVIDER_URL_INVALID | 400 | URL 非法或内嵌账号密码 |
| PROVIDER_URL_INSECURE | 400 | 非 HTTPS 且非本机 HTTP |

- 副作用：写入 `models.json` 时剥离运行时字段（`apiKeySource/apiKeySet/apiKeyPreview`）
- 响应：脱敏后的配置对象（同 GET）

## POST /api/model/test

- 权限：`adminAuth` + `writeLimiter`
- 用途：连通性测试——用**当前选中供应商**发一条固定消息「Reply with OK.」；配置了 `embeddingModel` 时再调一次 Embedding 接口
- 请求参数：无 body
- 响应结构（200，完整示例）：

```json
{ "ok": true, "message": "OK", "embeddingReady": false }
```

- `message`：模型回复 trim 后截断 ≤120 字符；`embeddingReady`：是否配置了 embeddingModel
- 副作用：成功后把该供应商在 `models.json` 中的 `status` 写为 `ready`
- 错误码（模型调用失败经 `classifyProviderError` / `mapModelError` 映射）：

| code | HTTP | 触发条件 |
|---|---|---|
| MISSING_API_KEY | 400 | 当前供应商无 API Key |
| CONFIG_ERROR | 400 | 供应商不存在或缺少模型名 |
| AUTH_FAILED | 401/403 | 供应商返回 401/403（API Key 认证失败） |
| MODEL_NOT_FOUND | 404 | 供应商返回 404 |
| NETWORK_ERROR | ≥500 / 504 | 供应商 5xx，或请求超时（AbortError） |
| MODEL_RESPONSE_ERROR | 其他 | 模型返回异常 |

- 时序图（跨服务调用）：

```text
服务端 → 模型供应商 /chat/completions（"Reply with OK."）
       → [可选] /embeddings（"memory retrieval connection test"）
       → 写 models.json status=ready → 200
```
