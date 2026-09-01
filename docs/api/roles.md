# roles 模块接口文档（角色预设 + 自定义背景）

- synced_commit: `3f06b8ba`
- 更新时间: 2026-08-31
- 源码: `server/app.mjs`（L794-1043、L1623-1636）、`server/config.mjs`（normalizeRoleStore / defaultAgentConfig）
- 数据来源: `data/config/roles.json`（主存储）、`data/backgrounds/<roleId>.<ext>`（背景图片文件）

## 角色对象结构（完整字段）

```json
{
  "id": "role-xxxx",
  "name": "Memory Agent",
  "roleTitle": "本地研究助理",
  "roleDescription": "…",
  "avatar": "🤖",
  "accentColor": "#6366f1",
  "personalityTone": "温暖克制",
  "greeting": "…",
  "language": "zh",
  "behavior": {
    "proactiveFollowup": true,
    "citeMemory": true,
    "autoSaveNotes": true,
    "strictRetrieval": false
  },
  "temperature": 0.62,
  "builtIn": false,
  "capabilityIds": [],
  "quickPrompts": []
}
```

- 字段缺省时由 `defaultAgentConfig` 补齐（数据来源：`server/config.mjs`）；`quickPrompts` 最多 6 条；`capabilityIds` 只保留已知能力（`capabilities.mjs`）。
- 内置角色 `role-expert-team-author`（专家团架构师）`builtIn: true`、`capabilityIds: ["expert-team-authoring"]`、`behavior.strictRetrieval: true`、`temperature: 0.3`，**不可删除**。
- 设置过背景的角色额外有 `backgroundImage`（URL，带 `?v=` 缓存戳）、`backgroundMime`、`backgroundUpdatedAt`（数据来源：背景文件写入时间）。
- 响应统一为角色库：`{ "selectedRoleId": "<roleId>", "roles": [ <角色对象> ] }`。

## GET /api/roles

- 权限：`adminAuth`
- 用途：读取全部角色预设
- 响应：角色库对象（见上）

## POST /api/roles

- 权限：`adminAuth` + `writeLimiter`
- 用途：新建角色
- 请求参数（body 与 `defaultAgentConfig` 合并，`behavior` 深合并）：

| 字段 | 类型 | 必填 | 约束 | 数据来源 |
|---|---|---|---|---|
| 其余任意角色字段 | object | 否 | 未传字段取默认值 | 请求体 |
| — | — | — | 服务端强制：`builtIn=false`、`capabilityIds=[]`、`id=createId("role")`、忽略背景三字段 | 计算生成 |

- 响应：`201` + 角色库对象

## PUT /api/roles/:roleId

- 权限：`adminAuth` + `writeLimiter`
- 用途：更新角色（浅合并 + `behavior` 深合并）
- 错误码：`404 ROLE_NOT_FOUND` 角色不存在
- 服务端保留字段：`builtIn`、`capabilityIds`、`backgroundImage/Mime/UpdatedAt`、`id`（不受 body 影响）
- 响应：角色库对象

## DELETE /api/roles/:roleId

- 权限：`adminAuth` + `writeLimiter`
- 用途：删除角色（连带删除背景文件，并重存 `teams.json` 以触发失效成员清理）
- 错误码：

| code | HTTP | 触发条件 |
|---|---|---|
| VALIDATION_ERROR | 400 | 仅剩最后一个角色（「至少需要保留一个角色预设。」） |
| ROLE_PROTECTED | 400 | 目标角色 `builtIn: true`（「内置能力角色不能删除。」） |
| ROLE_NOT_FOUND | 404 | 角色不存在 |

- 副作用：被删角色是 `selectedRoleId` 时，选中态回退到剩余第一个角色
- 响应：角色库对象

## PUT /api/roles/:roleId/select

- 权限：`adminAuth` + `writeLimiter`
- 用途：切换当前选中角色
- 错误码：`404 ROLE_NOT_FOUND`
- 响应：角色库对象（`selectedRoleId` 已更新）

## GET /api/roles/:roleId/background

- 权限：**无令牌**（公开读，图片可被 `<img>` 直接加载）
- 用途：读取角色自定义背景图片
- 响应：图片二进制，`Content-Type` 为存储的 MIME；响应头 `Cache-Control: private, max-age=31536000, immutable`
- 错误码：

| code | HTTP | 触发条件 |
|---|---|---|
| ROLE_NOT_FOUND | 404 | 角色不存在 |
| BACKGROUND_NOT_FOUND | 404 | 角色未设置背景，或背景文件已丢失（ENOENT） |

## PUT /api/roles/:roleId/background

- 权限：`adminAuth` + `writeLimiter`
- 请求体：**原始图片二进制**（`express.raw`，上限 8MB），`Content-Type` 必须为枚举之一
- Content-Type 枚举（完整，`BACKGROUND_IMAGE_TYPES`）：`image/jpeg`、`image/png`、`image/webp`
- 校验：magic bytes 与声明格式一致（JPEG `FF D8 FF`、PNG 8 字节签名、WebP `RIFF…WEBP`）
- 错误码：

| code | HTTP | 触发条件 |
|---|---|---|
| ROLE_NOT_FOUND | 404 | 角色不存在 |
| UNSUPPORTED_IMAGE_TYPE | 415 | Content-Type 不在枚举内 / body 非非空 Buffer |
| INVALID_IMAGE | 400 | 图片内容与文件格式不匹配（magic bytes 校验失败） |

- 副作用：先删除旧背景文件再写入；`backgroundImage` 更新为 `/api/roles/<id>/background?v=<ISO 时间>`
- 响应：角色库对象

## DELETE /api/roles/:roleId/background

- 权限：`adminAuth` + `writeLimiter`
- 用途：移除背景（删除三种扩展名文件 + 清除角色对象上的三个背景字段）
- 错误码：`404 ROLE_NOT_FOUND`
- 响应：角色库对象
