#!/usr/bin/env node
// E2E 运行归档单入口：rotate → run → generate → archive，并回传原始退出码。
// 用法：node scripts/run-and-archive.mjs <module> [-- <playwright args...>]
// 禁止手写四段串联；本脚本统一负责历史旋转、运行、报告生成与归档。
import { execFileSync } from "node:child_process";
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const moduleName = process.argv[2];
if (!moduleName) {
  console.error("用法: node scripts/run-and-archive.mjs <module> [-- <args>]");
  process.exit(2);
}

const KEEP_HISTORY = 10; // 每模块保留最近归档数

// ---- rotate：滚动历史归档，保留最近 N 次 ----
async function rotate() {
  const historyRoot = path.join(rootDir, "qa-screenshots", "history", moduleName);
  await mkdir(historyRoot, { recursive: true });
  const entries = (await readdir(historyRoot, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const toRemove = entries.slice(0, Math.max(0, entries.length - (KEEP_HISTORY - 1)));
  for (const name of toRemove) {
    await rm(path.join(historyRoot, name), { recursive: true, force: true });
    console.log(`[rotate] removed ${moduleName}/${name}`);
  }
}

// ---- run：串行执行 playwright 并捕获退出码 ----
function run() {
  const extraArgs = process.argv.slice(3);
  const args = ["playwright", "test", "--project", moduleName, ...extraArgs];
  try {
    execFileSync("npx", args, { cwd: rootDir, stdio: "inherit" });
    return 0;
  } catch (error) {
    return typeof error.status === "number" ? error.status : 1;
  }
}

// ---- generate：从 results.json 生成 report.md ----
async function generate() {
  const resultsPath = path.join(rootDir, ".e2e-results", "results.json");
  let results;
  try {
    results = JSON.parse(await readFile(resultsPath, "utf8"));
  } catch {
    return "（results.json 缺失或未生成，归档仅含运行产物）";
  }
  const lines = [`# ${moduleName} E2E 运行报告`, "", `- 生成时间: ${new Date().toISOString()}`, `- 套件数: ${results.stats?.suites || "-"}`, `- 用例数: ${results.stats?.tests || "-"}`, `- 通过: ${results.stats?.expected || 0}`, `- 失败: ${results.stats?.unexpected || 0}`, `- 跳过: ${results.stats?.skipped || 0}`, `- 不稳定: ${results.stats?.flaky || 0}`, "", "## 用例明细", ""];
  const suites = Array.isArray(results.suites) ? results.suites : [];
  const walk = (suite, indent = "") => {
    for (const spec of suite.specs || []) {
      const status = spec.ok ? "PASS" : "FAIL";
      lines.push(`${indent}- [${status}] ${spec.title}`);
    }
    for (const child of suite.suites || []) walk(child, indent + "  ");
  };
  for (const suite of suites) walk(suite);
  return lines.join("\n");
}

// ---- archive：归档四要素（report.md / results.json / HTML 报告 / video+trace）----
async function archive(reportBody) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const archiveDir = path.join(rootDir, "qa-screenshots", "history", moduleName, ts);
  await mkdir(archiveDir, { recursive: true });

  await writeFile(path.join(archiveDir, "report.md"), reportBody);

  for (const [name, src, target] of [
    [".e2e-results/results.json", path.join(rootDir, ".e2e-results", "results.json"), path.join(archiveDir, "results.json")],
    ["HTML 报告", path.join(rootDir, "playwright-report"), path.join(archiveDir, "html")],
    ["video+trace", path.join(rootDir, ".e2e-results", "trace"), path.join(archiveDir, "video-trace")]
  ]) {
    try {
      await cp(src, target, { recursive: true });
      console.log(`[archive] ${name} -> ${path.relative(rootDir, target)}`);
    } catch (error) {
      console.warn(`[archive] ${name} 缺失，跳过: ${error.message}`);
    }
  }
  return archiveDir;
}

async function cleanupWorkingDirs() {
  await rm(path.join(rootDir, ".e2e-results"), { recursive: true, force: true });
  await rm(path.join(rootDir, "playwright-report"), { recursive: true, force: true });
}

await rotate();
const exitCode = run();
const reportBody = await generate();
const archiveDir = await archive(reportBody);
await cleanupWorkingDirs();
console.log(`[archive] 归档完成: ${path.relative(rootDir, archiveDir)}（退出码 ${exitCode}）`);
process.exit(exitCode);
