# Memory Agent Workbench

一个本地优先的聊天智能体工作台。它支持角色预设、多供应商模型配置、流式对话、联网搜索、本地长期记忆和候选记忆审核，适合用来验证“可配置智能体 + 可控长期记忆”的产品形态。

## 当前能力

- 响应式工作台：桌面端三栏布局，移动端聊天页和设置页。
- 多角色预设：可新增、切换、删除角色，并把会话绑定到指定角色。
- 多会话管理：支持会话列表、新建、切换和删除。
- 多供应商模型：支持 OpenAI-compatible、OpenAI、DeepSeek、Anthropic。
- 流式聊天：前端逐段渲染模型回复，避免等待整段响应。
- Markdown 消息：支持列表、代码块、表格、链接和引用。
- 联网搜索：搜索结果会作为不可信上下文注入，并带 prompt 注入防护。
- 长期记忆：候选先审核，确认后写入 `raw/` 审计日志和 `memory.md`。
- 记忆优化：中文友好检索、常驻高优先级偏好、候选持久化、add/update/noop 语义、逐条接受/编辑/拒绝。
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
data/memory/raw/YYYY-MM-DD.md
data/memory/index.json
data/memory/memory.md
```

这些文件可能包含 API Key、会话记录和个人长期记忆，默认不会提交到 GitHub。

## 记忆链路

```text
用户消息
  -> 模型回复流式返回
  -> 后台抽取候选记忆
  -> candidate 状态写入 index.json
  -> 用户逐条接受 / 编辑 / 拒绝
  -> raw markdown 审计日志 + memory.md 派生文件
  -> 下一轮对话按相关性和优先级加载
```

`memory.md` 是自动生成文件，应通过应用内操作更新，不建议直接编辑。

## 安全说明

- 不提交 `data/`、`.env*`、`.workbuddy/`。
- 前端只显示 API Key 是否已配置，不显示明文。
- 服务端日志会脱敏常见 key、Authorization 和管理令牌。
- 搜索结果、网页摘要和用户消息都会作为不可信内容包裹进 prompt。

## License

MIT License
