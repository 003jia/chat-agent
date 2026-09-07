# E2E 测试工程（Memory Agent Workbench）

Playwright 端到端自动化测试，覆盖 UI 层回归与需求轨首轮验收。详细流程见
`.comate/skills/console-e2e-test/SKILL.md` 与 `references/`（执行纪律、调试、三方同步、全量回归）。

## 目录结构

```text
e2e/
  pages/           POM（BasePage + 各页面，稳定语义定位符优先）
  specs/           用例 spec（describe 分组，按模块）
  fixtures/        登录态 fixture 与 API 辅助
global-setup.mjs   运行前清理隔离数据根 .e2e-tmp
```

## 环境要求

- Node 22+；`npm install`（含 `playwright` 与 `@playwright/test`）
- 浏览器：`PLAYWRIGHT_BROWSERS_PATH=$PWD/.e2e-browsers npx playwright install chromium`
  （浏览器装到项目内目录，避免写系统缓存失败）

## 运行

```bash
# 单模块（推荐，走归档单入口）
npm run test:e2e:chat
npm run test:e2e:login

# 直接跑（不归档）
npx playwright test --project=chat
```

- **必须串行**执行，禁止同时运行多个 `test:e2e:*`（会写破归档 meta）。
- 统一走 `scripts/run-and-archive.mjs` 单入口：rotate → run → generate → archive，回传原始退出码。
- 归档落在 `qa-screenshots/history/<module>/<timestamp>/`，四要素：`report.md` / `results.json` / `html/` / `video-trace/`。

## 数据隔离（红线）

- 被测后端由 `scripts/e2e-server.mjs` 启动：数据根注入 `.e2e-tmp`（每次运行前由 global-setup 清理），
  **禁止读写真实 `data/`**（用户记忆、会话、API Key）。
- 管理令牌固定 `dev-token`，登录通过 `POST /api/auth/login`（admin/admin123）换取。
- 聊天/记忆整理/联网搜索一律走 `createApp({ modelClient })` 注入的 mock，不打真实模型 API。

## 定位符纪律

- 优先语义属性（`aria-label`、`role`、`placeholder`）→ 文案 → 结构兜底。
- 自研弹层/抽屉：容器可见后再等内部选项可见，再 count/click/断言。
- 终态校验必须落在 UI 层断言（`toBeVisible` / `toContainText` 等）；接口仅作前置、时序同步与交叉复核。
