# memory 模块接口文档（长期记忆）

- synced_commit: `3f06b8ba`
- 更新时间: 2026-08-31
- 源码: `server/app.mjs`（L1441-1582）、`server/memory.mjs`
- 数据来源: `data/memory/index.json`（主索引，唯一权威数据源）；`data/memory/raw/YYYY-MM-DD.md`（commit 后追加的审计日志）；`data/memory/memory.md`（由 active 记忆渲染的派生文件）；`data/memory/embeddings.json`（可选向量 sidecar）
- 写入互斥：commit / patch / delete / purge / organize 全部在 `memoryWriteLock` 内执行

## 记忆条目结构（完整字段）

```json
{
  "id": "memory-xxxx 或 candidate-xxxx",
  "content": "…（截断 ≤200；<4 字符的条目会被过滤丢弃）",
  "type": "user_preference",
  "level": "medium",
  "status": "active",
  "source": "chat",
  "createdAt": "2026-08-31T00:00:00.000Z",
  "updatedAt": "2026-08-31T00:00:00.000Z",
  "keywords": ["…（≤40 个分词）"],
  "hash": "<content+type 摘要>",
  "accessCount": 0,
  "op": "add",
  "targetId": "（update/disable 候选指向的已有记忆 id）",
  "reason": "（≤120，可选）",
  "confidence": 0.8,
  "supersedes": ["<candidateId>"],
  "supersededBy": "<candidateId>",
  "lastAccessedAt": "2026-08-31T00:00:00.000Z"
}
```

**枚举（完整，`server/memory.mjs` L17-20）**：

| 字段 | 枚举值 | 说明 |
|---|---|---|
| type | `user_preference` / `project_fact` / `conversation_summary` | 非法值归一化为 `user_preference` |
| level | `high` / `medium` / `low` | 非法值归一化为 `medium` |
| status | `active` / `candidate` / `disabled` / `deleted` | 非法值归一化为 `candidate` |
| op（仅候选） | `add` / `update` / `disable` / `noop` | 非法值视为无 op |

- 常量：`MEMORY_MIN_CONTENT_LENGTH=4`、`MEMORY_SUMMARY_CHAR_LIMIT=200`、`MEMORY_RETRIEVAL_LIMIT=8`、`STRICT_MEMORY_RETRIEVAL_LIMIT=5`、`RESIDENT_MEMORY_LIMIT=3`、`MEMORY_RECENCY_WINDOW_DAYS=90`、`MEMORY_SEMANTIC_MIN_SIMILARITY=0.35`、`MEMORY_ACCESS_FLUSH_THRESHOLD=20`、`MEMORY_ACCESS_FLUSH_INTERVAL_MS=30000`、`MEMORY_EMBEDDING_BATCH_LIMIT=256`（`server/constants.mjs`）

## GET /api/memory

- 权限：`adminAuth`
- 响应结构（200，完整示例，注意取值路径 `stats.*`）：

```json
{
  "items": [ <非 deleted 的记忆条目，含未落盘的访问计数增量> ],
  "markdown": "<memory.md 全文>",
  "stats": { "loaded": 3, "candidates": 1, "deleted": 2, "editedMinutesAgo": 5 }
}
```

- `stats.loaded` = active 数；`stats.candidates` = candidate 数；`stats.deleted` = deleted 数（已从 items 中剔除但仍计数）；`editedMinutesAgo` = memory.md 修改时间距现在的分钟数（读取失败为 0）

## POST /api/memory/candidates

- 权限：`adminAuth` + `writeLimiter`
- 用途：**本地规则**（非模型）从最近用户消息启发式生成候选
- 请求参数：`messages`（数组，取最后 ≤4 条 `role:"user"` 的 content 拼接）

| 触发词（完整） | 产出候选 |
|---|---|
| 希望 / 偏好 / 以后 / 记住 / 不要 / 需要 / prefer / remember / always / never | `user_preference`（含「不要」或 never 时 level=high，否则 medium） |
| 项目 / memory.md / API / 模型 | `project_fact`（level=medium） |

