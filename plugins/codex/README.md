# Codex 插件（GPT-5.6）

把**你电脑上的 Codex**（ChatGPT 桌面版内置的 Codex CLI，登录态在 `~/.codex`）包装成一个
OpenAI 兼容的本地接口，让本工作台（或任何 OpenAI 兼容客户端）直接调用 Codex 账号里的
GPT-5.6 系列模型（`gpt-5.6-sol` / `gpt-5.6-luna` / `gpt-5.6-terra` 等），**无需单独申请 API Key**。

## 架构

```
Memory Agent Workbench ──HTTP──▶ Codex Bridge (127.0.0.1:8899)
                                    │  spawn `codex exec --json`
                                    ▼
                         本机 Codex CLI（~/.codex 登录态）
                                    │
                                    ▼
                       ChatGPT 账号 · GPT-5.6 模型
```

- `bridge.mjs` — 本地桥接服务：`/v1/chat/completions`（含 SSE 流式）、`/v1/models`、`/health`
- `install.mjs` — 幂等注册脚本：把 `codex` 供应商写入 `data/config/models.json`
- 服务端 `server/config.mjs` 已内置 `codex` 供应商默认项（baseURL `http://127.0.0.1:8899/v1`）

## 快速开始

```bash
# 0.（只做一次）注册供应商（默认模型自动读 ~/.codex/config.toml 的 model，即 gpt-5.6-sol）
npm run codex:install

# 1.（每次使用）一条命令同时启动桥接服务 + 工作台
npm run codex:dev

# 2. 打开 http://127.0.0.1:5173 ，在聊天输入框下方的模型切换器里选择 “Codex GPT-5.6 · gpt-5.6-sol”
```

> ⚠️ 重要：如果之前已经开着一个工作台进程，**必须先停掉再启动** —— 旧进程不会加载
> 新的供应商配置（表现为下拉框里看不到 Codex）。页面已经开着的话也要刷新。

想默认使用 Codex：`npm run codex:install -- --select`。

### 自检

```bash
npm run codex:check
```

逐项检查「工作台 → 桥接 → Codex 登录态」链路，直接告诉你哪一环断了、怎么修。

### 分开启动（可选）

```bash
npm run codex:bridge   # 只启动桥接服务
npm run dev            # 只启动工作台
```

## 验证

```bash
curl http://127.0.0.1:8899/health
curl http://127.0.0.1:8899/v1/models

curl -s http://127.0.0.1:8899/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.6-sol","messages":[{"role":"user","content":"用一句话介绍你自己"}]}'
```

## 配置（环境变量）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CODEX_BRIDGE_PORT` | `8899` | 监听端口（改端口后需同步 `data/config/models.json` 的 baseURL，或重跑 install） |
| `CODEX_BRIDGE_BINARY` | 自动探测 | Codex 可执行文件路径（macOS 默认 `/Applications/ChatGPT.app/Contents/Resources/codex`） |
| `CODEX_BRIDGE_MODEL` | 读 `~/.codex/config.toml` | 默认模型，如 `gpt-5.6-sol` |
| `CODEX_BRIDGE_WORKDIR` | 当前目录 | Codex 工作目录（建议放在 config.toml 已信任的目录，如本项目根目录） |
| `CODEX_BRIDGE_SANDBOX` | `read-only` | 沙箱级别：`read-only` / `workspace-write` / `danger-full-access` |
| `CODEX_BRIDGE_REASONING_EFFORT` | `low` | 推理强度 `low`/`medium`/`high`；设为空字符串则沿用 `config.toml` 的 `high`（更慢但更深） |
| `CODEX_BRIDGE_MAX_CONCURRENT` | `2` | 同时运行的 Codex 任务上限 |
| `CODEX_BRIDGE_TOKEN` | 空 | 设置后请求必须带 `Authorization: Bearer <token>` |
| `CODEX_BRIDGE_TIMEOUT_MS` | `300000` | 单次 Codex 任务超时 |

## 工作原理与注意点

- 每次对话请求 = 一次 `codex exec --json --ephemeral -s read-only -m <model>`，结果通过
  `item.completed → agent_message` 事件回传；流式模式下按 80 字符切片转发为 SSE，前端渐进渲染。
- 走的是本机 Codex 的 ChatGPT 登录态，`apiKey` 字段只是占位（桥接默认不校验）。
- `read-only` 沙箱下 Codex 不会写入任何文件；需要写文件时设
  `CODEX_BRIDGE_SANDBOX=workspace-write`（桥接会附加 `--approve-for-me` 自动审批）。
- 非流式调用（如记忆摘要后台任务）受服务端 60s 超时限制；推理强度设为 `high` 时可能超时，
  可在服务端 `server/model.mjs` 调大 `MODEL_TIMEOUT_MS`，或保持 `low`。
- 流式调用不受 60s 限制：桥接先回响应头再跑 Codex，事件完成后逐条下发。
- 本机同时开着 Codex 时任务会排队（`MAX_CONCURRENT`），不会互相干扰。

## 常见问题

| 现象 | 原因与修复 |
| --- | --- |
| 下拉框里看不到 “Codex GPT-5.6” | 工作台是旧进程：**停掉后重新 `npm run codex:dev`**，再刷新浏览器。旧服务进程不会加载新增的供应商代码。 |
| 下拉框是空的 / 提示输入令牌 | 服务端要求 `MEMORY_AGENT_ADMIN_TOKEN`：在你平时启动应用的终端里带同一个环境变量，或在界面里填入你平时用的令牌。 |
| 选了 Codex 但报错 / 无回复 | 桥接没在跑：`npm run codex:bridge` 的终端是否还开着？`curl http://127.0.0.1:8899/health` 应返回 ok。 |
| 报 401 / 无效令牌 | 设置了 `CODEX_BRIDGE_TOKEN` 但工作台发的 apiKey 不一致；或没设置桥接令牌却填了 apiKey。保持两侧一致即可。 |
| 回复很慢 | 推理强度 `high` 时 Codex 会深度推理。聊天建议 `CODEX_BRIDGE_REASONING_EFFORT=low`（默认）。 |
| 用打包版应用（Memory Agent.app） | 打包版是构建时的旧代码且数据在 `~/Library/Application Support/Memory Agent/`：改用 `npm run codex:dev` 开发模式，或重新 `npm run build`；数据目录可用 `node plugins/codex/install.mjs --root "~/Library/Application Support/Memory Agent"` 注册。 |

拿不准时先跑 `npm run codex:check`，它会逐项检查并给出修复提示。
