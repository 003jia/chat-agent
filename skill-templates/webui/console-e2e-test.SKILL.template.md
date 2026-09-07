---
name: console-e2e-test
description: Use when running, designing, or reviewing Playwright UI/E2E tests for Memory Agent Workbench, including screenshot QA, selectors, drawers, chat flows, auth setup, responsive layouts, traces, videos, and regression failures.
---

# Memory Agent Workbench UI 回归测试

## 当前状态

- 前端：React 19 + TypeScript + Vite，源码在 `src/`，没有第三方 UI 组件库，主要使用自研 CSS 与 `lucide-react`。
- Playwright 已在 devDependencies；现有截图入口是 `npm run qa:screenshots` 和 `scripts/capture-screenshots.mjs`。
- 完整 E2E 资产预留在 `e2e/`：`e2e/pages/`、`e2e/specs/`、`e2e/fixtures/`；用例文档预留在 `docs/test-cases/regression/`。
- 前端默认 `127.0.0.1:5173`，后端 `127.0.0.1:8787`。登录使用账号密码换取 `X-Admin-Token`，测试必须使用临时数据根。

## 边界与运行

- 只修改 `e2e/`、`docs/test-cases/`、Playwright/测试脚本配置；`src/`、`server/` 只读，产品缺陷记录证据，不顺手修业务代码。
- `data/` 是用户真实数据，E2E 禁止读写；启动服务时注入临时根目录并在结束后清理。
- 当前截图脚本只能证明布局截图，不等价于完整 E2E 通过；不得把截图存在当作交互验收。
- 串行运行测试；未来模块入口命令统一为 `npm run test:e2e:<module>`，归档入口统一为 `scripts/run-and-archive.mjs`。

## 用例与断言

1. 先读目标组件、`src/api.ts`、`src/types.ts`、对应 `docs/api/` 和已有截图脚本。
2. 覆盖登录、聊天、会话、角色设置、记忆审核、工具审批、桌面/移动端抽屉等真实用户路径。
3. 最终通过判定必须落在 UI：消息气泡、按钮状态、弹窗、列表、空态、URL 或可见文本；接口只用于前置、清理和等待同步。
4. 不可逆操作停在最终确认前；测试创建的数据必须自建、自用、自清理。
5. 流式回复等待终态事件或 UI 稳定状态，禁止用固定 sleep 替代条件等待。现有截图脚本中的短暂等待只属于截图用途。

## 失败与交付

- 先看 trace、视频、截图和浏览器日志，再排服务/令牌/临时数据、selector/时序、产品逻辑。
- 任何 skipped 必须有 TC-ID 和原因；不得为绿灯削弱业务 Locator 断言。
- 完整 E2E 归档至少包含报告、结果 JSON、HTML 报告和 video/trace；当前只有截图 QA 时明确标注缺少哪些要素。
