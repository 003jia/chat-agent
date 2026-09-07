/**
 * @file 智能体本地工作区访问控制与文件操作工具。
 * 所有读写都被严格限制在配置的工作区根目录内，防止路径逃逸。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { writeTextAtomic } from "./atomic-fs.mjs";
import { apiError } from "./errors.mjs";

const MAX_LIST_ENTRIES = 1000;
const MAX_READ_CHARS = 50_000;
const MAX_GREP_MATCHES = 100;
const MAX_WRITE_CHARS = 2_000_000;
const MAX_PATCH_CHARS = 2_000_000;
const MAX_GREP_PATTERN_LENGTH = 200;
const MAX_PATCH_FRAGMENT_LENGTH = 200_000;
const BINARY_SNIFF_BYTES = 8192;
const DEFAULT_DEPTH = 2;
const MAX_DEPTH = 6;
const SKIPPED_DIR_NAMES = new Set(["node_modules", ".git", ".svn", "dist"]);
const TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
  ".css", ".scss", ".less", ".html", ".htm", ".xml", ".yaml", ".yml",
  ".toml", ".ini", ".cfg", ".py", ".go", ".java", ".c", ".h", ".cpp",
  ".hpp", ".rs", ".rb", ".php", ".sh", ".bat", ".csv", ".log", ".sql",
  ".env", ".gitignore", ".dockerignore", ".editorconfig", ".vue", ".svelte"
]);

/**
 * 解析工作区根目录。
 *
 * @param {string} rootDir - 应用根目录
 * @param {Record<string, string | undefined>} env - 环境变量
 * @returns {string} 工作区根目录绝对路径
 */
export function resolveWorkspaceRoot(rootDir, env = process.env) {
  const configured = String(env?.MEMORY_AGENT_WORKSPACE_DIR || "").trim();
  if (configured) return path.resolve(configured);
  return path.join(rootDir, "data", "workspace");
}

/**
 * 将相对路径解析为工作区内的绝对路径，拒绝绝对路径与逃逸路径。
 *
 * @param {string} root - 工作区根目录
 * @param {string} relativePath - 工作区相对路径（如 "notes/plan.md"）
 * @returns {string} 工作区内的绝对路径
 */
export function resolveWorkspacePath(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw apiError(400, "WORKSPACE_PATH_INVALID", "文件路径不能为空。");
  }
  const trimmed = relativePath.trim();
  if (path.isAbsolute(trimmed)) {
    throw apiError(400, "WORKSPACE_PATH_INVALID", "只允许使用工作区内的相对路径。");
  }
  if (trimmed.includes("\0")) {
    throw apiError(400, "WORKSPACE_PATH_INVALID", "文件路径包含非法字符。");
  }
  const resolved = path.resolve(root, trimmed);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw apiError(400, "WORKSPACE_PATH_ESCAPE", "文件路径超出了工作区范围。");
  }
  return resolved;
}

/**
 * 校验已存在文件/目录是否真的位于工作区（防止符号链接逃逸）。
 *
 * @param {string} root - 工作区根目录
 * @param {string} target - 已解析的绝对路径
 * @returns {Promise<string>} 真实路径
 */
async function ensureInsideWorkspace(root, target) {
  const [rootReal, targetReal] = await Promise.all([
    fs.realpath(root).catch(() => path.resolve(root)),
    fs.realpath(target).catch(() => null)
  ]);
  if (targetReal === null) return target;
  const relative = path.relative(rootReal, targetReal);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw apiError(400, "WORKSPACE_PATH_ESCAPE", "路径指向了工作区之外。");
  }
  return targetReal;
}

/**
 * 列出工作区内的目录内容（递归，限制深度与条目数）。
 *
 * @param {string} root - 工作区根目录
 * @param {object} input - 工具输入
 * @param {string} [input.path] - 起始相对路径
 * @param {number} [input.depth] - 递归深度
 * @returns {Promise<object>} 条目列表
 */
export async function listWorkspace(root, input) {
  const start = resolveWorkspacePath(root, input?.path || ".");
  const depth = clampInteger(input?.depth, 1, MAX_DEPTH, DEFAULT_DEPTH, "depth");
  await ensureInsideWorkspace(root, start);
  const entries = [];
  await walkWorkspace(start, 0, depth, entries, root);
  return {
    root: path.relative(root, start) || ".",
    count: entries.length,
    entries
  };
}

async function walkWorkspace(dir, currentDepth, maxDepth, entries, root) {
  if (currentDepth > maxDepth || entries.length >= MAX_LIST_ENTRIES) return;
  let children;
  try {
    children = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw apiError(404, "WORKSPACE_PATH_NOT_FOUND", `工作区中不存在：${path.relative(root, dir)}`);
    }
    throw apiError(500, "WORKSPACE_LIST_ERROR", "列出工作区目录失败。");
  }
  children.sort((a, b) => a.name.localeCompare(b.name));
  for (const child of children) {
    if (entries.length >= MAX_LIST_ENTRIES) break;
    if (child.isDirectory() && SKIPPED_DIR_NAMES.has(child.name)) continue;
    const absolute = path.join(dir, child.name);
    const entry = {
      name: child.name,
      path: path.relative(root, absolute),
      type: child.isDirectory() ? "directory" : child.isSymbolicLink() ? "symlink" : "file"
    };
    if (entry.type === "file") {
      const stats = await fs.stat(absolute).catch(() => null);
      entry.size = stats?.size ?? 0;
    }
    entries.push(entry);
    if (child.isDirectory()) {
      await walkWorkspace(absolute, currentDepth + 1, maxDepth, entries, root);
    }
  }
}

