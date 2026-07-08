# 代码质量审计报告 — Memory Agent Workbench

> 审计范围：`server/index.mjs`（Express 5，884 行）、`src/App.tsx`（React 19，1251 行）、`src/types.ts`、`src/api.ts`、`vite.config.ts`
> 审计方法：静态通读 + 安全/性能/可维护性维度逐项核对，全部结论带 file:line
> 结论预览：**安全 差 / 架构 差 / 可维护性 差 / 性能 中 / 类型安全 中 / 一致性 差**

---

## 一、严重级（Critical，需立即处理）

### C1. CORS 全开 + 无鉴权 + 监听全部网卡
- 位置：`server/index.mjs:21` `app.use(cors())`、`:882` `app.listen(port)`（默认绑定 `0.0.0.0`）
- 影响：所有写接口（改配置 `:684/:703`、测模型 `:726`、发消息 `:760`、提交记忆 `:838`）**无任何鉴权**，且 `cors()` 默认 `Access-Control-Allow-Origin: *`。任意能访问 8787 端口的网页可对本地服务发起跨域状态变更（类 CSRF）。
- 修复：
  - `cors({ origin: ["http://127.0.0.1:5173"] })` 限定来源；
  - `app.listen(port, "127.0.0.1")` 仅绑定回环地址；
  - 若需跨机访问，加 token 鉴权中间件。
- 工作量：S（半小时）

### C2. 模型请求完全无超时（可永久挂起、拖垮单进程）
- 位置：`server/index.mjs:437`（`callOpenAICompatible`）、`:463`（`callAnthropic`）的 `fetch` 均无 `signal`；`fetchWithTimeout` 仅用于联网搜索（`:259`）
- 影响：供应商卡住时连接永久挂起，单进程服务被耗尽；`mapModelError` 中的 `AbortError→504` 分支（`:249`）对模型请求是死代码。
- 修复：复用 `fetchWithTimeout`，给模型请求加 `MODEL_TIMEOUT_MS`（如 60s）并传 `signal`。
- 工作量：S

---

## 二、中级（Major）

### M1. System Prompt 注入风险（记忆候选 + 联网结果直接拼入 system）
- 位置：`server/index.mjs:494-515` `buildSystemPrompt`、`545-574` `generateCandidatesFromMessages`、`824` commit
- 影响：用户聊天可经关键词匹配生成候选记忆并被提交，提交后下次注入 system prompt；联网结果（可被投毒）也直接拼入 system。攻击者可借记忆污染做 prompt injection。
- 修复：记忆/搜索内容做角色隔离（作为 user/工具上下文而非 system 指令），候选内容做"不可包含指令"校验与结构化脱敏。

### M2. `/api/chat` 无限流、无单条消息长度上限
- 位置：`server/index.mjs:22` `express.json({ limit: "2mb" })`、`:760-765` 仅校验非空
- 影响：单条消息可近 2MB，易刷爆下游模型与本地磁盘（每次全量写对话文件）。
- 修复：加 `express-rate-limit`（每 IP 每分钟 N 条），对 `message` 设最大长度（如 8000 字符）并 trim 校验。

### M3. 记忆/对话全量文件读写（O(n)，无索引）
- 位置：`server/index.mjs:637-643` `getMemoryIndex/saveMemoryIndex`、`:524-543` `selectRelevantMemories`、`663-670` 按 id 整文件读写
- 影响：每次聊天全量读 index、全量过滤、全量回写；记忆增长后性能线性退化；前端 `MemoryPanel` 也全量 `filter`（`src/App.tsx:583`）。
- 修复：量大时改用按条读写或简单 SQLite/leveldb；检索至少缓存到内存，后续上倒排/向量索引。

### M4. 架构：`src/App.tsx` 单体 1251 行承担过多职责
- 位置：`src/App.tsx:34-388` `App` 内聚全部状态、数据获取、桌面/移动双壳、全部面板
- 影响：耦合高、难以复用与测试。
- 修复：拆 `hooks/useWorkbenchState.ts`、`components/desktop/*`、`components/mobile/*`、`components/panels/*`、`components/ui/*`；用 `WorkbenchContext` 替代逐层透传 `sharedProps`。

### M5. Agent 行为配置三处重复且开关集合不一致（真正的"重复"在这里）
- 位置：`src/App.tsx:408-509`（桌面 AgentSidebar，含 proactiveFollowup/autoSaveNotes/strictRetrieval，**缺 citeMemory**）、`:1003-1038`（AgentEditorPanel，含 proactiveFollowup/citeMemory，**缺 autoSaveNotes/strictRetrieval**）、`:698-742`（手机 MobileSettings，含 Language/citeMemory/autoSaveNotes/strictRetrieval）
- 说明：`ModelSettings` 实际**未重复**——只有一个，经 `compact` prop 复用于手机与桌面。真正重复且**行为不一致**的是上面三处 Agent 行为设置。
- 修复：抽 `<AgentBehaviorEditor />` 统一渲染全部开关，三端共用，避免集合与文案漂移。

