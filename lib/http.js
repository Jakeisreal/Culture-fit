const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function withRetry(operation, options = {}) {
  const attempts = options.attempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 150;

  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const status = Number(error?.response?.status || error?.code);
      const retryable = RETRYABLE_STATUS_CODES.has(status) || error?.code === 'ETIMEDOUT';
      if (!retryable || attempt === attempts - 1) throw error;

      const jitter = Math.floor(Math.random() * baseDelayMs);
      await sleep((baseDelayMs * (2 ** attempt)) + jitter);
    }
  }
  throw lastError;
}
export function getClientIp(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req?.socket?.remoteAddress || '127.0.0.1';
}
