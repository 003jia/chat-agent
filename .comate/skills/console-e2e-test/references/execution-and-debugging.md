# 运行与调试（execution-and-debugging）

> 运行和调试时通读本文件；调试纪律踩坑随运行沉淀。

## 运行纪律

- 始终 `npm run test:e2e:<module>` **串行**执行；并行会写破 meta 竞态导致归档串目录
- 修复后重跑**完整模块**定论，不只重跑单条
- 归档走 `scripts/run-and-archive.mjs` 单入口（rotate→run→generate→archive，回传原始退出码），禁止手写四段串联

## 调试顺序

1. 失败先看 trace / 视频 / 截图中的**界面现象**（`npx playwright show-trace <trace.zip>`）
2. HTTP 200 不能单独用于关掉失败报告或缺陷工单
3. 等待问题：禁止固定等待替代条件等待（接口响应、URL、Locator 状态）
4. 自研下拉/抽屉/弹层：容器可见后再等内部选项可见，再 count/click/断言

## 已知调试坑

### 双端渲染严格模式冲突（2026-09-01 实测）

- 现象：`[data-companion]`、composer、message-row 等定位符 `strict mode violation: resolved to 2 elements`。
- 根因：App 同时渲染 `.desktop-workbench` 与 `.mobile-shell` 两套 DOM。
- 解法：所有页面级定位符统一限定桌面端（`.desktop-workbench ` 前缀）+ 必要时 `.first()`；登录进入工作台断言用 `.desktop-workbench` 而非 `[data-companion]`。

### hover 才可见的元素（2026-09-01 实测）

- 现象：`message-actions`（复制/重新生成按钮）`toBeVisible` 失败，显示 hidden。
- 根因：CSS `opacity: 0`，仅 `.message-row:hover` 才显示。
- 解法：先 `.hover()` 消息行再断言/点击。

### 流式回复停留在「正在生成...」（2026-09-01 实测）

- 现象：助手气泡一直「正在生成...」，15s 超时。
- 根因：`buildChatPayload` → `providerFromConfig` 在进入 `modelClient` 前先校验 API Key；e2e-server 未注入 Key 时报 `MISSING_API_KEY`，mock 根本走不到。
- 解法：e2e-server 注入 `MEMORY_AGENT_API_KEY_OPENAI_COMPATIBLE`；清理 8787 残留旧进程后再跑。
