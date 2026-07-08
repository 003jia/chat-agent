# 代码评审门禁清单（Code Review Checklist）

> 用法：作为每个 PR 的必填模板。Reviewer 逐项确认，任何一项不通过则 **block merge**。
> 目标：把质量卡在合并前，不靠人盯人。

---

## ✅ 1. 安全门禁（Security Gate）— 任一不过则阻断
- [ ] 新增/修改的对外接口是否限制了来源（CORS origin 白名单，非 `*`）？
- [ ] 是否存在对外状态变更接口（写配置/发消息/写数据）缺少鉴权？
- [ ] 所有对外 `fetch`/HTTP 调用是否都带超时（`AbortController`/`signal`）？
- [ ] 是否有速率限制 + 单条请求体大小上限（尤其 `/api/chat` 类接口）？
- [ ] 外部/用户输入内容（记忆、搜索结果、用户消息）是否做了**角色隔离**，未直接拼入 system prompt？
- [ ] 密钥/Token 是否明文落盘？落盘前是否加密？
- [ ] 是否信任了外部可控的 URL（SSRF：`baseURL` 指向内网）？

## ✅ 2. 性能门禁（Performance Gate）
- [ ] 是否存在每次请求全量读写的文件/数据（O(n) 扫描）？能否加缓存或索引？
- [ ] 前端是否对纯展示组件加了 `React.memo`，避免整树重渲染？
- [ ] 大型/双端组件是否做了 code-split（`React.lazy`）？
- [ ] 是否存在同步阻塞或在大循环里做 IO？

## ✅ 3. 可维护性门禁（Maintainability Gate）
- [ ] 单文件/单组件是否超过 300 行？超了是否拆？
- [ ] 是否存在重复逻辑（特别是配置/开关在多处各写各的）？是否已抽公共组件？
- [ ] 是否存在魔法字符串/魔数？是否已抽到 `constants.ts` 并注释？
- [ ] 异常处理是否 `catch` 后至少 `console.error` 上报？是否存在静默吞异常？
- [ ] 是否有竞态风险（如 `access` 后 `writeFile`）？是否用原子写（`.tmp`→rename）？

## ✅ 4. 测试门禁（Testing Gate）
- [ ] 新后端逻辑是否补了 Vitest 单测？
- [ ] 关键前端交互是否补了 Playwright 冒烟/断言？
- [ ] CI 中测试是否全绿？
- [ ] 是否修复了"本可由测试覆盖"的历史 bug？（顺手补测）

## ✅ 5. 一致性门禁（Consistency Gate）
- [ ] UI 文案是否走 i18n，无硬编码英文标签混在中文界面？
- [ ] 同一字段在桌面/手机端显示精度、步进是否一致（如 temperature）？
- [ ] 前后端类型（`ModelConfig`/`AgentConfig`）是否共享/对齐，无漂移？
- [ ] lint（ESLint + Prettier）是否 0 错误？

---

## Definition of Done（合并前必须全部满足）
1. 上述 5 个门禁全部通过（安全门禁零例外）。
2. 至少 1 名 reviewer 签字。
3. CI 绿（lint + test）。
4. 关联文档/知识库已更新（如涉及新 pattern）。

> 本清单与 `01-code-quality-audit.md` 的发现一一对应：C1/C2 → 安全门禁；M3/M6 → 性能门禁；M4/M5/M12 → 可维护性门禁；M9/M10 → 测试门禁；M7/M8/M11 → 一致性门禁。
