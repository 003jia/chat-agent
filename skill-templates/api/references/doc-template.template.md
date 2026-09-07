# {{MODULE_NAME}} 接口文档

**服务**：`{{SERVICE_NAME}}`　　**环境**：{{ENV}}　　**版本**：{{VERSION}}　　**最后更新**：{{DATE}}

**代码库版本**：{{REPO_COMMITS}}

> **适用范围**：{{ENV_SCOPE_NOTE}}

## 接口索引

| # | Method | Path | 说明 | 权限 | 调用方 |
|---:|---|---|---|---|---|
| 1 | `{{METHOD}}` | `{{PATH}}` | {{SUMMARY}} | {{PERMISSION}} | {{CALLER}} |

## 通用响应格式

| 字段 | 类型 | 说明 |
|---|---|---|
| `{{HTTP_OR_BODY_STATUS_FIELD}}` | {{STATUS_TYPE}} | {{STATUS_MEANING}} |
| `{{DATA_FIELD}}` | {{DATA_TYPE}} | {{DATA_MEANING}} |
| `{{MESSAGE_FIELD}}` | {{MESSAGE_TYPE}} | {{MESSAGE_MEANING}} |

## `{{METHOD}} {{PATH}}`

**接口名称**：{{API_NAME}}

**调用方**：{{CALLER_AND_EVIDENCE}}

**鉴权方式**：{{AUTH}}

**请求参数**

| 参数 | 类型 | 必填 | 说明 | 来源 |
|---|---|---|---|---|
| `{{PARAM}}` | `{{TYPE}}` | {{REQUIRED}} | {{DESCRIPTION}} | `{{SOURCE}}` |

**请求体**：`{{REQUEST_TYPE}}`（来源：`{{REQUEST_SOURCE}}`）

| 字段 | 类型 | 必填 | 说明 | 来源 |
|---|---|---|---|---|
| `{{FIELD}}` | `{{TYPE}}` | {{REQUIRED}} | {{DESCRIPTION}} | `{{SOURCE}}` |

**响应 `{{DATA_FIELD}}`**：`{{RESPONSE_TYPE}}`（来源：`{{RESPONSE_SOURCE}}`）

| 字段 | 类型 | 必有 | 说明 | 来源 |
|---|---|---|---|---|
| `{{FIELD}}` | `{{TYPE}}` | {{REQUIRED}} | {{DESCRIPTION}} | `{{SOURCE}}` |

> 嵌套自定义对象必须在此处就近展开完整字段；枚举必须列出全部常量。

**响应示例**

```json
{
  "{{HTTP_OR_BODY_STATUS_FIELD}}": {{SUCCESS_STATUS}},
  "{{DATA_FIELD}}": {{RESPONSE_EXAMPLE}},
  "{{MESSAGE_FIELD}}": null
}
```

**后端逻辑**（来源：`{{SOURCE_FILE}}: {{METHOD_NAME}}`）

1. **鉴权**：{{AUTH_LOGIC}}
2. **权限校验**：{{PERMISSION_LOGIC}}
3. **参数校验**：{{VALIDATION_LOGIC}}
4. **业务处理**：{{BUSINESS_LOGIC}}
5. **状态/分支**：{{STATE_BRANCH}}
6. **外部依赖**：{{DEPENDENCIES}}
7. **返回语义**：{{RETURN_SEMANTICS}}

**边界、幂等与测试点**

{{BOUNDARY_AND_TEST_POINTS}}

**验证来源**：{{VERIFICATION_PROVENANCE}}

---

## 文档质量门禁

- [ ] 所有实际后端接口已收录，废弃/非后端接口有排除依据。
- [ ] 每个接口有 Method、完整 Path、调用方、鉴权、请求和响应。
- [ ] 枚举列出全部常量，自定义类型已展开。
- [ ] 关键字段和行为有源码/实测来源及日期。
- [ ] 后端逻辑包含鉴权、权限、参数、主流程、分支、依赖和返回语义。
- [ ] 边界、幂等、并发、越权和错误码陷阱已标注测试点。
- [ ] 复杂异步/多参与者接口有时序图；简单查询不强行添加重复图。
