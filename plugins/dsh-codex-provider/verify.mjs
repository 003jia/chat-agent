#!/usr/bin/env node
/**
 * dsh-codex-provider 验证：逐项检查「DSH 配置 → 桥接 → Codex」链路，
 * 并以 gpt-5.6-sol + max 做一次真实调用。
 * 用法：node verify.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DSH_HOME = process.env.DSH_HOME || join(homedir(), ".dsh");
const PORT = process.env.CODEX_BRIDGE_PORT || "8899";
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
function record(ok, label, detail) {
  results.push(ok);
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("=== dsh-codex-provider 验证 ===\n");

  // 1. Codex 二进制与登录态
  const binaryCandidates = [
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    "/usr/local/bin/codex",
    "/opt/homebrew/bin/codex",
    join(homedir(), ".local/bin/codex")
  ];
  const binary = binaryCandidates.find(existsSync);
  record(Boolean(binary), "本机 Codex CLI", binary || "未找到（安装 ChatGPT 桌面版或 Codex CLI）");
  record(existsSync(join(process.env.CODEX_HOME || join(homedir(), ".codex"), "auth.json")), "Codex 登录态", "~/.codex/auth.json");

  // 2. 凭据
  const credPath = join(DSH_HOME, ".credentials.yaml");
  const credOk = existsSync(credPath) && readFileSync(credPath, "utf8").includes("CODEX_LOCAL_KEY");
  record(credOk, "占位凭据 CODEX_LOCAL_KEY", credOk ? credPath : "缺失，重装插件或手动添加");

  // 3. 配置里能找到 codex provider（settings 或 bundle patch 至少一处）
  const settingsPath = join(DSH_HOME, "settings.yaml");
  const settingsHasCodex = existsSync(settingsPath) && /^    codex:/m.test(readFileSync(settingsPath, "utf8"));
  const patchPath = new URL("./cordis.patch.yml", import.meta.url);
  const patchHasCodex = existsSync(patchPath) && /codex:/.test(readFileSync(patchPath, "utf8"));
  record(settingsHasCodex || patchHasCodex, "codex provider 已注册", settingsHasCodex ? "settings.yaml" : "bundle patch");

  // 4. 桥接健康
  let health = null;
  try {
    const response = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
    health = response.ok ? await response.json() : null;
  } catch {
    health = null;
  }
  record(Boolean(health), `桥接服务 ${BASE}`, health
    ? `默认模型 ${health.defaultModel}`
    : "未运行（插件入口会在 DSH 启动时自动拉起；手动：node bridge.mjs）");

  // 5. 真实调用 gpt-5.6-sol + max
  if (health) {
    try {
      const response = await fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.6-sol",
          reasoning_effort: "max",
          messages: [{ role: "user", content: "只回复四个字：验证成功" }]
        })
      });
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      record(Boolean(content), "gpt-5.6-sol + max 真实调用", content ? `回复：${content}` : `失败：${JSON.stringify(payload).slice(0, 200)}`);
    } catch (error) {
      record(false, "gpt-5.6-sol + max 真实调用", error.message);
    }
  }

  console.log("\n=== 结论 ===");
  const failed = results.filter((ok) => !ok).length;
  if (!failed) {
    console.log("链路全部正常。在 DSH Web 模型选择器中选择 Codex / gpt-5.6-sol 即可。");
  } else {
    console.log(`有 ${failed} 项未通过，按 ❌ 提示处理。`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("验证脚本异常：", error);
  process.exitCode = 1;
});