/**
 * 读取工作区内文本文件内容（限制返回字符数）。
 *
 * @param {string} root - 工作区根目录
 * @param {object} input - 工具输入
 * @param {string} input.path - 相对路径
 * @param {number} [input.maxChars] - 最多返回字符数
 * @returns {Promise<object>} 文件内容
 */
export async function readWorkspaceFile(root, input) {
  const target = await ensureExists(root, input, "文件不存在或不是普通文件。");
  const maxChars = clampInteger(input?.maxChars, 100, MAX_READ_CHARS, MAX_READ_CHARS, "maxChars");
  const stats = await fs.stat(target);
  const buffer = await fs.readFile(target);
  if (isLikelyBinary(buffer)) {
    return { path: input.path, size: stats.size, binary: true, text: "" };
  }
  const text = buffer.toString("utf8");
  const truncated = text.length > maxChars;
  return {
    path: input.path,
    size: stats.size,
    binary: false,
    truncated,
    charCount: text.length,
    text: truncated ? text.slice(0, maxChars) : text
  };
}

/**
 * 在工作区内按子串搜索文本文件内容。
 *
 * @param {string} root - 工作区根目录
 * @param {object} input - 工具输入
 * @param {string} input.pattern - 要搜索的子串
 * @param {string} [input.path] - 起始相对路径
 * @param {number} [input.maxMatches] - 最多返回的匹配数
 * @returns {Promise<object>} 匹配列表
 */
export async function grepWorkspace(root, input) {
  const pattern = String(input?.pattern || "").trim();
  if (!pattern || pattern.length > MAX_GREP_PATTERN_LENGTH) {
    throw apiError(400, "WORKSPACE_PATTERN_INVALID", "搜索内容长度无效。");
  }
  const start = resolveWorkspacePath(root, input?.path || ".");
  const maxMatches = clampInteger(input?.maxMatches, 1, MAX_GREP_MATCHES, 50, "maxMatches");
  await ensureInsideWorkspace(root, start);
  const matches = [];
  await grepWalk(start, pattern, matches, maxMatches, root);
  return { pattern, count: matches.length, matches };
}

async function grepWalk(dir, pattern, matches, maxMatches, root) {
  if (matches.length >= maxMatches) return;
  let children;
  try {
    children = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw apiError(404, "WORKSPACE_PATH_NOT_FOUND", `工作区中不存在：${path.relative(root, dir)}`);
    }
    throw apiError(500, "WORKSPACE_GREP_ERROR", "搜索工作区失败。");
  }
  for (const child of children) {
    if (matches.length >= maxMatches) break;
    const absolute = path.join(dir, child.name);
    if (child.isDirectory()) {
      if (SKIPPED_DIR_NAMES.has(child.name)) continue;
      await grepWalk(absolute, pattern, matches, maxMatches, root);
      continue;
    }
    if (!looksTextual(child.name)) continue;
    const buffer = await fs.readFile(absolute).catch(() => null);
    if (!buffer || isLikelyBinary(buffer)) continue;
    const lines = buffer.toString("utf8").split("\n");
    for (let index = 0; index < lines.length && matches.length < maxMatches; index++) {
      if (lines[index].includes(pattern)) {
        matches.push({
          path: path.relative(root, absolute),
          line: index + 1,
          text: lines[index].slice(0, 300)
        });
      }
    }
  }
}

/**
 * 在工作区内创建或覆盖文件。
 *
 * @param {string} root - 工作区根目录
 * @param {object} input - 工具输入
 * @param {string} input.path - 相对路径
 * @param {string} input.content - 文件内容
 * @returns {Promise<object>} 写入结果
 */
export async function writeWorkspaceFile(root, input) {
  const content = input?.content;
  const isBinary = Buffer.isBuffer(content);
  if (!isBinary && (typeof content !== "string" || content.length > MAX_WRITE_CHARS)) {
    throw apiError(400, "WORKSPACE_CONTENT_INVALID", "文件内容长度无效。");
  }
  if (isBinary && content.length > MAX_WRITE_CHARS) {
    throw apiError(400, "WORKSPACE_CONTENT_INVALID", "文件内容长度无效。");
  }
  const target = resolveWorkspacePath(root, input.path);
  const existed = await fs.access(target).then(() => true, () => false);
  if (existed) await ensureInsideWorkspace(root, target);
  if (!existed) {
    const parent = path.dirname(target);
    await fs.mkdir(parent, { recursive: true }).catch(() => {});
  }
  await ensureParentInsideWorkspace(root, target);
  await writeTextAtomic(target, content);
  const stats = await fs.stat(target);
  return {
    path: input.path,
    size: stats.size,
    created: !existed,
    changed: existed
  };
}

