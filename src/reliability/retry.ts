export interface RetryOptions {
  maxAttempts?: number | undefined;
  initialDelayMs?: number | undefined;
  backoffFactor?: number | undefined;
  isRetryable?: ((error: unknown) => boolean) | undefined;
}

/**
 * Executes an async task with exponential backoff and retry bounds.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 100;
  const backoffFactor = options.backoffFactor ?? 2;
  const isRetryable = options.isRetryable ?? (() => true);

  let currentDelay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err: unknown) {
      const canRetry = attempt < maxAttempts && isRetryable(err);
      if (!canRetry) {
        throw err;
      }

      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      currentDelay *= backoffFactor;
    }
  }

  throw new Error("Retry loop exhausted without result.");
}
