export interface HttpRetryOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  shouldRetry?: (status: number) => boolean;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultShouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  options: HttpRetryOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 7000;
  const retries = options.retries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 250;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();

        if (attempt < retries && shouldRetry(response.status)) {
          await sleep(retryDelayMs * Math.pow(2, attempt));
          continue;
        }

        throw new HttpError(`HTTP request failed: ${response.status}`, response.status, body);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await sleep(retryDelayMs * Math.pow(2, attempt));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown HTTP request failure");
}
