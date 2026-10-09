import { ReactNode, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { ShieldCheck, Loader2, LogOut } from 'lucide-react';
import { auth, googleSignIn, googleSignOut } from '../utils/auth';
import { AUTH_ERROR_EVENT } from '../utils/apiAuthFetch';

/**
 * Shows the app only to signed-in users. The server enforces who is allowed (Cytron accounts);
 * this screen just gives people a way to sign in and explains a rejection.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [forbiddenMessage, setForbiddenMessage] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    if (!u) setForbiddenMessage(null);
  }), []);

  // Ask the server once whether this account is allowed, so a wrong account sees why straight away.
  useEffect(() => {
    if (!user) return;
    fetch('/api/automation/config').catch(() => {});
  }, [user?.uid]);

  useEffect(() => {
    const onAuthError = async (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (detail.code === 'AUTH_FORBIDDEN') {
        setForbiddenMessage(detail.message || 'This account is not allowed to use the tracker.');
      } else if (detail.code === 'AUTH_REQUIRED' && auth.currentUser) {
        // Token may be stale; force a refresh. If that fails, show the sign-in screen.
        try {
          await auth.currentUser.getIdToken(true);
        } catch {
          await googleSignOut();
        }
      }
    };
    window.addEventListener(AUTH_ERROR_EVENT, onAuthError);
    return () => window.removeEventListener(AUTH_ERROR_EVENT, onAuthError);
  }, []);

  const handleSignIn = async () => {
    setError(null);
    setSigningIn(true);
    try {
      await googleSignIn();
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') setError(err?.message || 'Sign-in failed. Please try again.');
    } finally {
      setSigningIn(false);
    }
  };

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (user && !forbiddenMessage) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-center space-y-4">
        <ShieldCheck className="w-10 h-10 mx-auto text-blue-600" />
        <div>
          <h1 className="text-lg font-bold text-slate-900">SIRIM CoC Tracker</h1>
          <p className="text-sm text-slate-600 mt-1">
            {forbiddenMessage ? forbiddenMessage : 'Sign in with your Cytron Google account to continue.'}
          </p>
        </div>
        {forbiddenMessage ? (
          <button
            onClick={() => googleSignOut()}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="w-4 h-4" /> Sign out and use another account
          </button>
        ) : (
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {signingIn && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign in with Google
          </button>
        )}
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
