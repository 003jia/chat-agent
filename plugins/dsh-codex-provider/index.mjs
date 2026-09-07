/**
 * dsh-codex-provider 入口（Cordis 插件）。
 *
 * 两件事：
 *   1. 桥接生命周期：DSH 启动时自动拉起 codex-bridge（供 llm-pi-ai 的 codex 聊天路由），
 *      退出时清理；已有桥接则复用。子进程带 CODEX_BRIDGE_PARENT_PID 防孤儿。
 *   2. 注册 `codex` 工具：让 DSH agent 把编码子任务委托给本机 Codex（GPT-5.6，登录态）。
 *      Codex 作为完整 agent 运行（有自己的文件/shell 工具），返回最终答复 + 改动文件。
 *      read_only 默认 true（只分析）；false 时以 workspace-write 实际改文件，并经 DSH 审批。
 *
 * 注意：不 import 任何 @deepseek-ai/* 包（插件以 symlink 装在 profile 里，裸 import 解析不到
 * profile node_modules），工具对象按 ctx.tools.register 接受的原始形态手写。
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 8899;
const REASONING_MAP = {
  off: null, minimal: "low", low: "low", medium: "medium",
  high: "high", xhigh: "xhigh", max: "max"
};

// ---------- 共用：探测 Codex ----------

function detectCodexBinary(configured) {
  if (configured) return configured;
  for (const candidate of [
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    "/usr/local/bin/codex",
    "/opt/homebrew/bin/codex",
    join(homedir(), ".local/bin/codex")
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return "codex";
}

function readDefaultModel() {
  try {
    const configPath = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "config.toml");
    if (!existsSync(configPath)) return "";
    const match = readFileSync(configPath, "utf8").match(/^model\s*=\s*"([^"]+)"/m);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

// ---------- 桥接生命周期 ----------

function ensureCredential() {
  const dshHome = process.env.DSH_HOME || join(homedir(), ".dsh");
  const credentialsPath = join(dshHome, ".credentials.yaml");
  try {
    if (existsSync(credentialsPath) && readFileSync(credentialsPath, "utf8").includes("CODEX_LOCAL_KEY")) {
      return { ok: true, changed: false };
    }
    if (existsSync(credentialsPath)) copyFileSync(credentialsPath, `${credentialsPath}.bak`);
    const existing = existsSync(credentialsPath) ? readFileSync(credentialsPath, "utf8") : "";
    const next = existing.endsWith("\n") || existing === "" ? existing : `${existing}\n`;
    writeFileSync(credentialsPath, `${next}CODEX_LOCAL_KEY: codex-local\n`, "utf8");
    console.log("[dsh-codex-provider] 已写入占位凭据 CODEX_LOCAL_KEY");
    return { ok: true, changed: true };
  } catch (error) {
    console.error(`[dsh-codex-provider] 无法写入凭据 ${credentialsPath}: ${error.message}`);
    return { ok: false };
  }
}

async function startBridge(ctx, baseURL, port, config) {
  const health = () =>
    fetch(`${baseURL}/health`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok).catch(() => false);
  try {
    if (await health()) {
      ctx.logger?.info?.("[dsh-codex-provider] 检测到已有 Codex 桥接 %s，直接复用", baseURL);
      return { managed: false };
    }
  } catch {
    /* 探测失败 → 尝试拉起 */
  }

  // 后端选择：config.backend 显式指定（oauth|exec），默认 auto：
  // 存在 OAuth 凭据（~/.pi-ai/auth.json）→ oauth（token 级、支持工具调用）；
  // 否则 → exec（codex exec 任务级）。
  const credentialPath = config.credentialPath || join(homedir(), ".pi-ai", "auth.json");
  const proxy = config.proxy || "http://127.0.0.1:7897";
  let backendFile = "bridge.mjs";
  const extraEnv = {};
  if (config.backend !== "exec") {
    const hasCredential = existsSync(credentialPath);
    if (config.backend === "oauth" || hasCredential) {
      backendFile = "oauth-bridge.mjs";
      extraEnv.CODEX_BRIDGE_CREDENTIAL = credentialPath;
      extraEnv.CODEX_BRIDGE_PROXY = proxy;
      extraEnv.HTTPS_PROXY = proxy;
      extraEnv.HTTP_PROXY = proxy;
      extraEnv.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ""} --use-env-proxy`.trim();
    }
  }
  ctx.logger?.info?.("[dsh-codex-provider] 拉起桥接 %s（backend=%s）", backendFile, backendFile === "oauth-bridge.mjs" ? "oauth" : "exec");

  const bridgePath = fileURLToPath(new URL(`./${backendFile}`, import.meta.url));
  const child = spawn(process.execPath, [bridgePath], {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, ...extraEnv, CODEX_BRIDGE_PARENT_PID: String(process.pid), CODEX_BRIDGE_PORT: String(port) }
  });
  const handle = { managed: true, exited: false, child };
  child.on("exit", (code, signal) => {
    handle.exited = true;
    ctx.logger?.warn?.("[dsh-codex-provider] Codex 桥接退出 (code=%s signal=%s)", code ?? "-", signal ?? "-");
  });
  child.on("error", (error) => {
    handle.exited = true;
    ctx.logger?.error?.("[dsh-codex-provider] 无法启动 Codex 桥接: %s", error.message);
  });
  ctx.logger?.info?.("[dsh-codex-provider] 已启动 Codex 桥接 (pid %d, %s)", child.pid, baseURL);
  return handle;
}

// ---------- codex 工具：任务执行 ----------

/**
 * 运行一次 codex exec（原始 agent 模式），收集 agent_message / file_change / command_execution。
 * @returns {Promise<{ok:boolean, text:string, filesChanged:Array, commands:number, error?:string}>}
 */
function runCodexTask({ binary, model, cwd, task, reasoning, readOnly, signal, timeoutMs }) {
  return new Promise((resolve) => {
    const sandbox = readOnly ? "read-only" : "workspace-write";
    const args = ["exec", "--json", "--ephemeral", "--skip-git-repo-check", "-s", sandbox, "-m", model, "-C", cwd];
    if (reasoning) args.push("-c", `model_reasoning_effort="${reasoning}"`);
    args.push(task);

    let stdoutBuffer = "";
    let stderrTail = "";
    let settled = false;
    const events = [];
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, text: "", filesChanged: [], commands: 0, error: `Codex 任务超过 ${timeoutMs / 1000}s，已终止` });
    }, timeoutMs);

    const onAbort = () => {
      child.kill("SIGKILL");
      finish({ ok: false, text: "", filesChanged: [], commands: 0, error: "已取消" });
    };
    if (signal) {
      if (signal.aborted) {
        finish({ ok: false, text: "", filesChanged: [], commands: 0, error: "已取消" });
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk;
      let nl;
      while ((nl = stdoutBuffer.indexOf("\n")) !== -1) {
        const line = stdoutBuffer.slice(0, nl).trim();
        stdoutBuffer = stdoutBuffer.slice(nl + 1);
        if (!line) continue;
        try { events.push(JSON.parse(line)); } catch { /* 忽略非 JSON */ }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderrTail = (stderrTail + chunk).slice(-2048); });
    child.on("error", (error) => finish({ ok: false, text: "", filesChanged: [], commands: 0, error: `无法启动 Codex：${error.message}` }));
    child.on("close", (code) => {
      const messages = [];
      const files = new Map();
      let commands = 0;
      for (const event of events) {
        const item = event?.item;
        if (event?.type !== "item.completed" || typeof item?.type !== "string") continue;
        if (item.type === "agent_message" && typeof item.text === "string") messages.push(item.text);
        else if (item.type === "file_change" && Array.isArray(item.changes)) {
          for (const change of item.changes) {
            if (change?.path) files.set(change.path, change.kind || "change");
          }
        } else if (item.type === "command_execution") {
          commands += 1;
        }
      }
      const text = messages.join("\n").trim();
      const filesChanged = [...files.entries()].map(([path, kind]) => ({ path, kind }));
      if (code === 0) {
        finish({ ok: true, text, filesChanged, commands });
      } else {
        const detail = stderrTail.trim() || `退出码 ${code}`;
        finish({ ok: false, text, filesChanged, commands, error: detail.slice(-500) });
      }
    });
  });
}

// ---------- codex 工具：注册（手写工具对象，不依赖 defineTool） ----------

function registerCodexTool(ctx, config) {
  const binary = detectCodexBinary(config.codexBinary);
  const defaultModel = config.model || readDefaultModel() || "gpt-5.6-sol";
  const defaultWorkdir = config.workdir || process.env.DSH_CWD || process.cwd();
  const toolTimeoutMs = config.toolTimeoutMs ?? 600000;
  // 写模式审批开关：默认开（web 里弹审批）；设 toolRequireApproval=false 直接写（谨慎）
  const requireApproval = config.toolRequireApproval !== false;

  ctx.tools.register({
    name: "codex",
    description:
      "Delegate a coding/reasoning subtask to your local Codex (GPT-5.6 via your ChatGPT login). Codex runs as a full agent with its own file and shell tools and returns its final answer plus the files it changed. Use this for heavy lifting the current model shouldn't do inline (implement a feature, refactor, debug, write tests). read_only defaults to true (analyze only, no file changes); set read_only to false when Codex should actually edit files in the workspace (the user is asked to approve).",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The self-contained subtask for Codex. State the goal, relevant files/paths, and constraints. Codex works autonomously and returns its result."
        },
        read_only: {
          type: "boolean",
          description: "true (default): Codex analyzes without modifying files. false: Codex may create/edit/delete files inside the working directory (requires user approval)."
        },
        reasoning_effort: {
          type: "string",
          enum: ["low", "medium", "high", "xhigh", "max"],
          description: "Reasoning depth for Codex. Default low; use high/max for hard problems."
        },
        model: { type: "string", description: `Codex model id (default ${defaultModel}).` },
        cwd: { type: "string", description: `Working directory for Codex (default the workspace root).` }
      },
      required: ["task"]
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          model: { type: "string" },
          read_only: { type: "boolean" },
          files_changed: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { path: { type: "string" }, kind: { type: "string" } }
            }
          },
          commands_run: { type: "integer" },
          status: { type: "string" }
        },
        required: ["summary", "model", "read_only", "files_changed", "status"]
      },
      render: (_args, value) => {
        const lines = [`[Codex · ${value.model} · ${value.read_only ? "read-only" : "write"} · ${value.status}]`];
        if (value.summary) lines.push(value.summary);
        if (Array.isArray(value.files_changed) && value.files_changed.length) {
          lines.push(`Files changed: ${value.files_changed.map((f) => `${f.path} (${f.kind})`).join(", ")}`);
        }
        if (value.commands_run) lines.push(`Commands run by Codex: ${value.commands_run}`);
        return [{ type: "text", text: lines.join("\n") }];
      }
    },
    timeoutMs: toolTimeoutMs,
    async execute(args, exec) {
      if (typeof args?.task !== "string" || args.task.trim() === "") {
        throw new Error("codex: task is required and must be a non-empty string");
      }
      const readOnly = args.read_only !== false;
      const model = args.model || defaultModel;
      const cwd = args.cwd || defaultWorkdir;
      const reasoning = args.reasoning_effort ? REASONING_MAP[args.reasoning_effort] ?? null : null;

      // 写模式：经 DSH 审批（与 bash 工具一致）；headless 无审批通道时安全拒绝
      if (!readOnly && requireApproval) {
        const approval = ctx.get("approval");
        if (approval && exec.agent) {
          let outcome;
          try {
            outcome = await approval.request({
              agent: exec.agent,
              toolName: "codex",
              callId: exec.callId,
              reason: `Codex 将以 workspace-write 模式运行，可能在工作目录 ${cwd} 内增删改文件`,
              signal: exec.signal
            });
          } catch (error) {
            return { summary: `[审批不可用：${error.message}]`, model, read_only: false, files_changed: [], commands_run: 0, status: "denied" };
          }
          if (outcome !== "allowed-once") {
            return { summary: "[用户未批准 Codex 写入，已取消]", model, read_only: false, files_changed: [], commands_run: 0, status: "denied" };
          }
        }
      }

      const result = await runCodexTask({ binary, model, cwd, task: args.task, reasoning, readOnly, signal: exec.signal, timeoutMs: toolTimeoutMs });
      return {
        summary: result.ok
          ? (result.text || "(Codex 未返回文本；检查 Files changed)")
          : `Codex 执行失败：${result.error || "未知错误"}${result.text ? `\n${result.text}` : ""}`,
        model,
        read_only: readOnly,
        files_changed: result.filesChanged,
        commands_run: result.commands,
        status: result.ok ? "completed" : "failed"
      };
    },
    presentCall: (args) => ({
      card: "generic",
      title: `Codex${args.read_only === false ? " (write)" : ""}: ${String(args.task).slice(0, 80)}`,
      kind: "execute"
    })
  });

  ctx.systemPrompt?.section?.({
    name: "tool:codex",
    order: 106,
    text: "The `codex` tool delegates a subtask to your local Codex (GPT-5.6). Codex is a full agent with its own file and shell tools, so give it a self-contained task and read its returned summary + files_changed. Prefer read_only:true for analysis; use read_only:false (which asks the user) only when files actually need to change."
  });
}

// ---------- 插件 ----------

const plugin = {
  name: "dsh-codex-provider",
  inject: ["tools", "systemPrompt"],
  apply(ctx, config = {}) {
    const port = Number(config?.port || process.env.CODEX_BRIDGE_PORT || DEFAULT_PORT);
    const baseURL = `http://127.0.0.1:${port}`;

    // 桥接生命周期
    ctx.effect(() => {
      let handle = null;
      let disposed = false;
      const stop = (target) => {
        if (target && target.managed && !target.exited) {
          ctx.logger?.info?.("[dsh-codex-provider] 停止 Codex 桥接 (pid %d)", target.child.pid);
          target.child.kill("SIGTERM");
        }
      };
      ensureCredential();
      startBridge(ctx, baseURL, port, config).then((started) => {
        handle = started;
        if (disposed) stop(handle);
      });
      return () => {
        disposed = true;
        stop(handle);
      };
    }, "dsh-codex-provider/bridge");

    // codex 工具
    registerCodexTool(ctx, config);
  }
};

export default plugin;
