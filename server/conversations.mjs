export const seedConversation = {
  id: "default",
  title: "产品策略讨论",
  roleId: "role-default",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  messages: [
    {
      id: "seed-assistant-1",
      role: "assistant",
      content: "我会先按你的长期偏好做一个保守版本：先确认约束，再给出可执行方案。当前记忆显示你更关注结构清晰、可验证结果和本地文件可追溯。",
      timestamp: new Date().toISOString(),
      memoryRefs: ["project-workflow", "verification-habit"],
      candidateMemoryIds: []
    },
    {
      id: "seed-user-1",
      role: "user",
      content: "这次帮我判断一下智能体该不该自动写入 memory.md，别把临时想法也存进去。",
      timestamp: new Date().toISOString(),
      memoryRefs: [],
      candidateMemoryIds: []
    },
    {
      id: "seed-assistant-2",
      role: "assistant",
      content: "建议采用候选区审核：稳定事实、长期偏好、项目固定约束可以写入；临时判断、一次性任务、未经确认的猜测只进入本轮上下文。右侧我已经标出 2 条候选记忆，其中 1 条需要你确认。",
      timestamp: new Date().toISOString(),
      memoryRefs: ["api-key-handling"],
      candidateMemoryIds: ["candidate-1"]
    }
  ]
};

export function createSeedConversation(conversationId = "default", roleId = "role-default") {
  const now = new Date().toISOString();
  return {
    ...seedConversation,
    id: conversationId,
    title: conversationId === "default" ? seedConversation.title : "新对话",
    roleId,
    createdAt: now,
    updatedAt: now,
    messages:
      conversationId === "default"
        ? seedConversation.messages.map((message) => ({
            ...message,
            timestamp: now,
            memoryRefs: [...message.memoryRefs],
            candidateMemoryIds: [...message.candidateMemoryIds]
          }))
        : []
  };
}
