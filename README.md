# Memory Agent Workbench

一个本地优先的智能体工作台。对话是入口，长期目标是让模型在受控权限下规划任务、调用工具、验证结果并交付产物。当前版本支持角色预设、多供应商模型、流式对话、联网搜索、可审计工具任务和本地长期记忆。

## 产品方向：从对话到任务执行

- 模型负责理解目标、规划步骤和选择工具。
- 服务端工具注册表负责参数校验、权限判断和实际执行。
- 只读工具可以自动执行；写入、发布、删除等高风险工具必须经过人工确认。
- 每次工具调用都会形成独立任务记录，保存目标、输入、状态、结果摘要和错误。
- 工具输出属于任务证据，不会直接写入长期记忆；任务完成后再提炼稳定事实和可复用经验。

## 未来目标与优先方向

项目未来定位为**本地优先、权限受控、过程可审计、模型可替换的桌面 Agent 工作台**。后续优先级如下：

1. 建立统一 `AgentRuntime`，完成有界多步骤任务循环。
2. 将任务、审批和审计升级为统一 Pre/Post/Stop Hook 与事件协议。
3. 保持模型无直接副作用权限，完善工作区边界、沙箱、超时、取消和失败恢复。
4. 分离长期记忆与任务知识，逐步以 SQLite 承载权威数据和版本迁移。
5. 建立受控 Skill/MCP 扩展体系，所有能力继续继承权限和审计。
6. 完成 Electron、本地服务、Codex Bridge、Keychain、签名与公证的桌面交付闭环。
7. 单 Agent 稳定后，再推进专家团和多 Agent 真实调度。

完整目标、非目标、阶段里程碑和验收标准见 [`docs/未来目标与架构路线图.md`](docs/未来目标与架构路线图.md)。

## 产品差异化：可控的长期记忆

Memory Agent Workbench 采用**先审后写**机制：后台抽取出的每一条候选记忆都会进入候选区，用户可以逐条接受、编辑、拒绝或禁用。只有被明确确认的条目才会进入长期记忆索引，并参与后续对话召回。

这套流程适合探索式对话：临时想法不会被自动绑定到角色或会话中；稳定偏好、项目事实和会话摘要则可以被沉淀为可追溯、可编辑、可删除的长期记忆。

## 当前能力

- 响应式聊天工作台：桌面端聊天主视图与功能抽屉，移动端聊天页和设置页。
- 多角色预设：可新增、切换、删除角色，并把会话绑定到指定角色。
- 内置专家团架构师：支持设计、迁移和审查 Comate/CodeBuddy Team 专家团，覆盖 Lead、Member、Workflow DAG、交付证据与权限边界。
- 可视化专家团：可创建多个专家团，选择角色是否加入、指定唯一 Lead、设置团队目标与启用状态。
- 角色个性化：支持头像、主题色、性格、开场白和本地背景图片；未上传图片时使用默认蓝色液态背景。
- 多会话管理：支持会话列表、新建、切换和删除。
- 多供应商模型：支持 OpenAI-compatible、OpenAI、DeepSeek、Anthropic。
- 流式聊天：前端逐段渲染模型回复，避免等待整段响应。
- Markdown 消息：支持列表、代码块、表格、链接和引用。
- Chatbox 类型会话工作流：桌面常驻可折叠侧栏、会话筛选、置顶、重命名、删除和导出。
- 全局历史搜索：跨本地会话检索消息并切换到命中的会话。
- 输入区模型切换与上下文估算：快速切换供应商，显示当前会话相对 contextLength 的估算占用。
- 联网搜索：搜索结果会作为不可信上下文注入，并带 prompt 注入防护。
- 受控工具运行台：提供统一工具描述、JSON 输入 Schema、权限级别和执行接口。
- 可审计任务记录：工具执行按会话保存，可在工具抽屉查看目标、结果、状态和时间。
- 本地工作区：受限目录（默认 `data/workspace`）内的代码与文件操作，支持目录浏览、读取、代码检索、写入与精确补丁，写入类操作需人工确认。
- 办公文档：按标题/摘要/章节结构生成 Markdown 文档，或生成可打开的 Word（.docx）文档，自动写入工作区。
- 双工作区入口：工具台分为 `Work` 与 `编程`；`Work` 集中搜索、记忆和办公文档，`编程` 集中本地代码读取、检索、写入与补丁。
- 首批工具：联网搜索和长期记忆检索，均为只读自动执行。
- 长期记忆：候选先审核，确认后更新 `index.json`，追加 `raw/` 审计日志，并重新渲染 `memory.md`。
- 记忆优化：中文友好检索、可选 Embedding 语义召回、常驻高优先级偏好、候选持久化、`add/update/disable/noop` 语义、逐条接受/编辑/拒绝、活跃记忆编辑/禁用/删除。
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

