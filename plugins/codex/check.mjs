#!/usr/bin/env node
/**
 * Codex 插件自检：逐项检查「工作台 → 桥接 → Codex」链路，输出修复提示。
 * 用法：npm run codex:check
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(PLUGIN_DIR, "..", "..");
const MODELS_PATH = join(PROJECT_ROOT, "data", "config", "models.json");
const SERVER_CONFIG_PATH = join(PROJECT_ROOT, "server", "config.mjs");
const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), ".codex");
const BRIDGE_PORT = Number(process.env.CODEX_BRIDGE_PORT || 8899);

const results = [];

function record(ok, label, detail) {
  results.push({ ok, label, detail });
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  console.log("=== Codex 插件自检 ===\n");

  // 1. 本机 Codex
  const binaryCandidates = [
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    "/usr/local/bin/codex",
    "/opt/homebrew/bin/codex",
    join(homedir(), ".local/bin/codex")
  ];
  const binary = binaryCandidates.find(existsSync);
  record(Boolean(binary), "本机 Codex CLI", binary ? binary : "未找到，请确认已安装 ChatGPT 桌面版或 Codex CLI");
  const authPath = join(CODEX_HOME, "auth.json");
  record(existsSync(authPath), "Codex 登录态", existsSync(authPath) ? "~/.codex/auth.json 存在" : "~/.codex/auth.json 缺失，请先登录 Codex");

  // 2. 服务端代码包含 codex 供应商
  const serverConfig = existsSync(SERVER_CONFIG_PATH) ? readFileSync(SERVER_CONFIG_PATH, "utf8") : "";
  const codexInServer = serverConfig.includes('id: "codex"');
  record(codexInServer, "服务端已内置 codex 供应商", codexInServer
    ? "server/config.mjs 已包含（无需重启即可生效）"
    : "server/config.mjs 缺少 codex，请确认代码是最新的");

  // 3. models.json 已注册
  const models = readJsonSafe(MODELS_PATH);
  const codexProvider = models?.providers?.codex;
  record(Boolean(codexProvider), "models.json 已注册 codex 供应商", codexProvider
    ? `${codexProvider.label} → ${codexProvider.baseURL}（模型 ${codexProvider.model}）`
    : "缺少 codex 供应商，请运行：npm run codex:install");

  // 4. 桥接服务是否在运行
  let bridgeAlive = false;
  let bridgeInfo = null;
  try {
    const response = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/health`);
    bridgeAlive = response.ok;
    bridgeInfo = await response.json();
  } catch {
    bridgeAlive = false;
  }
  record(bridgeAlive, `桥接服务 http://127.0.0.1:${BRIDGE_PORT}`, bridgeAlive
    ? `默认模型 ${bridgeInfo?.defaultModel || "?"}`
    : "未运行，请执行：npm run codex:bridge（或在终端里跑 npm run codex:dev）");

  // 5. 通过桥接调一次模型（可选真实调用）
  if (bridgeAlive) {
    try {
      const response = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: bridgeInfo?.defaultModel || "gpt-5.6-sol",
          messages: [{ role: "user", content: "只回复两个字：正常" }]
        })
      });
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      record(Boolean(content), "Codex 真实调用", content ? `模型回复：${content}` : "调用失败，见上方错误");
    } catch (error) {
      record(false, "Codex 真实调用", error.message);
    }
  }

  // 6. 工作台服务是否在运行
  let serverAlive = false;
  try {
    const response = await fetch(`http://127.0.0.1:8787/api/model-config`, {
      headers: { "X-Admin-Token": process.env.MEMORY_AGENT_ADMIN_TOKEN || "" }
    });
    serverAlive = response.status !== 502 && response.status !== 404;
  } catch {
    serverAlive = false;
  }
  record(serverAlive, "工作台后端 http://127.0.0.1:8787", serverAlive
    ? "正在运行"
    : "未运行，请执行：npm run codex:dev");

  console.log("\n=== 结论 ===");
  const failed = results.filter((item) => !item.ok);
  if (!failed.length) {
    console.log("链路全部正常：打开 http://127.0.0.1:5173 ，在聊天输入框下方的模型切换器里选择 “Codex GPT-5.6 · gpt-5.6-sol” 即可。");
  } else {
    console.log(`有 ${failed.length} 项未通过，按上面 ❌ 的提示修复后重跑 npm run codex:check。`);
    console.log("最常见原因：工作台是修改前启动的旧进程 —— 停掉后重新执行 npm run codex:dev（旧进程不会加载新配置）。");
  }
}

main().catch((error) => {
  console.error("自检脚本异常：", error);
  process.exitCode = 1;
});
