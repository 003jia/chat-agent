# Memory Agent Workbench

一个响应式聊天智能体工作台，支持智能体角色配置、多供应商模型 API 配置、对话和本地 Markdown 长期记忆管理。

## 功能

- 桌面端三栏工作台：智能体设置、聊天区、长期记忆面板。
- 手机端聊天页和设置页。
- 支持 OpenAI-compatible、OpenAI、DeepSeek、Anthropic 模型配置。
- 支持 API Key、Base URL、模型名、上下文长度设置。
- 支持候选记忆、确认写入 raw markdown、整理生成 `memory.md`。
- 本地文件存储，不依赖账号体系。

## 本地运行

```bash
npm install
npm run dev
```

前端默认运行在：

```text
http://127.0.0.1:5173/
```

后端默认运行在：

```text
http://localhost:8787
```

## 构建

```bash
npm run build
```

## 本地数据

运行后会自动创建 `data/` 目录，用于保存配置、会话和记忆文件。该目录包含 API Key、聊天记录和个人记忆，默认不会提交到 GitHub。

```text
data/config/agent.json
data/config/models.json
data/conversations/*.json
data/memory/raw/*.md
data/memory/memory.md
data/memory/index.json
```

## 设计参考

- `untitled.pen`：Pencil 源设计文件。
- `pencil-exports/`：桌面端和手机端 UI 参考图。
