# dsh-codex-provider

DeepSeek Harness（DSH）插件：把模型调用路由到你**本机 Codex**（ChatGPT 桌面版内置 CLI，
登录态在 `~/.codex`），使用 **GPT-5.6 系列模型**（`gpt-5.6-sol` 等），无需独立 API Key。

- 安装一次，DSH 启动时**自动拉起**本地桥接、退出时**自动清理**（已有桥接则复用）；
- 通过 DSH 标准 `llm-pi-ai` 供应商机制注册 `codex` 路由，模型选择器直接可选；
- 推理档位支持 `off / low / medium / high / xhigh / max`，真实透传（不降级）。

## 架构

```
DSH Agent ──llm-pi-ai(codex 路由)──▶ 本地桥接 127.0.0.1:8899
                                       │  spawn `codex exec --json`
                                       ▼
                             本机 Codex CLI（ChatGPT 登录态）
                                       │
                                       ▼
                          GPT-5.6 系列模型（gpt-5.6-sol 等）
```

## 两种用法

### 1. 当模型用（聊天/推理）—— `codex` 供应商路由（OAuth 版，推荐）
插件注册了 `llm-pi-ai.providers.codex`。默认后端是 **OAuth 直连**（`oauth-bridge.mjs`）：
直连 `chatgpt.com/backend-api`（ChatGPT 会员订阅，**非 API 计费**），token 级流式、
**支持 DSH 原生工具调用**（agent 可以边思考边调 bash/read/write 等工具）。

- 凭据：`~/.pi-ai/auth.json`（`pi-ai login openai-codex` 设备码登录生成）
- 网络：区域封锁下需经代理（默认 `http://127.0.0.1:7897`，Clash Verge 等）
- 模型选择器选 `Codex (GPT-5.6) → gpt-5.6-sol` 即可
- 兜底：无凭据时自动退回 `bridge.mjs`（codex exec 任务级，CLEAN_MODE）

### 2. 当干活的工具用（编码子任务委托）—— `codex` 工具
插件还注册了一个 `codex` 工具，让 DSH agent 把重活委托给本机 Codex（GPT-5.6）：

- DSH agent 负责拆解/上下文/审阅；遇到实现功能、重构、修 bug 等重活时调用 `codex` 工具；
- Codex 作为**完整 agent**（自带文件/shell 工具）自主完成子任务，返回最终答复 + 改动文件列表；
- `read_only` 默认 `true`（只分析、不改文件）；设 `false` 时 Codex 实际改文件，**会弹审批让你确认**；
- 走 ChatGPT 登录态，**免费**；粒度是任务级（Codex 子任务是黑盒 agent 循环）。

示例（DSH agent 视角）：
```
codex({ task: "在 src/utils.ts 里加一个 debounce 函数并补测试", read_only: false, reasoning_effort: "high" })
→ 返回：摘要 + files_changed: [src/utils.ts (modify), src/utils.test.ts (add)]
```

> 路由 = 真·模型端点（token 级、工具调用）；工具 = 编码子任务委托（完整 agent）。互补。

## OAuth 登录（一次性）

```bash
cd ~/.pi-ai
echo "2" | NODE_OPTIONS="--use-env-proxy" HTTPS_PROXY="http://127.0.0.1:7897" HTTP_PROXY="http://127.0.0.1:7897" \
  /Users/jiayancheng/.npm/_npx/*/node_modules/.bin/pi-ai login openai-codex
```
按提示在浏览器打开 `https://auth.openai.com/codex/device` 输入验证码授权。
凭据写入 `~/.pi-ai/auth.json`，token 到期前自动刷新（桥接负责）。

> 直连会被区域封锁（`unsupported_country_region_territory`），必须走代理出口；
> Node fetch 默认不读代理 env，必须带 `NODE_OPTIONS=--use-env-proxy`（插件托管时已自动带上）。

## 安装

```bash
dsh plugin --profile web add /Users/jiayancheng/Documents/聊天智能体/plugins/dsh-codex-provider
```

包声明了 `dsh.bundle.patch`，安装后自动并入 bundles 层并注册 `codex` 供应商。
**重启 DSH**（`dsh web`）后生效；重启后无需手动启动桥接——插件入口自动完成。

验证（任意时间）：

```bash
node /Users/jiayancheng/Documents/聊天智能体/plugins/dsh-codex-provider/verify.mjs
```

## 使用

1. 打开 DSH Web，在模型选择器中选择 `Codex (GPT-5.6)` → `gpt-5.6-sol`；
2. 需要深度推理时把推理档位选到 `high / xhigh / max`（真实透传到 Codex）；
3. 新建会话生效（已有会话沿用其创建时的模型选择）。

## 文件

| 文件 | 作用 |
| --- | --- |
| `cordis.patch.yml` | bundle patch：注册 `llm-pi-ai.providers.codex` 路由 + 挂载入口行 |
| `index.mjs` | Cordis 入口：① 自动拉起/回收桥接子进程 ② 注册 `codex` 工具（任务级委托，写模式接审批） |
| `bridge.mjs` | 本地桥接：OpenAI 兼容 `/v1/chat/completions`（CLEAN_MODE，含 SSE）、`/v1/models`、`/health` |
| `verify.mjs` | 链路自检 + `gpt-5.6-sol + max` 真实调用 |
| `package.json` | 包元数据，`dsh.bundle.patch` 声明 |

## 桥接环境变量（可选）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CODEX_BRIDGE_PORT` | `8899` | 监听端口（改端口需同步 patch 与 settings 的 baseURL） |
| `CODEX_BRIDGE_BINARY` | 自动探测 | Codex 可执行文件路径 |
| `CODEX_BRIDGE_MODEL` | 读 `~/.codex/config.toml` | 默认模型 |
| `CODEX_BRIDGE_WORKDIR` | 当前目录 | Codex 工作目录 |
| `CODEX_BRIDGE_SANDBOX` | `read-only` | 沙箱级别（`workspace-write` 可让 Codex 写文件，会附加 `--approve-for-me`） |
| `CODEX_BRIDGE_REASONING_EFFORT` | `low` | 请求未指定推理档位时的默认值 |
| `CODEX_BRIDGE_TOKEN` | 空 | 设置后请求需带 `Authorization: Bearer <token>` |

## 常见问题

| 现象 | 原因与修复 |
| --- | --- |
| 报 `No API key for provider: codex` | `.credentials.yaml` 缺 `CODEX_LOCAL_KEY`，插件启动时会自动补；手动补或重装 |
| 报连接失败 / 无响应 | 桥接没起：`curl http://127.0.0.1:8899/health`；插件入口应已自动拉起，或手动 `node bridge.mjs` |
| 模型选择器看不到 Codex | 插件安装后**未重启 DSH**；或 patch 未并入（`dsh --profile web --dump-config` 检查 `llm-pi-ai` 行） |
| 选了 `max` 但没生效 | 旧桥接进程仍是老代码：停掉 8899 上的旧进程，让插件入口拉起新桥接 |

## 卸载

```bash
dsh plugin --profile web remove dsh-codex-provider
```

删除后重启 DSH；如需彻底清理，再从 `settings.yaml` 删除 `llm-pi-ai.providers.codex` 段。
