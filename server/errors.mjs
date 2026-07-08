export function apiError(status, code, message, detail) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.detail = detail;
  return error;
}

export function classifyProviderError(status, message = "模型请求失败。") {
  if (status === 401 || status === 403) return apiError(status, "AUTH_FAILED", "API Key 认证失败。", message);
  if (status === 404) return apiError(status, "MODEL_NOT_FOUND", "模型或接口地址不存在。", message);
  if (status >= 500) return apiError(status, "NETWORK_ERROR", "供应商服务暂时不可用。", message);
  return apiError(status, "MODEL_RESPONSE_ERROR", message);
}

export function mapModelError(error) {
  if (error.code) return error;
  if (error.name === "AbortError") {
    return apiError(504, "NETWORK_ERROR", "模型请求超时。");
  }
  return apiError(502, "MODEL_RESPONSE_ERROR", "模型返回异常或网络不可用。", error.message);
}