- 响应：`{ "candidates": [ <status:"candidate" 的记忆条目> ] }`（无命中为空数组；不写库）

## POST /api/memory/commit

- 权限：`adminAuth` + `writeLimiter`
- 用途：把候选写入长期记忆（先审后写的「审后」动作）
- 请求参数：`items`（数组，元素为候选条目；仅处理 `status:"candidate"` 或带 `op` 的条目）
- commit 语义（按 op，完整分支）：

| op | 行为 |
|---|---|
| `noop` | 丢弃候选（从 index 移除），不产生 committed |
| `disable` | `targetId` 指向的已有记忆 → `status:"disabled"`、`supersededBy=<候选id>`；候选丢弃 |
| `update`（或与 active 记忆 hash 重复的 add） | 合并进目标记忆（content/type/level 覆盖，`status:"active"`，`supersedes` 追加候选 id），候选丢弃 |
| `add`（含无 op 候选） | 新建 active 记忆，id 由 `candidate-*` 换发为 `memory-*` |

- 错误码：`400 VALIDATION_ERROR`「没有可写入的候选记忆。」（items 为空）
- 响应结构（200）：

```json
{ "items": [ <更新后的全量记忆> ], "committed": [ <本次落库的条目> ], "rawPath": "<data/memory/raw/2026-08-31.md>" }
```

- 副作用：committed 的 active 条目进入后台 Embedding 刷新队列；审计日志追加到 `raw/<日期>.md`

## PATCH /api/memory/:memoryId

- 权限：`adminAuth` + `writeLimiter`
- 用途：编辑已有记忆条目（patch 合并，`id` 不可改，`updatedAt` 刷新）
- 请求参数：body 为记忆条目字段子集（常用 `content` / `type` / `level` / `status`）
- 错误码：`404 MEMORY_NOT_FOUND`「记忆不存在。」
- 响应：`{ "items": [...], "item": <更新后的条目> }`；更新为 active 时触发后台 Embedding 刷新

## DELETE /api/memory/:memoryId

- 权限：`adminAuth` + `writeLimiter`
- 行为：**软删除**（`status: "deleted"`，不物理移除）
- 错误码：`404 MEMORY_NOT_FOUND`
- 响应：`{ "found": true, "items": [...], "item": <deleted 条目> }`

## POST /api/memory/purge

- 权限：`adminAuth` + `writeLimiter`
- 行为：物理清除全部 `status:"deleted"` 条目，并清理其他条目上指向它们的 `supersededBy` / `supersedes` 引用
- 响应：`{ "items": [...], "purged": <清除条数> }`

## POST /api/memory/organize

- 权限：`adminAuth` + `writeLimiter`
- 用途：整理记忆（先审后写：只产出候选并入 index，不直接覆盖 active）
- 流程：当前选中供应商可用且有 Key → 模型整理（输出 update/disable/add/noop 候选）；否则本地相似度去重降级
- 响应结构（200）：

```json
{
  "items": [ <合并候选后的全量记忆> ],
  "candidates": [ <本次产出的候选> ],
  "markdown": "<重新渲染的 memory.md>",
  "mode": "model-candidates",
  "organizeError": null
}
```

- `mode` 枚举：`model-candidates`（模型整理）/ `local-dedupe`（无 Key 本地去重）/ `local-dedupe-fallback`（模型整理失败后降级）
- `organizeError`：`{ code, message }` 或 `null`；模型整理异常不阻断请求（降级本地去重）
- 时序图（跨服务）：

```text
服务端 → [可选] 模型供应商（整理 JSON 调用）
       → memoryWriteLock：合并候选入 index.json
       → 重渲染 memory.md → 200
```

## 业务规则备注（供用例断言）

1. 召回只取 `active`；`deleted` 永不召回；常驻桶 = `type=user_preference` 且 `level=high`，最多 3 条。
2. `hash` 由 content+type 计算：相同内容的 add 候选在 commit/merge 时自动转为对已有 active 记忆的 update。
3. `accessCount` / `lastAccessedAt` 由对话召回累计，缓冲（阈值 20 次或 30 秒定时）后异步写回 index。
