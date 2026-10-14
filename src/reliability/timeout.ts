export interface TimeoutOptions {
  timeoutMs: number;
  parentSignal?: AbortSignal;
  operationName?: string;
}

/**
 * Runs an async operation with a strict timeout and propagates AbortSignal.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: TimeoutOptions
): Promise<T> {
  const { timeoutMs, parentSignal, operationName = "Operation" } = options;

  if (parentSignal?.aborted) {
    throw new Error(`${operationName} was aborted before starting.`);
  }

  const controller = new AbortController();

  // If parent signals abort, propagate it to our local controller
  let abortListener: (() => void) | undefined;
  if (parentSignal) {
    abortListener = () => controller.abort(parentSignal.reason);
    parentSignal.addEventListener("abort", abortListener, { once: true });
  }

  let timer: NodeJS.Timeout | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new Error(
            `${operationName} timed out after ${timeoutMs}ms.`
          )
        );
      }, timeoutMs);
    });

    return await Promise.race([fn(controller.signal), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    if (parentSignal && abortListener) {
      parentSignal.removeEventListener("abort", abortListener);
    }
  }
}
