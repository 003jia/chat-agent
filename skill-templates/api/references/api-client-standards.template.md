# API 客户端封装规范

> 适用于 `{{API_LAYER_DIR}}`。本文件定义跨项目的封装原则；HTTP 库、认证方式、响应包装格式和环境地址必须按项目配置替换，不要把示例中的实现细节直接当成项目事实。
>
> 代码片段以 Python 风格展示；如果 `{{TEST_FRAMEWORK}}` 使用 TypeScript/Vitest、Java/RestAssured 或其他框架，只迁移职责和约束，按项目语法替换实现。

## 0. 项目配置

| 配置项 | 占位符 | 项目取值 |
|---|---|---|
| HTTP 库/客户端 | `{{HTTP_CLIENT_LIBRARY}}` | 例如 requests、httpx、RestAssured、fetch |
| API 封装目录 | `{{API_LAYER_DIR}}` | 例如 `api/{env}/` |
| Base URL 来源 | `{{ENV_CONFIG_SOURCE}}` | 例如 `.env`、fixture、CI secret |
| 认证头/认证入口 | `{{AUTH_HEADER}}` / `{{AUTH_ENTRY}}` | 例如 `Authorization: Bearer` |
| 响应格式 | `{{RESPONSE_FORMAT}}` | 例如 HTTP status + `body.data` |
| 响应解析器 | `{{RESPONSE_PARSER}}` | 例如 `utils/response.py` |
| 预置账号 | `{{PRESET_ACCOUNTS}}` | 角色与环境变量名 |
| 请求示例 | `{{CLIENT_EXAMPLES_REF}}` | 项目内客户端示例文件 |
| 错误类型 | `{{CONNECTION_ERROR}}` / `{{TIMEOUT_ERROR}}` | 当前 HTTP 库对应异常 |
| 超时策略 | `{{READ_TIMEOUT}}` / `{{WRITE_TIMEOUT}}` / `{{UPLOAD_TIMEOUT}}` | 秒数及特殊说明 |
| 临时数据方法 | `{{UNIQUE_DATA_METHOD}}` | UUID、时间戳或项目 helper |

## 1. 分层职责

API 客户端负责“如何请求”，测试用例负责“验证什么”：

- 客户端层统一管理 Base URL、HTTP 方法、路径、请求参数、请求体、认证入口、超时、重试、日志和响应解析。
- 测试层通过语义化方法调用接口，不在测试代码中重复拼接 URL、认证头或解析同一层响应。
- 业务流程层只编排多个 API 方法和业务步骤，不直接调用底层 HTTP 客户端。
- 通用响应校验、错误格式化可放在 `{{RESPONSE_VALIDATOR_PATH}}`，但不能因此吞掉业务错误。

推荐结构：

```text
{{API_LAYER_DIR}}/
├── {{HTTP_CLIENT_MODULE}}       # Base URL、会话、请求、重试、日志
├── {{MODULE_API_MODULE}}        # 具体模块的语义化接口封装
└── {{AUTH_MODULE}}              # 认证信息读取与注入（可选）
```

## 2. 统一返回格式

所有 API 方法尽量返回统一结构，具体字段由 `{{RESPONSE_FORMAT}}` 配置：

```python
{
    "status_code": int,      # HTTP 状态码
    "data": Any,             # 已解析的业务数据
    "headers": dict,         # 响应头
    "error": str | None      # 网络/解析错误；业务错误仍须可被测试断言
}
```

如果项目使用 body 内业务码（例如 HTTP 恒为 200、业务码位于 `data.code`），必须在客户端规范和接口文档中明确区分：

```python
assert response["status_code"] == 200
assert response["data"]["code"] == EXPECTED_BUSINESS_CODE
```

客户端可以统一解析 JSON 和网络异常，但不得把 4xx、5xx 或业务失败转换成成功响应，也不得将失败返回空字典后让测试“看起来通过”。

## 3. 路径和请求参数

路径集中管理，禁止在测试代码里硬编码完整 URL：

```python
ENDPOINTS = {
    "list": "{{LIST_PATH}}",
    "detail": "{{DETAIL_PATH}}",
    "create": "{{CREATE_PATH}}",
}

def list_items(self, *, page=0, page_size=20, **kwargs):
    params = {"page": page, "pageSize": page_size, **kwargs}
    return self.client.get(ENDPOINTS["list"], params=params)
```

要求：

- Base URL 来自 `{{ENV_CONFIG_SOURCE}}`，路径只保存相对路径。
- Query、Path、JSON、Form、Multipart 参数分别显式传递。
- 参数名以最新接口文档和源码为准；不要在客户端层悄悄改名或丢弃参数。
- 对必填参数、枚举、列表非空、数值范围和互斥参数做最小必要校验，并使用清晰的 `ValueError`/`TypeError`。
- 业务规则校验仍由服务端决定；客户端校验不能替代接口测试中的负向用例。

## 4. 认证和环境

