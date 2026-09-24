# FAQ（faq）

> 环境问题先查这里，再走 L1→L5。空骨架随运行沉淀。

## Q: 测试一跑全部超时？

（暂无。常见方向：dev server 未起、webServer 超时配置、令牌未设导致登录页卡住）

## Q: 浏览器启动崩溃 `bootstrap_check_in ... Permission denied (1100)`？

受限 macOS 会话的 Mach 端口注册限制。见 `setup.md`：`launchOptions.args` 加 `--no-sandbox --single-process`，且 `fullyParallel: true` + `workers >= 用例数`（单进程下浏览器不可跨用例复用）。

## Q: 复制用例报「复制失败」？

headless 无剪贴板权限。`use.permissions` 加 `["clipboard-read", "clipboard-write"]`。

## Q: 定位符报 strict mode violation（resolved to 2 elements）？

页面同时渲染桌面端与移动端两套 DOM。定位符加 `.desktop-workbench` 前缀限定桌面端。见 `execution-and-debugging.md`。

## Q: 聊天助手一直「正在生成...」超时？

e2e-server 需注入 `MEMORY_AGENT_API_KEY_OPENAI_COMPATIBLE`，且确认 8787 无残留旧进程。见 `execution-and-debugging.md`。
