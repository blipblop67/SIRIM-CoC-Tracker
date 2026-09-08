/**
 * Utility for robust API requests with clean error handling and guard against HTML error pages.
 */
export async function safeFetchJson<T = any>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (netErr: any) {
    throw new Error(`Network connection error: ${netErr?.message || netErr}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    if (text.trim().startsWith('<!doctype html>') || text.trim().startsWith('<html') || text.includes('<html')) {
      if (res.status === 404) {
        throw new Error(`API endpoint ${url} was not found on the server (HTTP 404).`);
      }
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        throw new Error(`Backend service is temporarily unavailable (HTTP ${res.status}). Please try again in a moment.`);
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
