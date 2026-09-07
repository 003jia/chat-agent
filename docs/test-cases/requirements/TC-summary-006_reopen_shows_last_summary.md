# TC-summary-006 重开对话显示上次摘要（US-3）

| 字段 | 值 |
|---|---|
| 用途 | requirement |
| 覆盖范围 | 会话摘要（持久化回显，PRD US-3 / FR-4 可选增强） |
| 运行命令 | `npm run test:e2e:summary`（待接入） |
| 关联 spec | `e2e/specs/summary.spec.ts`（待落地） |
| 账号/登录方式 | 管理令牌登录（临时令牌 + 临时数据根 `.e2e-tmp`） |
| 清理方式 | 隔离数据根，自建会话自清 |

## 前置条件

同 TC-summary-001；已生成过摘要（真实写入对话 JSON）。

## 步骤

1. 生成摘要后重新加载页面（`page.reload()`）
2. 打开摘要面板
3. 断言摘要面板显示上次生成的摘要内容

## 预期结果

1. 重新加载后摘要面板 `.markdown-preview` 显示上次生成的摘要（锚点：`.desktop-workbench .drawer-panel .markdown-preview` 含 mock 摘要文本）

## 偏差登记（D-1，重要）

- **现状**：`generatedSummary` 初始为空串（`useWorkbenchState.ts:31`），`switchConversation`/reload 均**不**从 `conversation.summary` 初始化——「重开可见」当前未实现。
- **PRD 出处**：§6.4「建议一期即做」+ §4 US-3。
- **处置**：按应然写断言；spec 运行将失败并暴露该产品缺陷 → 登记 GitHub Issue（不进 skip），本 TC 保留作为缺陷追踪用例。若用户后续实现该增强，本 TC 自动转绿。
