> ⚠️ 这是 `README.md` 的优化版草稿。本文档整理了你提到的 **第2、3、4条** 以及 **B类问题**。确认后，可把本内容直接替换根目录的 `README.md`，并配合执行文末「配套清理动作」中的改名与 `.DS_Store` 清除。

# Memory Agent Workbench

一个本地优先的聊天智能体工作台。它支持角色预设、多供应商模型配置、流式对话、联网搜索、本地长期记忆和候选记忆审核。相比通用助手默认替你记住一切，这里更强调"你拥有对长期记忆的最终审批权"。

## 产品差异化：可控的长期记忆

豆包、千问这类通用智能体会自动把对话内容沉淀为上下文偏好；Memory Agent Workbench 则采用**先审后发**机制——后台抽取出的每一条候选记忆都会展示给你逐条接受 / 编辑 / 拒绝，只有被明确确认的条目才会写入审计日志和后续使用的 `memory.md`。

这意味着你可以放心进行探索式对话，不用担心随口一提的内容被永久绑定到角色或会话中。

## 当前能力

| 模块 | 说明 |
|---|---|
| **多模型接入** | OpenAI-compatible、OpenAI、DeepSeek、Anthropic；API Key 可通过界面配置并落盘到 `data/config/models.json`。**强烈建议通过环境变量注入密钥以规避明文保存风险。** |
| **角色与会话管理** | 新增、切换、删除自定义角色；会话可显式绑定某个角色；左侧会话列表支持新建、切回和删除历史对话。 |
| **聊天体验** | 桌面端三栏响应布局，移动端独立适配聊天页和设置页；Markdown（列表、代码块、表格、链接、引用）边流式返回边渲染。 |
| **联网搜索** | 搜索结果会作为不可信上下文加入 Prompt，并在系统层做 Prompt 注入防护处理。 |
| **候选记忆审核** | 每次对话结束后由服务端抽取出候选记忆 → 写入 `index.json` 的 candidate 状态 → 用户手动接受 / 编辑 / 拒绝 → 更新 `index.json`，追加 raw Markdown 审计日志，并重新渲染 `memory.md`。下一轮对话按相关性和优先级加载高价值记忆。 |
| **安全加固** | CORS 白名单限制、仅监听本地地址、`MEMORY_AGENT_ADMIN_TOKEN` 保护受控接口、限流、模型请求超时、错误脱敏日志。 |
| **测试与 CI** | Vitest 覆盖核心纯函数和接口冒烟测试；GitHub Actions 自动化运行单测与构建。 |

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

> 💡 **路径建议**：建议将仓库克隆到纯英文目录后再启动开发服务器。部分工具链在中文路径下解析时可能出现兼容性异常。

## 环境与 API Key

推荐做法是把敏感配置作为 shell 环境变量传入。例如使用 DeepSeek：

```bash
export MEMORY_AGENT_ADMIN_TOKEN=your-admin-token-here
export MEMORY_AGENT_API_KEY_DEEPSEEK=sk-...
# export MEMORY_AGENT_API_KEY_OPENAI=sk-...
# export MEMORY_AGENT_API_KEY_ANTHROPIC=sk-ant-api03-...
# export MEMORY_AGENT_API_KEY_OPENAI_COMPATIBLE=sk-...

npm run dev   # frontend http://127.0.0.1:5173 ; backend http://127.0.0.1:8787
```

**关于 `.env*`**：仓库里 `.env`、`.env.*` 已写入 `.gitignore`，但当前 Express 服务不会主动读取这些文件。如果你希望用文件方式管理环境变量，请自行 source 进当前 Shell，例如：`set -a && source .env.local && set +a`。

### API Key 存储提醒 ⚠️

如果在前端页面输入了密钥，它会保存在 **`data/config/models.json`**。虽然 `data/` 整体已被 Git 忽略，但它仍是**本机明文文件**，任何能访问此电脑的人均可能读到。请不要在该工作台存放生产级或个人高敏感的 API Key。

## 常用命令

```bash
npm test              # Vitest 单元/冒烟测试
npm run build         # TypeScript 检查 + Vite 构建产物输出到 dist/
npm run preview       # 预览构建后的静态站点（端口 5173）
```

### QA 截图

截图脚本依赖 Playwright Chromium，并且要求前端服务已经运行在 `http://127.0.0.1:5173/`：

```bash
npx playwright install chromium      # 只需一次
npm run dev                          # 保持终端常驻
# 另起终端
npm run qa:screenshots               # 生成 qa-screenshots/{desktop,mobile-chat,mobile-settings}.png
```

## 部署说明

本项目设计为**本地单人使用的工作台**，目前不面向多租户或服务化场景。

若要在同一台机器上以更接近生产的模式启动后端与前端产物，可以先构建再直接跑 Node Server：

```bash
npm ci          # 或使用 npm install --omit=dev 精简依赖
npm run build
NODE_ENV=production \
  MEMORY_AGENT_ADMIN_TOKEN=your-admin-token-here \
  node server/index.mjs    # 同时托管 dist/ 内的打包资源并提供 API
```

## 本地数据结构

首次运行会自动创建 `data/` 目录，所有内容均**不会被 Git 提交**：

```text
data/config/roles.json
data/config/models.json
data/conversations/*.json
data/memory/raw/YYYY-MM-DD.md        # 人工审核通过的 append-only 审计日志
data/memory/index.json                # 记忆主索引，包含 active/candidate/disabled 状态
data/memory/memory.md                 # 由 index.json 中 active 记忆自动渲染的可读摘要
```

注意：`memory.md` 为自动生成文件，应通过应用内操作更新，不建议手工编辑。

## 记忆链路

```text
用户消息
  -> 模型回复流式返回
  -> 后台抽取候选记忆 actions（add/update/disable/noop）
  -> candidate 状态写入 index.json
  -> 用户在界面上逐条接受 / 编辑 / 拒绝
  -> 接受后更新 index.json，并追加 raw/YYYY-MM-DD.md 审计日志
  -> memory.md 由 active 记忆重新渲染
  -> 下一轮对话按相关性、优先级、时间衰减加载记忆片段
```

## 安全与隐私

- Git 忽略项包含 `data/`、`.env*`、`.workbuddy/`、macOS `.DS_Store`、`*.log`、构建产出等。
- 前端的设置面板只会告诉你某供应商 Key "是否已配置"，永远不会显示明文。
- 搜索摘要和用户消息在被喂给大模型之前，都会被当作用户侧不可信内容进行包裹隔离。

## 相关产品文档与设计源件

- [产品设计概览](./project-overview.md)
- [交互/UI 设计稿源文件](./chat-workbench-design.pen) · 需用 Pencil 打开
- [docs/](./docs/) 文件夹内有历次需求记录和安全稳定性改造纪要。

## License

MIT License

---

## （优化方案）配套清理动作清单

将上述正文替换原 `README.md` 之后，还需要做以下少量仓库层面的收尾工作：

- [ ] 将项目顶层 `overview.md` 改名为语义名称 `project-overview.md`
- [ ] 将项目顶层 `untitled.pen` 改名为语义名称 `chat-workbench-design.pen`
- [ ] 删除散落在各目录且已被 `.gitignore` 排除的 macOS 元数据缓存：
  ```bash
  rm -f "/Users/jiayancheng/Documents/聊天智能体/.DS_Store"
  rm -f "/Users/jiayancheng/Documents/聊天智能体/docs/.DS_Store"
  rm -f "/Users/jiayancheng/Documents/聊天智能体/src/.DS_Store"
  ```
