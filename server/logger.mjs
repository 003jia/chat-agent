const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /(X-Admin-Token["':\s]+)[A-Za-z0-9._~+/=-]+/gi,
  /(apiKey["':\s]+)[A-Za-z0-9._~+/=-]+/gi,
  /(MEMORY_AGENT_ADMIN_TOKEN=)[^\s]+/gi,
  /(MEMORY_AGENT_API_KEY_[A-Z_]+=)[^\s]+/gi,
  /sk-[A-Za-z0-9_-]+/g
];

export function sanitizeForLog(value) {
  let text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  for (const pattern of secretPatterns) {
    text = text.replace(pattern, (match, prefix = "") => `${prefix}[REDACTED]`);
  }
  return text;
}

export function logError(logger, error, context = {}) {
  const payload = {
    code: error?.code || "INTERNAL_ERROR",
    status: error?.status || 500,
    message: error?.message || "服务异常。",
    detail: error?.detail,
    stack: error?.stack?.split("\n").slice(0, 4).join("\n"),
    context
  };
  logger.error(sanitizeForLog(payload));
}
