# Memory Agent Workbench

一个本地优先的聊天智能体工作台。它支持角色预设、多供应商模型配置、流式对话、联网搜索、本地长期记忆和候选记忆审核。相比通用助手默认替你记住一切，这里更强调“你拥有对长期记忆的最终审批权”。

## 产品差异化：可控的长期记忆

Memory Agent Workbench 采用**先审后写**机制：后台抽取出的每一条候选记忆都会进入候选区，用户可以逐条接受、编辑、拒绝或禁用。只有被明确确认的条目才会进入长期记忆索引，并参与后续对话召回。

这套流程适合探索式对话：临时想法不会被自动绑定到角色或会话中；稳定偏好、项目事实和会话摘要则可以被沉淀为可追溯、可编辑、可删除的长期记忆。

## 当前能力

- 响应式工作台：桌面端三栏布局，移动端聊天页和设置页。
- 多角色预设：可新增、切换、删除角色，并把会话绑定到指定角色。
- 多会话管理：支持会话列表、新建、切换和删除。
- 多供应商模型：支持 OpenAI-compatible、OpenAI、DeepSeek、Anthropic。
- 流式聊天：前端逐段渲染模型回复，避免等待整段响应。
- Markdown 消息：支持列表、代码块、表格、链接和引用。
- 联网搜索：搜索结果会作为不可信上下文注入，并带 prompt 注入防护。
- 长期记忆：候选先审核，确认后更新 `index.json`，追加 `raw/` 审计日志，并重新渲染 `memory.md`。
- 记忆优化：中文友好检索、常驻高优先级偏好、候选持久化、`add/update/disable/noop` 语义、逐条接受/编辑/拒绝、活跃记忆编辑/禁用/删除。
- 安全加固：CORS 白名单、本地监听、管理令牌、限流、模型请求超时、错误脱敏日志。
- 测试与 CI：Vitest 覆盖核心纯函数和接口冒烟，GitHub Actions 执行测试和构建。

## 技术栈

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express
- Storage: local JSON and Markdown files
- Test: Vitest, Playwright screenshot QA

## 本地运行

```bash
npm install
npm run dev
```

默认地址：

```text
Frontend: http://127.0.0.1:5173/
Backend:  http://127.0.0.1:8787
```

## 环境变量

受保护接口需要本地管理令牌：

```text
MEMORY_AGENT_ADMIN_TOKEN
```

模型 API Key 建议通过环境变量提供。仓库不会提交真实 key。

```text
MEMORY_AGENT_API_KEY_OPENAI_COMPATIBLE
MEMORY_AGENT_API_KEY_OPENAI
MEMORY_AGENT_API_KEY_DEEPSEEK
MEMORY_AGENT_API_KEY_ANTHROPIC
```

如果在界面里填写 API Key，它会保存在本地 `data/config/models.json`。`data/` 已被 `.gitignore` 忽略，不会随正常 Git 提交流程上传。

## 常用命令

```bash
npm test
npm run build
npm run qa:screenshots
```

## 本地数据结构

运行后会自动创建 `data/` 目录：

```text
data/config/roles.json
data/config/models.json
data/conversations/*.json
data/memory/raw/YYYY-MM-DD.md   # 审核通过后的 append-only 审计日志
data/memory/index.json          # 记忆主索引，包含 active/candidate/disabled 状态
data/memory/memory.md           # 由 index.json 中 active 记忆自动渲染的可读摘要
```

这些文件可能包含 API Key、会话记录和个人长期记忆，默认不会提交到 GitHub。

## 记忆流程

记忆链路分成三层文件职责：

- `index.json`：主数据源，保存所有记忆条目和状态，包括 `active`、`candidate`、`disabled`。
- `raw/YYYY-MM-DD.md`：审计日志，只追加用户确认通过的写入记录，便于回溯“什么时候写入了什么”。
- `memory.md`：派生文件，由 `index.json` 中的 active 记忆重新渲染生成，供人查看和模型加载；不要手工编辑。

核心流程：

```text
用户消息
  -> 模型回复流式返回
  -> 后台抽取候选记忆 actions
       add      新增长期记忆候选
       update   更新已有记忆候选
       disable  禁用旧记忆候选
       noop     忽略无长期价值内容
  -> candidate 状态写入 index.json
  -> 用户逐条接受 / 编辑 / 拒绝
  -> 接受后更新 index.json，并追加 raw/YYYY-MM-DD.md 审计日志
  -> memory.md 由 active 记忆重新渲染
  -> 下一轮对话按相关性、优先级、时间衰减加载记忆片段
```

### 记忆召回

召回时不会把所有记忆都塞进 Prompt，而是分桶选择：

- 常驻桶：最多 3 条高优先级用户偏好，例如“始终用中文回复”。
- 检索桶：必须命中关键词或中文 token，按命中数、优先级和时间衰减排序。
- 引用解释：助手回复下方可展开查看本轮实际引用了哪些记忆。

### 记忆整理

“整理记忆”不会直接覆盖长期记忆。它会先生成待审核候选：

- 模型可用时：由模型判断重复、冲突、过期项，输出 `update/disable/add/noop`。
- 模型不可用时：降级为本地相似度去重，生成 `disable` 候选。
- 用户接受后：才会真正更新或禁用对应记忆。

## 安全说明

- 不提交 `data/`、`.env*`、`.workbuddy/`。
- 前端只显示 API Key 是否已配置，不显示明文。
- 服务端日志会脱敏常见 key、Authorization 和管理令牌。
- 搜索结果、网页摘要和用户消息都会作为不可信内容包裹进 prompt。

## License

MIT License
