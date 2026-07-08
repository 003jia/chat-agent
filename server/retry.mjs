export async function withRetry(operation, options = {}) {
  const retries = Number(options.retries ?? 2);
  const baseDelayMs = Number(options.baseDelayMs ?? 40);
  const shouldRetry = options.shouldRetry || (() => false);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) break;
      await delay(baseDelayMs * 2 ** attempt);
    }
  }

  throw lastError;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
