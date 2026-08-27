import { describe, expect, it, vi } from "vitest";
import { createCodeAgent, createWorkAgent } from "./workagent.mjs";

describe("createCodeAgent", () => {
  it("把子任务交给底层 run，并返回归一化结果", async () => {
    const run = vi.fn(async () => ({
      summary: "Codex CLI 已完成任务。",
      data: { backend: "codex", sandbox: "read-only", exitCode: 0, durationMs: 12, output: "ok" }
    }));
    const agent = createCodeAgent({ run, defaultBackend: () => "codex" });

    const result = await agent.dispatch({ task: "列出工作区文件" });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toMatchObject({ backend: "codex", task: "列出工作区文件", sandbox: "read-only" });
    expect(result.data.backend).toBe("codex");
  });

  it("后端缺省时使用 defaultBackend", async () => {
    const run = vi.fn(async () => ({ summary: "ok", data: { backend: "dsh", exitCode: 0 } }));
    const agent = createCodeAgent({ run, defaultBackend: () => "dsh" });
    await agent.dispatch({ task: "hi" });
    expect(run.mock.calls[0][0].backend).toBe("dsh");
  });

  it("未获批准时拒绝执行（AGENT_DENIED）", async () => {
    const run = vi.fn();
    const agent = createCodeAgent({
      run,
      requestApproval: vi.fn(async () => false)
    });
    await expect(agent.dispatch({ task: "改一行代码" })).rejects.toMatchObject({ code: "AGENT_DENIED" });
    expect(run).not.toHaveBeenCalled();
  });

  it("批准请求通过时才执行并写审计", async () => {
    const audit = vi.fn();
    const run = vi.fn(async () => ({ summary: "ok", data: { exitCode: 0 } }));
    const agent = createCodeAgent({
      run,
      defaultBackend: () => "dsh",
      requestApproval: vi.fn(async () => true),
      audit
    });
    await agent.dispatch({ task: "hi", conversationId: "c1" });
    expect(run).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "code.dispatched", conversationId: "c1" }));
  });

  it("拒绝空任务描述", async () => {
    const agent = createCodeAgent({ run: vi.fn() });
    await expect(agent.dispatch({ task: "  " })).rejects.toMatchObject({ code: "AGENT_TASK_INVALID" });
  });
});

describe("createWorkAgent", () => {
  it("一次决策即回复时直接返回", async () => {
    const agent = createWorkAgent({
      memory: vi.fn(async () => [{ id: "m1" }]),
      decide: vi.fn(async () => ({ kind: "reply", content: "好的，我先计划。" }))
    });
    const result = await agent.run({ goal: "帮我规划一下" });
    expect(result.status).toBe("done");
    expect(result.reply).toContain("先计划");
    expect(result.memories).toHaveLength(1);
  });

  it("模型提议编码子任务时交给 Code Agent，并回喂结果继续推理", async () => {
    const dispatch = vi.fn(async () => ({
      data: { backend: "codex", exitCode: 0, output: "重构完成" }
    }));
    const codeAgent = { dispatch };
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "code", backend: "codex", task: "给 X 加个接口" })
      .mockResolvedValueOnce({ kind: "reply", content: "已完成，接口已加。" });
    const agent = createWorkAgent({ decide, codeAgent, maxTurns: 4 });

    const result = await agent.run({ goal: "给模块加接口" });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ backend: "codex", task: "给 X 加个接口" });
    expect(decide).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("done");
    expect(result.reply).toContain("已完成");
    // Code Agent 的输出被回喂给下一轮决策
    expect(decide.mock.calls[1][0].transcript.at(-1)).toMatchObject({ role: "code_result", backend: "codex" });
  });

  it("未配置 Code Agent 却要编码时抛 CODE_AGENT_UNAVAILABLE", async () => {
    const agent = createWorkAgent({
      decide: vi.fn(async () => ({ kind: "code", task: "hi" })),
      codeAgent: null
    });
    await expect(agent.run({ goal: "改代码" })).rejects.toMatchObject({ code: "CODE_AGENT_UNAVAILABLE" });
  });

  it("触达最大轮次后以 max_turns 结束", async () => {
    const codeAgent = { dispatch: vi.fn(async () => ({ data: { backend: "dsh", exitCode: 0, output: "o" } })) };
    const decide = vi.fn(async () => ({ kind: "code", task: "继续" }));
    const agent = createWorkAgent({ decide, codeAgent, maxTurns: 2 });
    const result = await agent.run({ goal: "反复编码" });
    expect(result.status).toBe("max_turns");
    expect(decide).toHaveBeenCalledTimes(2);
  });

  it("拒绝空目标", async () => {
    const agent = createWorkAgent({ decide: vi.fn() });
    await expect(agent.run({ goal: " " })).rejects.toMatchObject({ code: "WORK_TASK_INVALID" });
  });
});