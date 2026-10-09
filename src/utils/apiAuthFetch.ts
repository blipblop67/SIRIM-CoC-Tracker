import { auth } from './auth';

/**
 * Adds the signed-in user's Firebase ID token to every same-origin /api request, so the server
 * can check who is calling (see server-auth.ts). Installed once in main.tsx; existing fetch('/api/…')
 * calls across the app keep working unchanged.
 *
 * If the server answers 401/403 with an auth code, a `sirim-auth-error` window event is fired so the
 * app can show the sign-in screen.
 */
export const AUTH_ERROR_EVENT = 'sirim-auth-error';

function isApiUrl(input: RequestInfo | URL): boolean {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

export function installApiAuthFetch() {
  const originalFetch = window.fetch.bind(window);
  if ((window.fetch as any).__sirimAuth) return;

  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isApiUrl(input)) return originalFetch(input, init);

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    const user = auth.currentUser;
    if (user && !headers.has('X-Firebase-Token')) {
      try {
        headers.set('X-Firebase-Token', await user.getIdToken());
      } catch {
        /* offline: let the server reply 401 */
      }
    }

    const res = await originalFetch(input, { ...init, headers });
    if (res.status === 401 || res.status === 403) {
      try {
        const body = await res.clone().json();
        if (body?.code === 'AUTH_REQUIRED' || body?.code === 'AUTH_FORBIDDEN') {
          window.dispatchEvent(new CustomEvent(AUTH_ERROR_EVENT, { detail: { code: body.code, message: body.error } }));
        }
      } catch {
        /* not JSON */
      }
    }
    return res;
  };
  (wrapped as any).__sirimAuth = true;
  window.fetch = wrapped as typeof window.fetch;
}
