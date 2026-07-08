# 2026-07-07 安全稳定性与质量底座加固记录

## 当前状态

- 分支：`main`
- 基线：当前工作区继续推进，未回滚已有动效、联网搜索、记忆抽取和测试基础改动。
- 未提交状态：存在本轮改动和此前未跟踪文件。
- 明确未纳入：`.workbuddy/` 未参与本次实现和记录。

## 本轮主要改动

- 后端安全：
  - 增加 `MEMORY_AGENT_ADMIN_TOKEN` 管理令牌。
  - 受保护接口通过 `X-Admin-Token` 调用。
  - 聊天、流式聊天、联网搜索、模型测试、配置写入、记忆提交和整理加鉴权。
  - 增加 `express-rate-limit`，聊天和写入接口分别限流。
  - 全局错误处理增加脱敏日志，避免输出 API Key、Authorization、admin token。

- 后端稳定性：
  - `server/index.mjs` 缩成启动器。
  - 新增 `createApp()`，使后端接口可不监听端口直接测试。
  - `/api/health` 改成 readiness 检查，覆盖数据目录、配置和记忆文件。
  - 记忆写入增加单写锁，避免并发提交覆盖。
  - 文件写入增加短重试，仅用于 `EBUSY`、`EMFILE`、`ENFILE`。
  - web 搜索增加指数退避；模型聊天不自动重试，避免重复扣费。
  - prompt 中长期记忆、联网搜索、用户消息都增加分隔符和长度截断。
  - 魔法数字提到常量文件。

- API Key 策略：
  - 支持环境变量覆盖模型 key。
  - 如果对应 provider 已有环境变量 key，保存模型配置时不再把该 provider 的 key 写入 `models.json`。
  - 前端仍可输入新 key，但必须有管理令牌才能保存。

- 前端结构：
  - `src/App.tsx` 拆成轻量入口。
  - 状态逻辑迁入 `src/hooks/useWorkbenchState.ts`。
  - 桌面、手机、聊天、设置、记忆、抽屉和通用 UI 拆到 `src/components/`。
  - API 请求层统一从 `sessionStorage` 读取管理令牌并注入 `X-Admin-Token`。
  - 手机设置页增加本地管理令牌输入、保存和清除。
  - 温度滑块统一为 0.1 步进、显示 1 位小数。
  - 界面文案第一版主要统一为中文。

- 工程门禁：
  - 新增 GitHub Actions CI：`npm ci`、`npm test`、`npm run build`。
  - 新增 PR 模板。

## 主要改动文件

- 后端入口与模块：
  - `server/index.mjs`
  - `server/app.mjs`
  - `server/auth.mjs`
  - `server/config.mjs`
  - `server/constants.mjs`
  - `server/conversations.mjs`
  - `server/errors.mjs`
  - `server/http.mjs`
  - `server/ids.mjs`
  - `server/lock.mjs`
  - `server/logger.mjs`
  - `server/memory.mjs`
  - `server/model.mjs`
  - `server/prompt.mjs`
  - `server/retry.mjs`
  - `server/search.mjs`

- 后端测试：
  - `server/app.test.mjs`
  - `server/config.test.mjs`
  - `server/memory.test.mjs`
  - `server/prompt.test.mjs`
  - `server/search.test.mjs`

- 前端：
  - `src/App.tsx`
  - `src/api.ts`
  - `src/types.ts`
  - `src/styles.css`
  - `src/workbenchTypes.ts`
  - `src/hooks/useWorkbenchState.ts`
  - `src/components/ChatPanel.tsx`
  - `src/components/InteractionPanel.tsx`
  - `src/components/MemoryPanel.tsx`
  - `src/components/SettingsPanels.tsx`
  - `src/components/Workbenches.tsx`
  - `src/components/ui.tsx`

- 工程配置：
  - `package.json`
  - `package-lock.json`
  - `.github/workflows/ci.yml`
  - `.github/pull_request_template.md`

## 验证记录

- `npm test`
  - 结果：通过
  - 覆盖：5 个测试文件，23 个测试

- `npm run build`
  - 结果：通过
  - 覆盖：TypeScript 编译和 Vite 生产构建

- `node --check server/app.mjs`
  - 结果：通过

- `node --check server/index.mjs`
  - 结果：通过

- `npm run qa:screenshots`
  - 结果：通过
  - 输出：
    - `qa-screenshots/desktop.png`
    - `qa-screenshots/mobile-chat.png`
    - `qa-screenshots/mobile-settings.png`

## 当前未提交文件状态说明

- `.workbuddy/` 仍为未跟踪目录，本次未修改。
- `docs/team-improvement/*`、`overview.md` 为此前未跟踪文件，本记录不判断其归属。
- 本记录文件：`docs/2026-07-07-security-stability-hardening-record.md`。

## 后续建议

- 提交前再跑一次 `npm test` 和 `npm run build`。
- 若要推送到 GitHub，先确认是否把此前未跟踪的 `docs/team-improvement/*`、`overview.md` 一并纳入提交。
- 生产化前继续评估 API Key 落盘加密或系统 keychain。
