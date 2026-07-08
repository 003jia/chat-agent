import crypto from "node:crypto";
import { apiError } from "./errors.mjs";

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
