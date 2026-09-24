# 三方同步核对（sync-validation）

> 写完/改完文档与代码后、运行前逐项核对。

1. **TC-ID ↔ 标题**：TC md 小标题原文 = spec `test()` 标题 = 归档目录/报告标题
2. **元信息有效性**：运行命令存在于 package.json；关联 spec 路径真实存在
3. **预期锚点**：每条预期结果能指到浏览器可视区域一个观测锚点
4. **清理闭环**：spec 内自建数据在 afterEach 有清理路径且末尾断言残量为零
5. **双轨归属**：文件位于正确的 `docs/test-cases/{regression,requirements}/` 下，「用途」列值一致

任何一项不一致，先修再跑。
