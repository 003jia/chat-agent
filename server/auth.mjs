import crypto from "node:crypto";
import { apiError } from "./errors.mjs";

export const ADMIN_USERNAME_DEFAULT = "admin";
export const ADMIN_PASSWORD_DEFAULT = "admin123";

// 账号密码校验：账号/密码通过 env 配置，默认 admin / admin123
export function verifyAdminCredentials({ username, password } = {}, env = process.env) {
  const expectedUsername = String(env.MEMORY_AGENT_ADMIN_USERNAME || ADMIN_USERNAME_DEFAULT);
  const expectedPassword = String(env.MEMORY_AGENT_ADMIN_PASSWORD || ADMIN_PASSWORD_DEFAULT);
  return typeof username === "string" && typeof password === "string" &&
    username === expectedUsername && password === expectedPassword;
}

export function requireAdminToken(env = process.env) {
  return (request, _response, next) => {
    const expected = String(env.MEMORY_AGENT_ADMIN_TOKEN || "");
    if (!expected) {
      next(apiError(401, "AUTH_REQUIRED", "服务端未设置 MEMORY_AGENT_ADMIN_TOKEN，写入和模型调用接口已关闭。"));
      return;
    }

    const provided = String(request.get("X-Admin-Token") || "");
    if (!provided) {
      next(apiError(401, "AUTH_REQUIRED", "缺少 X-Admin-Token。"));
      return;
    }

    if (!timingSafeEqual(provided, expected)) {
      next(apiError(403, "AUTH_FAILED", "管理员令牌不正确。"));
      return;
    }

    next();
  };
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
