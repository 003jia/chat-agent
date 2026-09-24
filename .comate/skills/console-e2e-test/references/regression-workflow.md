# 全量回归流程（regression-workflow）

> 完整回归 sweep 时通读本文件。

1. **启动自检**：扫 `qa-screenshots/history/` 历史归档，识别环境性集体 skipped；出现 `expected===0` + 短 duration + 秒挂信号先修环境（dev server、令牌、临时数据根、Playwright 浏览器），再谈测试。
2. **执行纪律**：始终 `npm run test:e2e:<module>` 串行逐模块 sweep。
3. **失败归类四型分别处置**：
   - A 环境 → 修环境；
   - B 种子数据缺失 → spec 内 detect empty state + `test.skip(condition, reason)` + 同步 TC md 预期段补空态分支；
   - C 组件时序耦合（自研弹层、流式渲染等）→ 三层防御（预清理 + force-click + goto 兜底），终态改业务级不变量断言；
   - D 清理流水线抖动 → retry-with-reset helper 包裹但末尾保留硬 expect。
4. **Fix 应用范围**：单条修完先重跑所在模块定论；受同一 POM 变更影响的兄弟模块排进同一 sweep 依次过一遍。
5. **绿灯收尾判据**：各模块最近一次归档满足 `unexpected===0 && flaky===0 && expected>0`；允许合规 skipped 但需列明 TC-ID 与豁免类别。
6. **合规豁免只接受 B/D 两类**且必须同步文档与代码——不允许为通过而弱化核心业务 Locator 断言。