### M6. 前端无 memo，桌面+移动同时挂载导致整树高频重渲染
- 位置：`src/App.tsx:341-387`（`sharedProps` 每次重建传给 Desktop/Mobile/Interaction 三者，均不做 `React.memo`；移动端仅靠 CSS `display` 隐藏仍参与渲染）
- 修复：用 Context 替代 props 透传；纯展示子组件加 `React.memo`；`useMemo` 缓存派生数据。

### M7. UI 中英混排、语言切换不生效
- 位置：`src/App.tsx:589`（`LONG-TERM MEMORY`/`Candidates`/`Edited` 等）、`:601`、`:620`、`:861-869`（面板标题 `Search workspace`/`Settings`/`Base URL` 等混在中文界面）
- 影响：同面板中英标签并存，未走 i18n；`language` 字段实际不生效（仅切了控件值）。
- 修复：建 i18n 文案表按 `agentConfig.language` 渲染，清理硬标签。

### M8. 温度显示精度/步进桌面 vs 手机不一致
- 位置：`src/App.tsx:477`（桌面 `toFixed(2)`、`step="0.01"`）vs `:744`（手机 `toFixed(1)`、`step="0.1"`）
- 影响：同一值两端显示与可调节粒度不同，切端"看起来"数值变了。
- 修复：统一 `toFixed(2)`、`step="0.01"`。

### M9. 完全没有自动化测试
- 位置：全仓库（无 `*.test.*`/`*.spec.*`，无 vitest/jest/playwright config）
- 影响：后端记忆抽取、检索打分、配置掩码、错误映射与前端交互零覆盖，回归风险高。
- 修复：引入 Vitest，对 `generateCandidatesFromMessages`、`selectRelevantMemories`、`maskModelConfig`、`classifyProviderError`、`api.ts` 加单测。

### M10. 候选记忆抽取靠关键词正则而非模型
- 位置：`server/index.mjs:545-574`（`preferencePatterns` 关键词 + `summarizeText` 截断 96 字符）
- 影响：命中"希望/记住/never"等即生成候选，误报漏报都高。
- 修复：改为模型做结构化候选抽取（返回 JSON），或提交前由模型校验。

### M11. 前后端类型未共享
- 位置：`src/types.ts`（仅前端）vs `server/index.mjs`（纯 JS，自有 `defaultAgentConfig`）
- 影响：后端无类型约束，`ModelConfig/AgentConfig` 形状一旦改动后端不知情，存在类型漂移。
- 修复：后端改用 `.ts` 或从 `types.ts` 复用常量/用 `zod` 做运行时校验。

### M12. 异常被静默吞掉 / `ensureJson` 存在 TOCTOU 竞态
- 位置：`server/index.mjs:170-177` `readJson` catch 直接返回 fallback、`154-160` `ensureJson` 先 `access` 再 `writeFile`
- 修复：catch 中 `console.error` 上报；用 `writeFile` + 原子 rename（`.tmp`→正式）替代 access-then-write。

---

## 三、轻微级（Minor）

| 编号 | 问题 | 位置 | 修复 |
|---|---|---|---|
| m1 | `editedMinutesAgo` 硬编码为 2 | `server:821`、`src/App.tsx:641`、`types.ts:69` | 读取 `memory.md`/`index.json` 真实 `mtime` 计算 |
| m2 | API Key 明文落盘（data/config/models.json） | `server:709-720` | 落盘前 `aes-256-gcm` 或系统密钥链加密 |
| m3 | 魔法字符串/魔数散落 | `server:762/786/541/588`、`api.ts:50` | 集中到 `config/constants.ts` 并注释 |
| m4 | 多会话能力半成品（conversationId 写死 default） | `server:739/663-666`、`api.ts:40` | 补齐 list/create/switch 或移除死代码 |
| m5 | 单 bundle 无懒加载（桌面/移动同挂） | `src/App.tsx:383-386` | 按视口 `React.lazy` 动态加载 |
| m6 | SSRF 面（model baseURL 可指向内网） | `server:437/269` | 对 baseURL 做内网地址拦截 `isPrivateIP` |

---

## 四、修复优先级建议

1. **立即（本周）**：C1、C2 — 会直接导致服务被滥用或挂死。
2. **本迭代**：M9（补测试地基）、M4/M5（拆分与去重，降低后续维护成本）、M2（限流+长度上限）。
3. **下迭代**：M1（prompt 注入隔离）、M3（记忆索引化）、M7/M8（一致性）、M10/M11/M12（质量债）。
4. **持续**：m1–m6 随相关模块改动顺手清理。

> 完整可点击清单见 `03-code-review-checklist.md`。
