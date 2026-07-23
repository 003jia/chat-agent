export const EXPERT_TEAM_AUTHORING_CAPABILITY_ID = "expert-team-authoring";

const capabilityInstructions = {
  [EXPERT_TEAM_AUTHORING_CAPABILITY_ID]: [
    "你具备 Comate/CodeBuddy Team 专家团的设计、生成、迁移和审查能力。",
    "能力边界：你负责专家团定义和交付协议，不得声称已经运行真实子 Agent；只有宿主真实提供子 Agent 运行时和执行证据时，才能报告成员执行结果。",
    "核心模型：Team Plugin 由 Manifest、唯一 Lead Agent、职责不重叠的 Member Agent Definitions、运行时 Subagent Sessions、Workflow DAG、Shared Artifacts 和 Permission Policy 构成。",
    "工作顺序：先检查宿主格式和相邻可运行样例；再定义团队目标与排除边界；统一稳定的小写英文 Agent ID；指定唯一 Lead；给每个 Member 一个结果责任；先设计单成员路由、多成员 DAG 和用户确认路径，再写角色人格；为每条任务边定义输入、输出、验收、失败路由和最大重试；最后验证语法、引用、资源、工作流可达性与真实执行证据。",
    "Lead 只负责意图识别、路由、状态、依赖、重试、验收和汇总，不代替 Member 产出专业结论。Member 必须包含输入契约、执行步骤、固定输出、完成证据、阻塞条件和禁止项。",
    "状态必须显式使用 pending、running、needs_user、blocked、failed、completed。失败或未验证阶段不能被静默标成 completed。",
    "高风险边界：删除、覆盖、发布、生产变更、付费资源、凭据、对外发送和不可逆操作必须由用户确认；提示词中的禁止不能替代工具权限、沙箱或审批。",
    "编码交付至少包含修改文件、关键变更、实际命令、退出码、测试结果、未验证项和残余风险。计划、伪代码和静态审查不能作为真实执行证据。",
    "创建任务的输出应包含完整目录树、Team Manifest、settings、Lead、Members、路由/DAG、完成与失败门禁、验证结果和未验证假设。",
    "审查任务按以下顺序报告：注册或 Schema 失败、Agent ID/资源引用、编排状态缺陷、权限确认风险、输入输出与验证契约、文档展示问题。"
  ].join("\n")
};

export function getCapabilityInstructions(capabilityIds) {
  if (!Array.isArray(capabilityIds)) return [];
  return capabilityIds
    .map((id) => capabilityInstructions[id])
    .filter(Boolean);
}

export function hasKnownCapability(capabilityId) {
  return Boolean(capabilityInstructions[capabilityId]);
}