认证信息必须从环境变量、配置文件或 fixture 注入：

```python
def set_auth(self, *, role="{{DEFAULT_ROLE}}", env="{{DEFAULT_ENV}}"):
    token = os.getenv(f"{{AUTH_ENV_PREFIX}}_{role.upper()}_TOKEN")
    if not token:
        raise RuntimeError(f"缺少 {role} 测试凭据")
    self.client.set_header("{{AUTH_HEADER}}", token)
```

强制要求：

- 禁止把 Cookie、Token、密码、API Key 写入代码、文档或提交记录。
- 预置账号由 `{{PRESET_ACCOUNTS}}` 提供；权限测试使用对应角色账号，不通过修改账号状态满足前置。
- 不同环境的认证头、租户标识、Base URL 不同则分别配置，不能跨环境复用隐含状态。
- 认证失败必须保留 401/403 语义，使权限用例能够验证拒绝行为。

## 5. 错误处理和日志

区分网络/系统错误、HTTP 错误和业务错误：

```python
def request(self, method, path, **kwargs):
    self.log_request(method, path, kwargs)
    try:
        response = self.session.request(method, self.base_url + path, **kwargs)
    except {{CONNECTION_ERROR}} as exc:
        logger.error("网络连接失败: %s", exc)
        return {"status_code": 503, "data": None, "headers": {}, "error": "网络错误"}
    except {{TIMEOUT_ERROR}} as exc:
        logger.error("请求超时: %s", exc)
        return {"status_code": 504, "data": None, "headers": {}, "error": "请求超时"}
    return self.parse_response(response)
```

- 请求日志记录 method、相对路径、必要参数和 trace/request id。
- Token、密码、Cookie、文件内容等敏感信息必须脱敏。
- 失败日志保留 HTTP 状态码、业务码、message 和关键响应结构。
- 解析失败不能静默当作空数据；应返回明确错误或直接抛出可定位异常。
- 测试断言失败时输出接口名、请求上下文、实际响应和期望值。

## 6. 超时、重试和幂等

按接口类型配置超时：

| 接口类型 | 建议超时 | 项目配置 |
|---|---:|---|
| 普通查询 | `{{READ_TIMEOUT}}` 秒 | {{READ_TIMEOUT_NOTE}} |
| 普通写入 | `{{WRITE_TIMEOUT}}` 秒 | {{WRITE_TIMEOUT_NOTE}} |
| 文件上传/导出 | `{{UPLOAD_TIMEOUT}}` 秒 | {{UPLOAD_TIMEOUT_NOTE}} |
| 异步任务轮询 | 单次 `{{POLL_TIMEOUT}}` 秒，总时长 `{{POLL_TOTAL_TIMEOUT}}` | {{POLL_TIMEOUT_NOTE}} |

只对明确可重试的瞬态错误重试：

- 可重试：连接重置、超时、明确的 502/503/504；次数和退避上限写入配置。
- 默认不可重试：400、401、403、404、405，以及未知的 4xx。
- POST/PUT/DELETE 只有在接口具备幂等键或服务端明确支持时才允许自动重试。
- 重试必须记录次数和最终响应，不能掩盖服务端持续失败。

## 7. 常见接口形态

封装层至少按项目需要支持：

- 普通 GET/POST/PUT/PATCH/DELETE。
- Query、Path、JSON、Form、Multipart 文件上传。
- 分页查询：明确 page/pageSize、offset/limit、`content`/`items`/`total` 取值路径。
- 异步任务：提交任务、提取 task id、轮询状态、超时和失败状态断言。
- 下载/导出：状态码、Content-Type、文件名、文件内容或最小大小校验。
- 批量操作：显式传递列表，保留部分成功/部分失败信息。

每一种形态都要在 `{{CLIENT_EXAMPLES_REF}}` 中有项目内示例，测试用例需覆盖成功、参数边界、权限和失败路径。

## 8. 资源生命周期

客户端若持有连接、Session、临时文件或异步资源，必须提供显式关闭方式，并与 fixture 生命周期一致：

```python
api = {{API_CLASS}}()
try:
    response = api.{{METHOD}}(...)
finally:
    api.close()
```

也可实现上下文管理器：

```python
with {{API_CLASS}}() as api:
    response = api.{{METHOD}}(...)
```

文件上传、临时目录和异步轮询资源必须在测试失败时同样清理。

## 9. 客户端自检清单

- [ ] Base URL、认证、超时和代理均来自配置或 fixture。
- [ ] 测试代码不拼接完整 URL，不重复构造认证头。
- [ ] 每个方法的参数名和路径与最新接口文档一致。
- [ ] 返回结构统一，业务错误没有被吞掉。
- [ ] 4xx 不被重试；写操作重试具备幂等依据。
- [ ] 敏感信息已脱敏，失败日志足以定位问题。
- [ ] 写操作对应的测试会继续查询验证持久化结果。
- [ ] 客户端和临时资源在 `finally`/`afterEach` 中释放。
