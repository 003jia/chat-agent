/**
 * Work/Code 双 Agent 编排层。
 *
 * 在现有外壳之上封装两层 agent：
 *  - CodeAgent：底层任务级黑盒执行器，封装 runtimes 的校验 / 审批门 / 执行 / 审计；
 *  - WorkAgent：顶层编排器，负责拉取记忆与上下文、驱动模型决策，
 *    当模型决定产出编码子任务时，把子任务交给 CodeAgent 派发并把结果回喂继续推理。
 *
 * 本模块只依赖注入的能力（不直接依赖模型供应商或 dsh/codex），
 * 以便在工作台里用真实依赖注入，在测试里用假实现替换。
 */
import { apiError } from "./errors.mjs";

export function createCodeAgent({ run, defaultBackend, requestApproval, audit }) {
  const resolveBackend = defaultBackend || (() => "dsh");

  async function dispatch({ backend, task, sandbox = "read-only", conversationId } = {}) {
    const target = backend || resolveBackend();
    if (!task || !String(task).trim()) {
      throw apiError(400, "AGENT_TASK_INVALID", "交给 Code Agent 的任务描述不能为空。");
    }
    if (requestApproval) {
      const admitted = await requestApproval({ backend: target, task, sandbox, conversationId });
      if (!admitted) throw apiError(403, "AGENT_DENIED", "Code Agent 子任务未获批准，已拒绝执行。");
    }
    const result = await run({ backend: target, task, sandbox, conversationId });
    audit?.({ action: "code.dispatched", backend: target, sandbox, conversationId, durationMs: result.data?.durationMs });
    return result;
  }

  return { dispatch };
}

export function createWorkAgent({
  memory,
  decide,
  codeAgent,
  maxTurns = 4,
  logger
}) {
  async function run({ goal, transcript = [] }) {
    if (!goal || !String(goal).trim()) {
      throw apiError(400, "WORK_TASK_INVALID", "Work Agent 需要一个明确的目标。");
    }
    const memories = memory ? await memory(goal, transcript) : [];
    let turns = 0;
    const trace = [];

    while (true) {
      turns += 1;
      const decision = await decide({ goal, transcript, memories, turn: turns });
      trace.push({ turn: turns, kind: decision.kind });

      if (decision.kind === "reply") {
        transcript = [...transcript, { role: "assistant", content: decision.content }];
        return {
          status: "done",
          reply: decision.content,
          turns,
          transcript,
          memories
        };
      }

      if (decision.kind !== "code") {
        throw apiError(400, "WORK_DECISION_INVALID", `模型决策类型不受支持：${decision.kind}。`);
      }

      if (!codeAgent) {
        throw apiError(502, "CODE_AGENT_UNAVAILABLE", "Work Agent 需要编码子任务，但未配置 Code Agent。");
      }
      const result = await codeAgent.dispatch({
        backend: decision.backend,
        task: decision.task,
        sandbox: decision.sandbox,
        goal
      });
      trace[trace.length - 1].dispatchResult = {
        backend: result.data?.backend,
        exitCode: result.data?.exitCode,
        durationMs: result.data?.durationMs
      };
      transcript = [
        ...transcript,
        { role: "code_result", task: decision.task, backend: result.data?.backend, output: result.data?.output }
      ];

      if (turns >= maxTurns) {
        logger?.warn?.(`Work Agent 触达最大轮次 ${maxTurns} 后结束。`);
        return {
          status: "max_turns",
          reply: "(Work Agent 已达到最大执行轮次，未产出最终答复。)",
          turns,
          transcript,
          memories
        };
      }
    }
  }

  return { run };
}