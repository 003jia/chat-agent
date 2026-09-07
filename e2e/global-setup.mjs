// E2E 全局前置：清理隔离数据根，确保每次运行从全新状态开始。
import { rm } from "node:fs/promises";

const E2E_ROOT = ".e2e-tmp";

export default async function globalSetup() {
  await rm(E2E_ROOT, { recursive: true, force: true });
  console.log("[e2e] isolated data root cleaned:", E2E_ROOT);
}
