# 接口测试模式模板

> 以下示例使用 pytest/Python。迁移到 Vitest、RestAssured 或其他框架时，保留测试分层、断言强度、动态数据和清理顺序，替换装饰器、fixture 和断言语法。

## 单接口测试

```python
@pytest.mark.{{SINGLE_API_MARK}}
@pytest.mark.{{REGRESSION_MARK}}
@pytest.mark.{{MODULE_MARK}}
class Test{{Resource}}API:
    """{{接口/资源说明}}"""

    def test_{{operation}}_success(self, {{api_fixture}}, {{context_fixture}}):
        response = {{api_fixture}}.{{method}}(
            {{required_args}}
        )
        assert response["status_code"] == {{SUCCESS_HTTP_STATUS}}, (
            f"{{METHOD}} {{PATH}} 失败: {response}"
        )
        data = response["data"]
        assert {{business_assertion}}, f"业务字段不符合预期: {data}"

    @pytest.mark.parametrize("{{param_name}}, {{expected}}", [
        ({{valid_boundary_value}}, {{expected_result}}),
        ({{invalid_boundary_value}}, {{expected_result}}),
    ])
    def test_{{operation}}_boundary(
        self, {{api_fixture}}, {{param_name}}, {{expected}}
    ):
        response = {{api_fixture}}.{{method}}({{param_name}}={{param_name}})
        assert {{boundary_assertion}}

    @pytest.mark.{{PERMISSION_MARK}}
    def test_{{operation}}_without_permission(self, {{unauthorized_api_fixture}}):
        response = {{unauthorized_api_fixture}}.{{method}}({{required_args}})
        assert response["status_code"] in {{FORBIDDEN_STATUSES}}, response
        assert {{business_denial_assertion}}, response
```

## 业务流程测试

```python
@pytest.mark.{{BUSINESS_FLOW_MARK}}
@pytest.mark.{{REGRESSION_MARK}}
@pytest.mark.{{MODULE_MARK}}
class Test{{Resource}}Flow:
    def test_flow_{{scenario}}(
        self, {{api_fixture}}, {{dependent_api_fixture}}, {{context_fixture}}
    ):
        {{created_resource}} = None
        {{original_state}} = None
        try:
            # Step 1: 获取动态前置数据
            {{precondition}}

            # Step 2: 创建或准备测试数据
            {{create_operation}}
            {{created_resource}} = {{created_id_expression}}

            # Step 3: 执行核心业务操作
            response = {{core_operation}}
            assert {{success_assertion}}, response

            # Step 4: 查询接口闭环验证
            verify_response = {{query_operation}}
            assert {{persistence_assertion}}, verify_response
        finally:
            # Step 5: 清理/恢复，按资源依赖逆序执行
            {{cleanup_operations}}
```

## 权限验证

权限用例固定采用：

```text
确认角色/权限前置
  → 使用对应账号发起操作
  → 断言 HTTP 状态码和业务拒绝/成功语义
  → finally 恢复授权或清理临时授权
```

不要通过“把断言改成成功或失败均可”来适配不稳定环境。若前置账号状态不可控，应先明确检查并 `skip`，同时记录跳过原因。

## 批量、分页和排序

- 批量操作前确认数据数量，操作后逐项查询验证。
- 分页验证页大小、总数、边界页和空页；不要假设列表固定顺序。
- 排序测试自行构造至少两条有可区分排序字段的数据，升序和降序都验证。
- 批量非原子时，分别断言成功项、失败项和最终资源状态。

## 文件上传、异步和下载

### 文件上传

- 文件在测试运行时临时创建，使用 `{{TEMP_DIR_METHOD}}` 管理生命周期。
- 校验成功响应、持久化结果、文件类型/大小和非法文件失败语义。
- `finally` 中删除临时文件和服务端临时资源。

### 异步任务

```python
submit_response = api.submit_{{task}}(...)
task_id = extract_task_id(submit_response)
deadline = monotonic() + {{POLL_TOTAL_TIMEOUT}}
while monotonic() < deadline:
    status_response = api.get_{{task}}_status(task_id)
    status = extract_status(status_response)
    if status == "{{SUCCESS_STATE}}":
        break
    if status in {{FAILURE_STATES}}:
        pytest.fail(f"异步任务失败: {status_response}")
    sleep({{POLL_INTERVAL}})
else:
    pytest.fail(f"异步任务超时: task_id={task_id}")
```

### 下载/导出

校验 HTTP 状态、Content-Type、文件名和内容最小要求；不要只校验响应不为空。
