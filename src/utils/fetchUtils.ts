/**
 * Resilient JSON fetch utility with automatic retries and exponential backoff.
 * Prevents container cold-boot / dev-server startup race conditions ("Failed to fetch")
 * from triggering errors in ErrorBoundaries and telemetry.
 */
export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit,
  retries = 3,
  baseDelayMs = 350
): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          await new Promise(r => setTimeout(r, baseDelayMs * (attempt + 1)));
          continue;
        }
        return null;
      }
      return (await res.json()) as T;
    } catch {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelayMs * (attempt + 1)));
      } else {
        return null;
      }
    }
  }
  return null;
}
