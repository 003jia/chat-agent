# Fixture、账号与前置数据模式

> 以下示例使用 pytest fixture。非 Python 项目将其映射为 beforeEach/afterEach、测试上下文、factory 或项目已有的生命周期机制，不要照搬语法而丢失清理责任。

## 1. Fixture 分层

按生命周期选择 fixture：

- `session`：跨多个模块、幂等且只需初始化一次的环境检查。
- `module`：模块级共享客户端或模块前置。
- `function`：单用例临时数据，默认优先，便于隔离和清理。
- `autouse`：只用于所有用例都必须具备且副作用明确的前置，不要隐藏复杂业务操作。

客户端 fixture 示例：

```python
@pytest.fixture
def {{api_fixture}}({{env_fixture}}):
    api = {{API_CLASS}}(base_url={{env_fixture}}.base_url)
    api.set_auth(role="{{ROLE}}")
    try:
        yield api
    finally:
        api.close()
```

## 2. 会话级前置

只有“影响多个测试、可重复执行、失败不应阻塞整个测试集”的前置才使用 session fixture：

```python
@pytest.fixture(scope="session", autouse=True)
def ensure_{{precondition}}():
    target = os.getenv("{{TARGET_ENV_VAR}}", "")
    if not target:
        logger.warning("{{TARGET_ENV_VAR}} 未配置，跳过前置")
        return

    api = {{ADMIN_API_CLASS}}()
    api.set_auth(role="{{ADMIN_ROLE}}")
    try:
        current = api.{{query_method}}(target)
        if {{already_ready_expression}}:
            return
        api.{{prepare_method}}(target)
    except Exception as exc:
        logger.warning("前置准备失败（{{BLOCK_OR_SKIP_POLICY}}）: %s", exc)
    finally:
        api.close()
```

前置必须先查后改，保持幂等；不要在 autouse fixture 中无条件修改共享数据。

## 3. 预置账号规则

在 `{{AUTH_CONFIG_SOURCE}}` 中登记各环境角色：

```text
{{ENV_1}}:
  admin: {{ADMIN_ENV_KEY}}
  authorized: {{AUTHORIZED_ENV_KEY}}
  member: {{MEMBER_ENV_KEY}}
```

- 凭据只保存在环境配置或密钥系统，不写入 skill、用例和报告。
- 权限测试直接使用对应预置账号。
- 不改变预置账号角色、部门、租户、授权和资源归属。
- 账号当前状态不满足测试前置时，优先查询确认；不能安全恢复时 `skip` 并说明原因。

## 4. 临时数据 fixture

```python
@pytest.fixture
def temp_{{resource}}({{api_fixture}}):
    name = f"{{TEST_PREFIX}}_{unique_suffix()}"
    resource_id = None
    try:
        response = {{api_fixture}}.create_{{resource}}(name=name)
        assert response["status_code"] == {{SUCCESS_HTTP_STATUS}}, response
        resource_id = extract_id(response)
        yield {"id": resource_id, "name": name}
    finally:
        if resource_id:
            {{api_fixture}}.delete_{{resource}}(resource_id)
```

如果资源有父子依赖，清理顺序必须是叶子到根；如果修改了存量资源，fixture 必须保存并恢复原始状态。

## 5. 前置失败策略

明确区分：

- 环境不可用、凭据缺失、资源池不足：`skip` 或阻塞，按 `{{BLOCK_OR_SKIP_POLICY}}` 执行。
- 产品行为不符合文档/源码：测试失败并保留断言，必要时提缺陷。
- 测试代码或 fixture 错误：修复后单测、模块回归和重复运行验证。

任何 `except` 都必须记录原因；禁止 `except: pass`。
