import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { withRetry } from "./retry.mjs";

// 由本模块生成的临时文件固定后缀格式：
// <target>.tmp-<pid>-<uuid>
const TEMP_FILE_RE = /\.tmp-\d+-[0-9a-f\-]{36}$/i;

function makeTempPath(targetPath) {
  return `${targetPath}.tmp-${process.pid}-${randomUUID()}`;
}

/**
 * 将文本写入临时文件后重命名为目标路径，避免目标文件出现半写内容。
 *
 * @param {string} targetPath - 最终文件路径（会覆盖已有同名文件）
 * @param {string} value - 要写入的文本
 */
export async function writeTextAtomic(targetPath, value) {
  const resolvedTarget = path.resolve(String(targetPath));
  await fs.mkdir(path.dirname(resolvedTarget), { recursive: true });

  const tempPath = makeTempPath(resolvedTarget);
  const bytes = Buffer.isBuffer(value)
    ? value
    : typeof value === "string"
      ? Buffer.from(value, "utf8")
      : Buffer.from(`${value}`, "utf8");

  try {
    await fs.writeFile(tempPath, bytes, { encoding: null });
    await fs.chmod(tempPath, 0o600).catch(() => {});
    // rename 在 POSIX 上通常已是原子的，但仍用重试抵消偶发的 EBUSY/EACCES
    await withRetry(() => fs.rename(tempPath, resolvedTarget));
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}

/**
 * 将对象原子性地序列化为 Pretty-printed JSON 并落盘到指定路径。
 *
 * @param {string} targetPath - 最终文件路径
 * @param {*} value - 要持久化的值
 */
export async function writeJsonAtomic(targetPath, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  return writeTextAtomic(targetPath, body);
}

/**
 * 清理指定目录中所有本模块产生的未完成的临时文件。
 * 递归处理子目录；目录不存在时静默返回。
 *
 * @param {...(string | undefined | null)} dirs - 需要扫描的目录列表
 */
export async function cleanupAtomicFsTemps(...dirs) {
  for (const rawDir of dirs) {
    const dir = rawDir && String(rawDir).trim() ? path.resolve(rawDir) : "";
    if (!dir || !(await safeStatIsDirectory(dir))) continue;
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await cleanupAtomicFsTemps(entryPath);
          return;
        }
        if (!entry.isFile() && !entry.isSymbolicLink()) return;
        if (TEMP_FILE_RE.test(entry.name)) {
          await fs.unlink(entryPath).catch(() => {});
        }
      })
    );
  }
}

async function safeStatIsDirectory(possibleDir) {
  try {
    const stat = await fs.stat(possibleDir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
