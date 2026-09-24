# 测试代码范式（test-code-patterns）

> 空骨架：编写 POM/spec/fixture 前通读本文件；新范式随运行沉淀。

## POM

- class extends BasePage + 私有 Locator getter（不在测试里裸写 selector）
- dialog / 弹层助手封装（自研弹层无组件库，等待内部选项可见再操作）
- selector 分级容差编码：稳定语义属性优先 → 文案 → 结构兜底

## spec 骨架

```text
describe(<模块>) → use 登录态 fixture → beforeEach 导航 → afterEach 清理残量为零
```

- 登录态：`POST /api/auth/login`（临时令牌）建立会话；登录用例本身覆盖错误令牌路径
- 数据落点：临时数据根；mock 模型供应商与联网搜索

## 流式回复断言

聊天回复逐段渲染：等流结束标记或气泡进入终态后再断言内容，不等中间态。

## 数据清理

- 新增：开始前清同名残留，结束删除并确认不存在
- 修改：保存原值，结束写回并重读确认
- 删除：自建数据真实删除并验证；环境既有数据不删
- 清理失败不得静默吞掉，最终断言残留集合为空
