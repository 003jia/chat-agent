import { createId } from "./ids.mjs";

const taskStatuses = new Set(["waiting_approval", "running", "completed", "failed", "cancelled"]);
const stepStatuses = new Set(["waiting_approval", "running", "completed", "failed", "cancelled"]);

export function createToolTask(input, tool) {
  const now = new Date().toISOString();
  const objective = String(input?.objective || "").trim().slice(0, 2000);
  const waitingApproval = tool.permission !== "read" && !input?.approved;
  return normalizeTask({
    id: createId("task"),
    title: objective.slice(0, 80) || tool.name,
    objective: objective || tool.description,
    conversationId: String(input?.conversationId || "default"),
    roleId: input?.roleId ? String(input.roleId) : undefined,
    status: waitingApproval ? "waiting_approval" : "running",
    createdAt: now,
    updatedAt: now,
    steps: [{
      id: createId("step"),
      toolId: tool.id,
      title: tool.name,
      permission: tool.permission,
      status: waitingApproval ? "waiting_approval" : "running",
      input: input?.toolInput || {},
      startedAt: waitingApproval ? undefined : now
    }]
  });
}

export function completeToolTask(task, result, now = new Date().toISOString()) {
  return normalizeTask({
    ...task,
    status: "completed",
    updatedAt: now,
    steps: task.steps.map((step, index) => index === task.steps.length - 1
      ? { ...step, status: "completed", result, completedAt: now }
      : step)
  });
}

export function approveToolTask(task, now = new Date().toISOString()) {
  if (task?.status !== "waiting_approval") return null;
  return normalizeTask({
    ...task,
    status: "running",
    updatedAt: now,
    steps: task.steps.map((step, index) => index === task.steps.length - 1
      ? { ...step, status: "running", startedAt: now }
      : step)
  });
}

export function cancelToolTask(task, now = new Date().toISOString()) {
  if (task?.status !== "waiting_approval") return null;
  return normalizeTask({
    ...task,
    status: "cancelled",
    updatedAt: now,
    steps: task.steps.map((step, index) => index === task.steps.length - 1
      ? { ...step, status: "cancelled", completedAt: now }
      : step)
  });
}

export function failToolTask(task, error, now = new Date().toISOString()) {
  const failure = {
    code: String(error?.code || "TOOL_EXECUTION_ERROR"),
    message: String(error?.message || "工具执行失败。").slice(0, 1000)
  };
  return normalizeTask({
    ...task,
    status: "failed",
    updatedAt: now,
    steps: task.steps.map((step, index) => index === task.steps.length - 1
      ? { ...step, status: "failed", error: failure, completedAt: now }
      : step)
  });
}

export function normalizeTask(task) {
  const now = new Date().toISOString();
  const steps = Array.isArray(task?.steps)
    ? task.steps.map((step) => ({
        id: String(step?.id || createId("step")),
        toolId: String(step?.toolId || ""),
        title: String(step?.title || step?.toolId || "Tool").slice(0, 120),
        permission: ["read", "write", "external"].includes(step?.permission) ? step.permission : "read",
        status: stepStatuses.has(step?.status) ? step.status : "failed",
        input: normalizeSerializable(step?.input),
        result: step?.result ? normalizeSerializable(step.result) : undefined,
        error: step?.error ? {
          code: String(step.error.code || "TOOL_EXECUTION_ERROR"),
          message: String(step.error.message || "工具执行失败。").slice(0, 1000)
        } : undefined,
        startedAt: step?.startedAt,
        completedAt: step?.completedAt
      }))
    : [];
  return {
    id: String(task?.id || createId("task")),
    title: String(task?.title || task?.objective || "Task").slice(0, 80),
    objective: String(task?.objective || "").slice(0, 2000),
    conversationId: String(task?.conversationId || "default"),
    roleId: task?.roleId ? String(task.roleId) : undefined,
    status: taskStatuses.has(task?.status) ? task.status : "failed",
    createdAt: task?.createdAt || now,
    updatedAt: task?.updatedAt || now,
    steps
  };
}

export function summarizeTask(task) {
  const normalized = normalizeTask(task);
  return {
    id: normalized.id,
    title: normalized.title,
    objective: normalized.objective,
    conversationId: normalized.conversationId,
    roleId: normalized.roleId,
    status: normalized.status,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    steps: normalized.steps
  };
}

function normalizeSerializable(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}
