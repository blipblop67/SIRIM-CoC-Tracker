/**
 * Utility for robust API requests with clean error handling, automatic retries for transient
 * restart/network glitches, and guards against HTML error pages.
 */
export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit,
  retriesRemaining: number = 2
): Promise<T> {
  // Setup AbortController if signal is not already provided
  const controller = new AbortController();
  const timeoutMs = 40000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const fetchOptions: RequestInit = {
    ...options,
    signal: options?.signal || controller.signal,
  };

  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch (netErr: any) {
    clearTimeout(timeoutId);
    if (retriesRemaining > 0) {
      // Retry transient network drop / connection failure after delay
      await new Promise((r) => setTimeout(r, 1500));
      return safeFetchJson<T>(url, options, retriesRemaining - 1);
    }
    const isTimeout = netErr?.name === 'AbortError' || String(netErr).includes('abort');
    if (isTimeout) {
      throw new Error(`Request to ${url} timed out after ${timeoutMs / 1000}s. The service may be processing a heavy operation.`);
    }
    throw new Error(`Network connection error: ${netErr?.message || netErr}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    const isHtml = text.trim().startsWith('<!doctype html>') || text.trim().startsWith('<html') || text.includes('<html');

    if (isHtml) {
      if (res.status === 404) {
        throw new Error(`API endpoint ${url} was not found on the server (HTTP 404).`);
      }
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        if (retriesRemaining > 0) {
          await new Promise((r) => setTimeout(r, 2000));
          return safeFetchJson<T>(url, options, retriesRemaining - 1);
        }
        throw new Error(`Backend service is temporarily unavailable (HTTP ${res.status}). Please try again in a moment.`);
      }

      // If server returned HTTP 200 HTML (e.g. dev server restarted / spa loading page), retry
      if (retriesRemaining > 0) {
        await new Promise((r) => setTimeout(r, 1800));
        return safeFetchJson<T>(url, options, retriesRemaining - 1);
      }
      throw new Error(`Server returned HTML instead of JSON (HTTP ${res.status}). The service may be restarting.`);
    }
    throw new Error(`Server returned non-JSON response (${res.status} ${res.statusText}): ${text.slice(0, 150)}`);
  }

  let data: any;
  try {
    data = await res.json();
  } catch (jsonErr: any) {
    throw new Error(`Failed to parse JSON response: ${jsonErr?.message || jsonErr}`);
  }

  if (!res.ok) {
    const message = data?.details || data?.error || data?.message || `Request failed with HTTP ${res.status}`;
    const err: any = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data as T;
}
