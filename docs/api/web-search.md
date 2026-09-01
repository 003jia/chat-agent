# web-search 模块接口文档（联网搜索）

- synced_commit: `3f06b8ba`
- 更新时间: 2026-08-31
- 源码: `server/app.mjs`（L1209-1220）、`server/search.mjs`
- 依赖: 外部搜索引擎（Bing HTML → DuckDuckGo HTML 依次降级）；请求超时 9 秒（`WEB_SEARCH_TIMEOUT_MS`），单引擎内部重试 2 次
- 搜索结果会作为不可信上下文注入 prompt（注入防护在 `server/prompt.mjs`，不在本接口层）

## GET /api/web-search 与 POST /api/web-search

- 权限：`adminAuth` + `chatLimiter`（30 次/分钟）
- GET/POST 行为一致，仅参数位置不同
- 请求参数：

| 字段 | GET 位置 | POST 位置 | 类型 | 必填 | 范围 | 说明 |
|---|---|---|---|---|---|---|
| q / query | query `q` | body `query` | string | 是（trim 后非空） | 截断 ≤240 | 搜索关键词 |
| limit | query `limit` | body `limit` | integer | 否 | 1..8，默认 5 | 结果条数上限 |

- 响应结构（200，完整示例）：

```json
{
  "query": "memory agent",
  "source": "Bing HTML",
  "fetchedAt": "2026-08-31T00:00:00.000Z",
  "results": [
    {
      "title": "…（≤160 字符）",
      "url": "https://example.com/page",
      "snippet": "…（≤280 字符）",
      "source": "example.com"
    }
  ]
}
```

- 字段语义：
  - `source`（顶层）枚举：`"Bing HTML"` | `"DuckDuckGo HTML"`（实际命中引擎；Bing 无结果时才尝试 DuckDuckGo）
  - `results[].source`：结果站点的 hostname（去 `www.` 前缀，解析失败为 `"web"`）
  - `url`：归一化后的真实地址（DuckDuckGo 的 `uddg` 跳转参数会被还原）
- 错误码：

| code | HTTP | 触发条件 |
|---|---|---|
| VALIDATION_ERROR | 400 | 关键词为空 |
| WEB_SEARCH_TIMEOUT | 504 | 搜索请求超时（9s，AbortError） |
| WEB_SEARCH_EMPTY | 502 | 引擎返回但无可解析结果 |
| WEB_SEARCH_ERROR | 502 | 搜索失败（两个引擎都不可用等） |

- 用例设计提示：本接口依赖外网，自动化测试必须 mock `performWebSearch` 或其 HTTP 层，不发起真实请求。
