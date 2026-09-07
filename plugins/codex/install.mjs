#!/usr/bin/env node
/**
 * Codex 插件安装脚本（幂等）：
 *   1. 在 data/config/models.json 中注册 "codex" 供应商
 *   2. 指向本机 Codex Bridge（默认 http://127.0.0.1:8899/v1）
 *   3. 默认模型取 ~/.codex/config.toml 的 model（通常是 gpt-5.6-sol）
 *
 * 用法：
 *   node plugins/codex/install.mjs            # 注册并打印说明
 *   node plugins/codex/install.mjs --select   # 注册并切换为默认供应商
 *   node plugins/codex/install.mjs --root <dir>   # 注册到指定数据目录（如打包版应用的 userData）
 *   CODEX_BRIDGE_PORT=9000 node plugins/codex/install.mjs   # 使用自定义端口
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(PLUGIN_DIR, "..", "..");
const rootArgIndex = process.argv.indexOf("--root");
const TARGET_ROOT = rootArgIndex !== -1 ? process.argv[rootArgIndex + 1] : PROJECT_ROOT;
const MODELS_PATH = join(TARGET_ROOT, "data", "config", "models.json");

const BRIDGE_PORT = Number(process.env.CODEX_BRIDGE_PORT || 8899);
const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), ".codex");
const selectProvider = process.argv.includes("--select");

function readDefaultModel() {
  try {
    const configPath = join(CODEX_HOME, "config.toml");
    if (!existsSync(configPath)) return "";
    const toml = readFileSync(configPath, "utf8");
    const match = toml.match(/^model\s*=\s*"([^"]+)"/m);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

const DEFAULT_MODEL = process.env.CODEX_BRIDGE_MODEL || readDefaultModel() || "gpt-5.6-sol";

function loadModelsFile() {
  if (!existsSync(MODELS_PATH)) {
    return {
      selectedProvider: "codex",
      providers: {}
    };
  }
  return JSON.parse(readFileSync(MODELS_PATH, "utf8"));
}

function main() {
  const config = loadModelsFile();
  config.providers = config.providers || {};
  config.providers.codex = {
    id: "codex",
    label: "Codex GPT-5.6",
    baseURL: `http://127.0.0.1:${BRIDGE_PORT}/v1`,
    apiKey: "codex-local",
    model: DEFAULT_MODEL,
    embeddingModel: "",
    contextLength: 272000,
    status: "ready"
  };
  if (selectProvider) {
    config.selectedProvider = "codex";
  }

  writeFileSync(MODELS_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  console.log(`[codex-plugin] 已写入 ${MODELS_PATH}`);
  console.log(`[codex-plugin] 供应商 codex → ${config.providers.codex.baseURL}（模型 ${DEFAULT_MODEL}）`);
  console.log("");
  console.log("下一步：");
  console.log(`  1. 启动 Codex Bridge：  npm run codex:bridge`);
  console.log(`     （或 node plugins/codex/bridge.mjs）`);
  console.log(`  2. 启动工作台：        npm run dev`);
  console.log(`  3. 在聊天输入区模型切换器中选择 “${config.providers.codex.label}”。`);
  if (!selectProvider) {
    console.log(`  4. 如需默认使用该模型：node plugins/codex/install.mjs --select`);
  }
  console.log("");
  console.log("说明：Codex 走的是你本机 Codex 的 ChatGPT 登录态，不消耗独立 API Key；");
  console.log("      apiKey 字段只是占位（桥接服务默认不做校验）。");
}

main();