/**
 * 在工作区内对文件做精确文本替换（要求目标文本唯一出现）。
 *
 * @param {string} root - 工作区根目录
 * @param {object} input - 工具输入
 * @param {string} input.path - 相对路径
 * @param {string} input.oldString - 要替换的原文（必须唯一）
 * @param {string} input.newString - 替换后的文本
 * @returns {Promise<object>} 补丁结果
 */
export async function patchWorkspaceFile(root, input) {
  const oldString = String(input?.oldString || "");
  const newString = String(input?.newString || "");
  if (!oldString || oldString.length + newString.length > MAX_PATCH_FRAGMENT_LENGTH) {
    throw apiError(400, "WORKSPACE_PATCH_INVALID", "替换内容长度无效。");
  }
  const target = await ensureExists(root, input, "文件不存在，无法执行补丁。");
  const buffer = await fs.readFile(target);
  if (isLikelyBinary(buffer)) {
    throw apiError(400, "WORKSPACE_BINARY_FILE", "二进制文件不支持文本补丁。");
  }
  const text = buffer.toString("utf8");
  const occurrences = countOccurrences(text, oldString);
  if (occurrences === 0) {
    throw apiError(400, "WORKSPACE_PATCH_NOT_FOUND", "文件中没有找到需要替换的目标文本。");
  }
  if (occurrences > 1) {
    throw apiError(400, "WORKSPACE_PATCH_AMBIGUOUS", `目标文本出现 ${occurrences} 次，请提供更长的唯一上下文。`);
  }
  const patched = text.replace(oldString, newString);
  if (patched.length > MAX_PATCH_CHARS) {
    throw apiError(400, "WORKSPACE_CONTENT_INVALID", "补丁后的文件内容过长。");
  }
  await writeTextAtomic(target, patched);
  return {
    path: input.path,
    replaced: occurrences,
    resultSize: Buffer.byteLength(patched, "utf8"),
    preview: renderPatchPreview(text, patched)
  };
}

async function ensureExists(root, input, message) {
  const target = await resolveWorkspacePath(root, String(input?.path || ""));
  await ensureInsideWorkspace(root, target);
  const stats = await fs.stat(target).catch(() => null);
  if (!stats || !stats.isFile()) {
    throw apiError(404, "WORKSPACE_PATH_NOT_FOUND", message);
  }
  return target;
}

async function ensureParentInsideWorkspace(root, target) {
  const parent = path.dirname(target);
  let current = parent;
  while (current !== root && current !== path.dirname(current)) {
    const isSymlink = await fs.lstat(current).then((stats) => stats.isSymbolicLink(), () => false);
    if (isSymlink) {
      throw apiError(400, "WORKSPACE_PATH_ESCAPE", "写路径包含了指向工作区外的符号链接。");
    }
    current = path.dirname(current);
  }
}

function looksTextual(name) {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0) return false;
  return TEXT_EXTENSIONS.has(name.slice(dotIndex).toLowerCase());
}

function isLikelyBinary(buffer) {
  const sample = buffer.subarray(0, BINARY_SNIFF_BYTES);
  for (let index = 0; index < sample.length; index++) {
    if (sample[index] === 0) return true;
  }
  return false;
}

function countOccurrences(text, fragment) {
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(fragment, index)) !== -1) {
    count++;
    index += fragment.length;
  }
  return count;
}

function renderPatchPreview(before, after) {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const shared = findSharedPrefixLineCount(beforeLines, afterLines);
  const sharedTail = findSharedSuffixLineCount(beforeLines, afterLines, shared);
  const removed = beforeLines.slice(shared, beforeLines.length - sharedTail).join("\n");
  const added = afterLines.slice(shared, afterLines.length - sharedTail).join("\n");
  const preview = {
    contextBefore: beforeLines.slice(Math.max(0, shared - 2), shared).join("\n"),
    removed: removed.slice(0, 1000),
    added: added.slice(0, 1000)
  };
  return preview;
}

function findSharedPrefixLineCount(beforeLines, afterLines) {
  let count = 0;
  const max = Math.min(beforeLines.length, afterLines.length);
  while (count < max && beforeLines[count] === afterLines[count]) count++;
  return count;
}

function findSharedSuffixLineCount(beforeLines, afterLines, prefixCount) {
  let count = 0;
  const max = Math.min(beforeLines.length, afterLines.length) - prefixCount;
  while (count < max
    && beforeLines[beforeLines.length - 1 - count] === afterLines[afterLines.length - 1 - count]) {
    count++;
  }
  return count;
}

function clampInteger(value, min, max, fallback, name) {
  if (value === undefined || value === null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw apiError(400, "WORKSPACE_PARAM_INVALID", `参数 ${name} 必须是 ${min} 到 ${max} 的整数。`);
  }
  return number;
}