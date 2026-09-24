# TC 用例文档规范（test-case-doc）

## 文件位置

- 回归轨：`docs/test-cases/regression/`（本 skill 维护）
- 需求轨：`docs/test-cases/requirements/`（由 `prd-driven-testing` 维护，转轨时 `git mv` + 改「用途」列同一次完成）

## 命名

`TC-<模块>-00N_<英文短名>.md`，模块取 chat / memory / tasks / settings 等小写短名。

## 元信息表（必须包含）

| 字段 | 值 |
|---|---|
| 用途 | regression |
| 覆盖范围 | <模块/功能面> |
| 运行命令 | `npm run test:e2e:<module>` |
| 关联 spec | `e2e/specs/<module>/...` |
| 账号/登录方式 | 管理令牌登录（临时令牌 + 临时数据根） |
| 清理方式 | afterEach 删自建数据，断言残量为零 |

## 正文结构

1. TC-ID + 小标题（spec 的 test 标题必须**复制小标题原文**，保证归档脚本 regex 命中）
2. 前置条件（登录态、种子数据）
3. 步骤（按用户路径排列）
4. 预期结果（每条映射浏览器可视区域内一个观测锚点，不接受纯接口语义预期）
5. 数据清理说明
