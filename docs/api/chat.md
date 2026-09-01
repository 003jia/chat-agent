# chat 模块接口文档（对话 + 流式对话）

- synced_commit: `3f06b8ba`
- 更新时间: 2026-08-31
- 源码: `server/app.mjs`（L635-757、L1369-1439）、`server/prompt.mjs`、`server/memory.mjs`（召回）
- 依赖: 模型供应商（`/chat/completions`，流式走 delta）、可选联网搜索（`web-search` 模块）、长期记忆召回（`memory` 模块）
- 数据来源: 会话文件追加 user/assistant 两条消息；记忆命中计数经内存缓冲异步合并回 `data/memory/index.json`

## POST /api/chat

- 权限：`adminAuth` + `chatLimiter`（30 次/分钟）
- 用途：非流式对话。流程：校验消息 → 记忆召回（常驻桶 + 检索桶）→ 可选联网搜索 → 组装 system prompt → 调模型 → 保存两条消息 → **后台**抽取候选记忆
- 请求参数：

| 字段 | 类型 | 必填 | 枚举/范围 | 说明 | 数据来源 |
|---|---|---|---|---|---|
| message | string | 是 | trim 后非空，≤8000 字符 | 用户消息 | 请求体 |
| conversationId | string | 否 | 默认 `"default"` | 目标会话；不存在时使用种子会话 | 请求体 |
| mode | string | 否 | `normal` / `web`（`web` 等价开启搜索） | 对话模式 | 请求体 |
| useWebSearch | boolean | 否 | 默认 `false` | 是否联网搜索 | 请求体 |

- 响应结构（200，完整示例）：

```json
{
  "conversation": { "…会话对象，messages 已追加 user+assistant…": "" },
  "reply": {
    "id": "msg-xxxx",
    "role": "assistant",
    "content": "…",
    "timestamp": "2026-08-31T00:00:00.000Z",
    "memoryRefs": ["<memoryId>"],
    "candidateMemoryIds": []
  },
  "relevantMemories": [
    {
      "id": "memory-xxxx",
      "content": "…",
      "type": "user_preference",
      "level": "high",
      "status": "active",
      "retrieval": {
        "score": 6.2,
        "keywordHits": 2,
        "semanticSimilarity": null,
        "resident": false,
        "mode": "keyword"
      }
    }
  ],
  "candidates": [],
  "candidateExtractionPending": true,
  "candidateExtractionError": null,
  "webSearch": null,
  "webSearchError": null
}
```

- 关键取值说明：
  - `retrieval.mode` 枚举：`resident`（常驻桶，score 为 null）/ `hybrid` / `keyword` / `semantic`；`resident: true` 表示高频偏好常驻记忆（`type=user_preference` 且 `level=high`，最多 3 条）
  - `candidates` 恒为 `[]` 且 `candidateExtractionPending: true`——候选抽取是后台任务，结果经流式接口的 `memory.candidates` 事件或记忆候选区下发
  - `webSearch` / `webSearchError` 结构见 `web-search.md`；搜索失败不阻断对话
- 错误码：

| code | HTTP | 触发条件 |
|---|---|---|
| VALIDATION_ERROR | 400 | message 为空或超 8000 字符 |
| MISSING_API_KEY / CONFIG_ERROR | 400 | 当前供应商未配置 Key / 模型名 |
| AUTH_FAILED / MODEL_NOT_FOUND / NETWORK_ERROR / MODEL_RESPONSE_ERROR | 401/403/404/5xx/502 | 模型调用失败（映射规则见 model-config.md） |

- 时序图：

```text
客户端 → POST /api/chat
服务端 → 记忆召回（可选 Embedding 接口）→ [可选] Bing/DuckDuckGo 搜索
       → 模型供应商 /chat/completions
       → 保存会话 → 200 JSON
       → 后台：候选记忆抽取（模型 JSON 调用）→ 写 index.json
```

## POST /api/chat/stream

- 权限：`adminAuth` + `chatLimiter`
- 用途：流式对话（SSE）。请求参数与 `/api/chat` 完全一致
- 响应头：`Content-Type: text/event-stream`、`Cache-Control: no-cache, no-transform`、`Connection: keep-alive`
- SSE 事件（按发出顺序，`event:` + `data:` JSON）：

| event | data 结构 | 说明 |
|---|---|---|
| `web.search_error` | `{ code, message }` | 仅当搜索失败时先发 |
| `message.delta` | `{ "delta": "<增量文本>" }` | 模型流式增量，可多次 |
| `message.done` | `{ reply, conversation, relevantMemories, webSearch, webSearchError, candidateExtractionPending: true }` | 完整回复与会话已落库 |
| `memory.candidates` | `{ replyId, conversation?, candidates, candidateExtractionError }` | 候选抽取结果（成功含最新 conversation；失败 candidates 为 `[]`） |
| `error` | `{ code: "STREAM_ERROR"或原 code, message }` | 流开始后出错时发送并结束连接 |

- `memory.candidates` 中候选对象为记忆条目结构（见 memory.md），`candidateExtractionError.code` 枚举含 `MEMORY_EXTRACTION_INVALID` / `MEMORY_EXTRACTION_ERROR`
- 错误码：流开始前同 `/api/chat`；流开始后错误经 `error` 事件下发（HTTP 已 200）
- 注意：SSE 连接在整个抽取完成后才 `end()`，客户端需持续读取到连接关闭
