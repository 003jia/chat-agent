# E2E 环境搭建（setup）

> 空骨架：环境踩坑点随运行沉淀追加。

## 首次搭建

1. `npm install`
2. `npx playwright install chromium`
3. 设置 `MEMORY_AGENT_ADMIN_TOKEN`（本地开发用 `dev-token`，与 `package.json` electron:dev 一致）
4. `npm run dev` 确认前端 `127.0.0.1:5173` / 后端 `127.0.0.1:8787` 可达
5. Playwright 配置 `webServer` 自动拉起 dev，或测试前置脚本确认端口就绪

## 数据隔离（红线）

- E2E 一律把数据根指向临时目录（环境变量注入被测服务），**禁止读写真实 `data/`**（用户记忆、会话、API Key）
- 聊天/联网搜索类用例 mock 模型与搜索调用，不打真实外部 API

## 已知环境坑

### 沙箱/受限 macOS 会话下 chromium 无法启动（2026-09-01 实测）

- 现象：`browserType.launch` 崩溃，报 `bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer: Permission denied (1100)`；普通 headless 与 `channel:"chromium"` 新无头均失败。
- 根因：受限会话（如 IDE 沙箱/审计环境）禁止进程注册 Mach bootstrap 端口。
- 解法：`launchOptions.args` 加 `--no-sandbox --single-process`。注意：
  - `--single-process` 下**浏览器无法跨用例复用**——关闭一个 context 会连带杀死整个浏览器进程。必须 `fullyParallel: true` + `workers >= 用例数`，让每个用例独占一个 worker/浏览器。
  - 复制用例依赖 `navigator.clipboard.writeText`，需 `use.permissions: ["clipboard-read", "clipboard-write"]`，否则 `navigator.clipboard` 抛错 → UI 提示「复制失败」。
- 浏览器安装：沙箱内写 `~/Library/Caches/ms-playwright` 会 EPERM。用 `PLAYWRIGHT_BROWSERS_PATH=$PWD/.e2e-browsers npx playwright install chromium` 装到项目内目录（已入 .gitignore）；运行同样要带该 env。
- npm 缓存被 root 占用时：`npm install --cache .npm-cache`（项目内缓存，已入 .gitignore）。

### 数据隔离

- 后端必须用 `scripts/e2e-server.mjs` 启动（`createApp({ rootDir, env, modelClient })`）：rootDir 指向临时目录，注入 `MEMORY_AGENT_API_KEY_OPENAI_COMPATIBLE`（providerFromConfig 在校验 Key 后才进 modelClient，缺 Key 会 MISSING_API_KEY），modelClient 全 mock。
- 若 8787 被残留旧进程占用（`lsof -i :8787`），Playwright `reuseExistingServer` 会复用旧实例导致行为漂移——先清理再跑。
