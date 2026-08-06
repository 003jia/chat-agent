import { describe, expect, it } from "vitest";
import { completeToolTask, createToolTask, failToolTask } from "./tasks.mjs";

const readTool = {
  id: "memory.search",
  name: "记忆检索",
  description: "检索记忆",
  permission: "read"
};

describe("tool tasks", () => {
  it("creates an auditable running task for a read tool", () => {
    const task = createToolTask({
      objective: "查找项目偏好",
      conversationId: "default",
      toolInput: { query: "项目" }
    }, readTool);

    expect(task.status).toBe("running");
    expect(task.steps[0]).toMatchObject({
      toolId: "memory.search",
      permission: "read",
      status: "running",
      input: { query: "项目" }
    });
  });

  it("records completion and failure without placing output in memory", () => {
    const task = createToolTask({ objective: "搜索", toolInput: { query: "agent" } }, readTool);
    const completed = completeToolTask(task, { summary: "done", data: { count: 1 } });
    const failed = failToolTask(task, { code: "NETWORK_ERROR", message: "offline" });

    expect(completed.status).toBe("completed");
    expect(completed.steps[0].result.summary).toBe("done");
    expect(failed.status).toBe("failed");
    expect(failed.steps[0].error).toEqual({ code: "NETWORK_ERROR", message: "offline" });
  });

  it("gates non-read tools for future approval flows", () => {
    const task = createToolTask({
      objective: "写入文件",
      toolInput: { path: "report.md" }
    }, { ...readTool, id: "file.write", permission: "write" });

    expect(task.status).toBe("waiting_approval");
    expect(task.steps[0].status).toBe("waiting_approval");
  });
});
