/**
 * Agent 运行时层：把整个任务交给本机 CLI（DeepSeek Harness / Codex）headless 执行，
 * 工作台负责事前审批与事后审计。这里抽象了「后端注册 + 通用执行器」，后端可替换。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { apiError } from "./errors.mjs";

export const DSH_DEFAULT_TIMEOUT_MS = 300_000;
export const CODEX_DEFAULT_TIMEOUT_MS = 600_000;
export const RUNNER_MAX_OUTPUT_CHARS = 60_000;
export const NOPX_CACHE_DIR = path.join(os.homedir(), ".npm", "_npx");
export const SANDBOX_MODES = Object.freeze(["read-only", "workspace-write"]);
const MAX_TASK_CHARS = 5000;

export function normalizeSandbox(value, codePrefix = "DSH") {
  const sandbox = String(value || "read-only").trim();
  if (!SANDBOX_MODES.includes(sandbox)) {
    throw apiError(400, `${codePrefix}_SANDBOX_INVALID`, `sandbox 只支持 ${SANDBOX_MODES.join(" 或 ")}。`);
  }
  return sandbox;
}

function scanNpxCache(npxCacheDir, packageSegments) {
  if (!fs.existsSync(npxCacheDir)) return null;
  let entries;
  try {
    entries = fs.readdirSync(npxCacheDir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(npxCacheDir, entry.name, "node_modules", ...packageSegments);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolveDshEntry(env = process.env, options = {}) {
  const npxCacheDir = options.npxCacheDir || NOPX_CACHE_DIR;
  const explicit = String(env.DSH_BIN || "").trim();
  if (explicit) return explicit;
  return scanNpxCache(npxCacheDir, ["@deepseek-ai", "dsh", "lib", "bin.js"]);
}

export function resolveCodexEntry(env = process.env, options = {}) {
  const npxCacheDir = options.npxCacheDir || NOPX_CACHE_DIR;
  const explicit = String(env.CODEX_BIN || "").trim();
  if (explicit) return explicit;
  return scanNpxCache(npxCacheDir, ["@openai", "codex", "bin", "codex.js"]);
}

export const RUNTIMES = {
  dsh: {
    id: "dsh",
    displayName: "DeepSeek Harness",
    codePrefix: "DSH",
    defaultTimeoutMs: DSH_DEFAULT_TIMEOUT_MS,
    resolveEntry: resolveDshEntry,
    buildSpawn: ({ entry, task, workdir, sandbox, env }) => ({
      command: process.execPath,
      args: [entry, "--profile", "headless", task],
      cwd: workdir,
      env: { ...env, DSH_TOOLS_MODE: sandbox }
    })
  },
  codex: {
    id: "codex",
    displayName: "Codex CLI",
    codePrefix: "CODEX",
    defaultTimeoutMs: CODEX_DEFAULT_TIMEOUT_MS,
    resolveEntry: resolveCodexEntry,
    buildSpawn: ({ entry, task, workdir, sandbox, env }) => ({
      command: process.execPath,
      args: [entry, "exec", "--sandbox", sandbox, task],
      cwd: workdir,
      env
    })
  }
};

export function getRuntime(backend) {
  const id = String(backend || "").trim().toLowerCase();
  const runtime = RUNTIMES[id];
  if (!runtime) {
    throw apiError(400, "AGENT_BACKEND_INVALID", `未知的 Agent 底层：${backend}。可选：${Object.keys(RUNTIMES).join(", ")}。`);
  }
  return runtime;
}

export function defaultBackend(env = process.env) {
  const candidate = String(env.AGENT_BACKEND || "dsh").trim().toLowerCase();
  return RUNTIMES[candidate] ? candidate : "dsh";
}

export async function runAgentTask({
  backend = defaultBackend(process.env),
  task,
  sandbox = "read-only",
  workdir,
  timeoutMs,
  env = process.env,
  logger,
  npxCacheDir
}) {
  const runtime = getRuntime(backend);
  const prefix = runtime.codePrefix;
  const normalizedSandbox = normalizeSandbox(sandbox, prefix);
  const entry = runtime.resolveEntry(env, { npxCacheDir });
  if (!entry) {
    throw apiError(503, `${prefix}_NOT_FOUND`, `未找到本机 ${runtime.displayName}。请先安装，或用 ${prefix}_BIN 指定入口。`);
  }
  if (!workdir) {
    throw apiError(400, `${prefix}_WORKDIR_INVALID`, `${runtime.displayName} 任务需要一个明确的工作区目录。`);
  }
  if (typeof task !== "string" || !task.trim() || task.length > MAX_TASK_CHARS) {
    throw apiError(400, `${prefix}_TASK_INVALID`, `任务描述需要是 1 到 ${MAX_TASK_CHARS} 字符的文本。`);
  }

  const limitMs = Math.max(1, Number(timeoutMs) || runtime.defaultTimeoutMs);
  const spec = runtime.buildSpawn({ entry, task, workdir, sandbox: normalizedSandbox, env });
  const startedAt = Date.now();

  const result = await spawnRunner(spec, limitMs, { runtime, logger });

  return {
    summary: summarizeResult(runtime, result.output, result.errorOutput),
    data: {
      backend: runtime.id,
      sandbox: normalizedSandbox,
      workdir,
      entry,
      exitCode: result.exitCode,
      durationMs: Date.now() - startedAt,
      output: result.output,
      errorOutput: result.errorOutput
    }
  };
}

function spawnRunner(spec, timeoutMs, { runtime, logger }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        env: spec.env,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch {
      reject(apiError(500, `${runtime.codePrefix}_SPAWN_ERROR`, `启动 ${runtime.displayName} 失败。`));
      return;
    }

    const chunks = [];
    const errorChunks = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(apiError(504, `${runtime.codePrefix}_TIMEOUT`, `${runtime.displayName} 任务在 ${formatSeconds(timeoutMs)} 秒内未完成，已中止。`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => errorChunks.push(chunk));

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      logger?.warn?.(`${runtime.id} spawn error`, error);
      reject(apiError(500, `${runtime.codePrefix}_SPAWN_ERROR`, `启动 ${runtime.displayName} 失败。`));
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      const output = Buffer.concat(chunks).toString("utf8").trim();
      const errorOutput = Buffer.concat(errorChunks).toString("utf8").trim();
      if (exitCode !== 0) {
        const detail = errorOutput ? ` ${errorOutput.slice(0, 500)}` : "";
        reject(apiError(502, `${runtime.codePrefix}_EXEC_ERROR`, `${runtime.displayName} 退出码 ${exitCode}${detail}`));
        return;
      }
      const truncated = output.length > RUNNER_MAX_OUTPUT_CHARS;
      const bounded = truncated ? `${output.slice(0, RUNNER_MAX_OUTPUT_CHARS)}\n…（输出过长，已截断）` : output;
      resolve({ exitCode, output: bounded, errorOutput });
    });
  });
}

function formatSeconds(ms) {
  return (ms / 1000).toFixed(1).replace(/\.0$/, "");
}

function summarizeResult(runtime, output, errorOutput) {
  const name = runtime.displayName;
  if (output) return `${name} 已完成任务，返回最终答复（${output.length} 字符）。`;
  if (errorOutput) return `${name} 已结束（无标准输出）：${errorOutput.slice(0, 200)}`;
  return `${name} 已完成任务，但未返回文本答复。`;
}

/** 向后兼容 dsh 单后端入口 */
export async function runDshTask(options) {
  return runAgentTask({ ...options, backend: "dsh" });
}