工具工作区默认位于 `data/workspace`，可通过环境变量指定其他目录（需为绝对路径）：

```text
MEMORY_AGENT_WORKSPACE_DIR=/path/to/your/workspace
```

如果在界面里填写 API Key，它会保存在本地 `data/config/models.json`。`data/` 已被 `.gitignore` 忽略，不会随正常 Git 提交流程上传。

## Codex 插件（调用本机 Codex 的 GPT-5.6）

内置供应商 `codex`：通过 `plugins/codex/` 目录下的本地桥接服务，复用你电脑上 Codex
（ChatGPT 桌面版内置 CLI，登录态在 `~/.codex`）的账号，直接调用 GPT-5.6 系列模型
（`gpt-5.6-sol` 等），无需单独申请 API Key。

```bash
npm run codex:install   # 注册供应商（默认模型自动读 ~/.codex/config.toml）
npm run codex:bridge    # 启动本地桥接服务 http://127.0.0.1:8899
npm run dev             # 然后在模型切换器中选择 “Codex GPT-5.6”
```

详细说明见 [`plugins/codex/README.md`](plugins/codex/README.md)。

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
data/config/teams.json
data/backgrounds/*                  # 角色自定义背景
data/workspace/*                    # 本地工作区：代码、文件与办公文档产物
data/audit/YYYY-MM-DD.ndjson         # 登录、审批、取消和工具执行审计（不记录正文）
data/conversations/*.json
data/tasks/*.json                   # 工具任务、执行步骤和结果摘要
data/memory/raw/YYYY-MM-DD.md   # 审核通过后的 append-only 审计日志
data/memory/index.json          # 记忆主索引，包含 active/candidate/disabled/deleted 状态
data/memory/embeddings.json     # 可选 Embedding 向量 sidecar
data/memory/memory.md           # 由 index.json 中 active 记忆自动渲染的可读摘要
```

这些文件可能包含 API Key、会话记录和个人长期记忆，默认不会提交到 GitHub。

## 工具与任务流程

```text
用户填写任务目标
  -> 从注册表选择工具
  -> 服务端校验工具 ID、输入 Schema 和权限
  -> read 工具自动执行
  -> write / external 工具进入 waiting_approval
  -> 用户按任务 ID 批准或取消；批准后同一任务进入 running
  -> 执行结果写入 data/tasks/<task-id>.json
  -> 前端执行时间线展示完成、失败或待确认状态
```

当前提供：

- `web.search`：搜索公开网页，返回来源、链接和摘要。
- `memory.search`：只读检索活跃长期记忆，不修改 `memory.md`。
- `workspace.list` / `workspace.read` / `workspace.grep`：只读浏览、读取与检索工作区内的代码和文档。
- `workspace.write` / `workspace.patch`：在工作区写入或精确补丁文件（写代码），需人工确认。
- `office.document` / `office.docx`：生成 Markdown 或 Word 办公文档并写入工作区，需人工确认。

所有文件类工具都被限制在 `MEMORY_AGENT_WORKSPACE_DIR`（默认 `data/workspace`）内，相对路径越界、绝对路径和符号链接逃逸都会被拒绝。写类工具执行前必须点击任务时间线中的“确认执行”；批准和取消都在原任务上流转，不会重复创建任务。

模型供应商地址仅允许 HTTPS；为兼容 Ollama 等本地模型，也允许 `localhost`、`127.0.0.1` 和 `::1` 的 HTTP 地址。远程明文 HTTP 和 URL 内嵌账号密码会被拒绝。

当前阶段先建立可靠的工具执行底座。模型自动选择工具、多步骤 Agent 循环、文件产物和专家团真实调度将在该协议上继续扩展。

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
  -> 下一轮对话按关键词/语义相关性、优先级、时间衰减加载记忆片段
```

### 记忆召回

召回时不会把所有记忆都塞进 Prompt，而是分桶选择：

- 常驻桶：最多 3 条高优先级用户偏好，例如“始终用中文回复”。
- 检索桶：命中关键词、中文 token 或达到语义相似度阈值后，按混合分数排序。
- 语义检索：在模型设置里填写可用的 Embedding 模型后启用；向量缓存在本地 `embeddings.json` sidecar，调用失败自动降级到关键词检索。启用后，待建向量的活跃记忆内容会发送给当前模型供应商的 Embedding 接口。
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
