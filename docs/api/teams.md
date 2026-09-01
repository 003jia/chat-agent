# teams 模块接口文档（可视化专家团）

- synced_commit: `3f06b8ba`
- 更新时间: 2026-08-31
- 源码: `server/app.mjs`（L802-886、L1638-1663）、`server/teams.mjs`
- 数据来源: `data/config/teams.json`（主存储）；成员校验依赖 `data/config/roles.json` 的角色清单

## 专家团对象结构（完整字段）

```json
{
  "id": "team-xxxx",
  "name": "未命名专家团",
  "goal": "",
  "enabled": true,
  "leadRoleId": "<roleId>",
  "memberRoleIds": ["<roleId>"],
  "createdAt": "2026-08-31T00:00:00.000Z",
  "updatedAt": "2026-08-31T00:00:00.000Z"
}
```

- `leadRoleId` 不在成员列表时归一化为 `memberRoleIds[0]`，成员为空时为 `null`（`server/teams.mjs`）。
- 响应统一为专家团库：`{ "selectedTeamId": "<teamId|null>", "teams": [ <专家团对象> ] }`。
- `selectedTeamId` 指向不存在的团队时归一化为第一个团队 id 或 `null`。

## GET /api/teams

- 权限：`adminAuth`
- 用途：读取全部专家团
- 响应：专家团库对象

## POST /api/teams

- 权限：`adminAuth` + `writeLimiter`
- 用途：新建专家团；**创建即选中**（`selectedTeamId` 指向新团队）
- 请求参数：

| 字段 | 类型 | 必填 | 枚举/范围 | 说明 | 数据来源 |
|---|---|---|---|---|---|
| name | string | 是 | trim 后非空，截断 ≤80 | 专家团名称 | 请求体 |
| goal | string | 否 | 截断 ≤2000 | 团队目标 | 请求体 |
| enabled | boolean | 否 | 缺省/非 `false` 均为 `true` | 启用状态 | 请求体 |
| memberRoleIds | string[] | 是 | 去重后 ≥1，且每项必须是已存在角色 id | 成员角色列表 | 请求体 + roles.json |
| leadRoleId | string | 是 | 必须 ∈ memberRoleIds | Lead 角色 | 请求体 |

- 错误码：

| code | HTTP | 触发条件 |
|---|---|---|
| VALIDATION_ERROR | 400 | name 为空 / memberRoleIds 过滤后为空（「专家团至少需要加入一个角色。」）/ leadRoleId 不在成员列表（「Lead 必须是已加入专家团的角色。」） |

- 响应：`201` + 专家团库对象

## PUT /api/teams/:teamId

- 权限：`adminAuth` + `writeLimiter`
- 用途：整体更新专家团（校验规则与 POST 完全一致，非部分更新）
- 错误码：`404 TEAM_NOT_FOUND`（「专家团不存在。」）；校验失败同 POST
- 副作用：`selectedTeamId` 保持不变；`updatedAt` 刷新
- 响应：专家团库对象

## PUT /api/teams/:teamId/select

- 权限：`adminAuth` + `writeLimiter`
- 用途：切换当前选中专家团
- 错误码：`404 TEAM_NOT_FOUND`
- 响应：专家团库对象

## DELETE /api/teams/:teamId

- 权限：`adminAuth` + `writeLimiter`
- 用途：删除专家团
- 错误码：`404 TEAM_NOT_FOUND`
- 副作用：删除的是当前选中团队时，`selectedTeamId` 回退为剩余第一个团队 id，无剩余则为 `null`
- 响应：专家团库对象

## 业务规则备注（供用例断言）

1. 成员校验基于**当前角色库**：角色被删除后（`DELETE /api/roles/:roleId` 会重存 teams.json），失效成员 id 会在归一化时被过滤。
2. `id` 由服务端 `createId("team")` 生成，请求体传入的 `id` 不生效。
