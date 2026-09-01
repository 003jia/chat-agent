# conversations 模块接口文档（会话管理）

- synced_commit: `3f06b8ba`
- 更新时间: 2026-08-31
- 源码: `server/app.mjs`（L1099-1207）、`server/conversations.mjs`、`server/summary.mjs`
- 数据来源: `data/conversations/<conversationId>.json`（每会话一个文件）；角色校验依赖 `data/config/roles.json`

## 会话对象结构（完整字段）

```json
{
  "id": "conv-xxxx 或 default",
  "title": "新对话",
  "roleId": "role-xxxx",
  "starred": false,
  "createdAt": "2026-08-31T00:00:00.000Z",
  "updatedAt": "2026-08-31T00:00:00.000Z",
  "messages": [
    {
      "id": "msg-xxxx",
      "role": "user",
      "content": "…",
      "timestamp": "2026-08-31T00:00:00.000Z",
      "memoryRefs": ["<memoryId>"],
      "candidateMemoryIds": ["<candidateId>"]
    }
  ],
  "summary": "（可选，生成过摘要后才有）",
  "summaryGeneratedAt": "（可选）",
  "summaryModel": "（可选，形如 \"deepseek/deepseek-chat\"）"
}
```

- `role` 枚举：`user` | `assistant`；`title` 截断 ≤80；不存在的 conversationId **不报 404**——`getConversation` 会返回一份种子会话（默认 id 含 3 条种子消息，其他 id 为空消息列表）

## 会话摘要对象（GET /api/conversations 列表项）

`{ id, title, roleId, starred, createdAt, updatedAt, messageCount }`，排序：置顶（starred）优先，其余按 `updatedAt` 降序。

## GET /api/conversations

- 权限：`adminAuth`
- 响应：`{ "conversations": [ <会话摘要对象> ] }`

## GET /api/conversations/search

- 权限：`adminAuth`
- 用途：跨会话全局搜索（标题或消息内容，大小写不敏感子串匹配）
- 请求参数：

| 字段 | 位置 | 类型 | 必填 | 范围 | 说明 |
|---|---|---|---|---|---|
| q | query | string | 是（trim 后非空） | — | 关键词 |
| limit | query | integer | 否 | 1..100，默认 50 | 返回上限 |

- 错误码：`400 VALIDATION_ERROR`「请输入会话搜索关键词。」
- 响应：`{ "results": [ { "conversationId", "conversationTitle", "messageId", "role": "user"|"assistant", "snippet", "timestamp" } ] }`
- `snippet`：压缩空白后 ≤180 字符，超出时以命中点为中心加 `…`；结果按 timestamp 降序

## POST /api/conversations

- 权限：`adminAuth` + `writeLimiter`
- 请求参数：

| 字段 | 类型 | 必填 | 说明 | 数据来源 |
|---|---|---|---|---|
| roleId | string | 否 | 必须是已存在角色 id，否则用当前选中角色 | 请求体 + roles.json |
| title | string | 否 | 截断 ≤80，默认「新对话」 | 请求体 |

- 响应：`201` + 会话对象（新会话 `messages: []`）

## GET /api/conversations/:conversationId

- 权限：`adminAuth`
- 响应：会话对象（含 messages 全量；生成过摘要的还含 `summary` 三字段）
- 特殊行为：id 不存在时返回种子会话（HTTP 200），**不是 404**

## GET /api/conversations/:conversationId/export

- 权限：`adminAuth`
- 用途：导出会话为附件下载
- 请求参数：`format`（query，枚举 `markdown` | `json` | `txt`，其他值回落 `markdown`；默认 `markdown`）
- 响应：`Content-Disposition: attachment; filename*=UTF-8''<title>.<md|json|txt>`；`Content-Type: application/json; charset=utf-8`（json）或 `text/plain; charset=utf-8`（其余）
- 内容形态：json = 会话对象完整 JSON；txt = 标题 + 「用户/智能体 · 时间」+ 正文；markdown = `# 标题` + `## 用户/智能体` 分节

## PATCH /api/conversations/:conversationId

- 权限：`adminAuth` + `writeLimiter`
- 用途：重命名 / 置顶（部分更新）
- 请求参数：`title`（string，trim 后必须非空，截断 ≤80）、`starred`（boolean）；未传字段保持原值
- 错误码：`400 VALIDATION_ERROR`「会话名称不能为空。」
- 响应：更新后的会话对象

## DELETE /api/conversations/:conversationId

- 权限：`adminAuth` + `writeLimiter`
- 错误码：`400 VALIDATION_ERROR`「至少需要保留一个会话。」（剩余会话数为 1 时）
- 行为：直接删除 `data/conversations/<id>.json`（`force: true`，id 不存在也返回成功）
- 响应：`{ "ok": true }`

## PUT /api/conversations/:conversationId/role

- 权限：`adminAuth` + `writeLimiter`
- 用途：把会话绑定到指定角色
- 请求参数：`roleId`（string，必填，必须已存在）
- 错误码：`404 ROLE_NOT_FOUND`（ roleId 缺失或不存在）
- 响应：更新后的会话对象

## POST /api/conversations/:conversationId/summary

- 权限：`adminAuth` + `writeLimiter`
- 用途：用当前选中供应商对会话近 N 条消息生成摘要（3-8 要点、纯 Markdown、不编造）
- 请求参数：

| 字段 | 类型 | 必填 | 范围 | 说明 |
|---|---|---|---|---|
| limit | integer | 否 | 1..200，默认 30 | 参与摘要的最近消息条数 |
| language | string | 否 | `zh` / `en`（其他回落角色语言或 `zh`） | 摘要语言 |

- 响应结构（200，完整示例）：

```json
{
  "summary": "…Markdown 摘要…",
  "generatedAt": "2026-08-31T00:00:00.000Z",
  "model": "deepseek/deepseek-chat",
  "messageCount": 30
}
```

- 副作用：`summary` / `summaryGeneratedAt` / `summaryModel` 写回会话文件
- 时序图：`服务端 → 模型供应商 /chat/completions（temperature=0.2, maxTokens=800）→ 写会话 → 200`
- 错误码：

| code | HTTP | 触发条件 |
|---|---|---|
| EMPTY_CONVERSATION | 400 | 会话无消息 |
| SUMMARY_FAILED | 502 | 供应商未配置 Key（「模型未配置，无法生成摘要。」）或模型调用失败 |
