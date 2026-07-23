# Memory Agent Workbench 项目总览

## 产品定位

Memory Agent Workbench 是一个本地优先、以聊天为中心的智能体工作台。它把角色配置、模型接入、长期记忆审核、联网搜索和专家团编排集中到一个响应式界面中。

核心原则：

- 长期记忆先进入候选区，用户确认后才生效。
- API Key、聊天记录、背景图片和记忆默认只保存在本地。
- 专家团配置与真实执行分离，不把静态设计冒充多 Agent 运行结果。

## 当前能力

### 聊天与角色

- React/Vite 响应式聊天界面，桌面使用功能抽屉，手机使用聊天页和设置页。
- 多会话新建、切换、删除，以及会话绑定角色。
- 多角色预设和内置“专家团架构师”角色。
- 头像、主题色、性格、开场白和背景图片自定义。
- 默认蓝色液态背景；自定义图片按角色保存到本地。
- 流式回复、Markdown 渲染、自动滚动、复制和重新生成。

### 可视化专家团

- 新建、选择、保存、停用和删除多个专家团。
- 对每个角色单独选择“加入/不加入”。
- 从已加入成员中指定唯一 Lead。
- 可视化展示 Lead 与成员结构。
- 配置保存到 `data/config/teams.json`。
- 当前阶段只持久化团队定义，尚未启动真实子 Agent 运行时。

### 模型与搜索

- 支持 OpenAI-compatible、OpenAI、DeepSeek、Anthropic。
- 支持模型、Base URL、上下文长度和可选 Embedding 模型配置。
- API Key 优先从环境变量读取，前端只显示脱敏状态。
- 联网搜索失败时自动降级为普通聊天。
- 搜索结果以不可信上下文注入，带 Prompt 注入防护。

### 长期记忆

- `index.json` 保存结构化记忆及 active/candidate/disabled 状态。
- `raw/YYYY-MM-DD.md` 保存用户确认后的追加式审计记录。
- `memory.md` 由 active 记忆自动生成，供人查看和模型加载。
- 支持模型候选抽取、逐条接受、编辑、拒绝、禁用和删除。
- 支持关键词检索、中文分词、优先级、时间衰减和可选 Embedding 语义召回。
- 记忆整理先生成审核候选，不直接覆盖长期记忆。

### 安全与可靠性

- API 默认绑定 `127.0.0.1`，并限制 CORS 本地白名单。
- 写入、模型调用和外部资源接口需要 `X-Admin-Token`。
- 模型请求超时、接口限流、消息长度校验和错误脱敏日志。
- 背景上传限制为 JPG、PNG、WebP，最大 8 MB，并校验文件签名。
- `data/`、`.env*`、`.workbuddy/` 和截图目录不会提交到 GitHub。

## 本地数据

```text
data/
├── backgrounds/
├── config/
│   ├── models.json
│   ├── roles.json
│   └── teams.json
├── conversations/
└── memory/
    ├── index.json
    ├── memory.md
    └── raw/
```

## 启动与验证

```bash
npm install
npm run dev
npm test
npm run build
```

默认地址：

```text
Frontend: http://127.0.0.1:5173/
Backend:  http://127.0.0.1:8787
```

当前本地验证基线：8 个测试文件、71 项测试通过，TypeScript 与 Vite 生产构建通过。
