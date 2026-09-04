import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
// @ts-ignore
import firebaseConfig from '../../firebase-applet-config.json';
import { UserAuthSession } from '../types';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const provider = new GoogleAuthProvider();
const scopes = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.addons.current.action.compose',
  'https://www.googleapis.com/auth/gmail.addons.current.message.action',
  'https://www.googleapis.com/auth/gmail.addons.current.message.metadata',
  'https://www.googleapis.com/auth/gmail.addons.current.message.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.insert',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.metadata',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly'
];

scopes.forEach(scope => provider.addScope(scope));

const AUTH_STORAGE_KEY = 'sirim_coc_auth_session_v1';

let cachedAccessToken: string | null = null;
let cachedUserSession: UserAuthSession | null = null;
let isSigningIn = false;

export function saveSession(session: UserAuthSession | null) {
  cachedUserSession = session;
  cachedAccessToken = session?.accessToken || null;
  try {
    if (session) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('Failed to save session to localStorage', err);
  }
}

export function clearSession() {
  saveSession(null);
}

export const getStoredAuthSession = (): UserAuthSession | null => {
  // If memory cache is present and valid
  if (cachedUserSession) {
    if (cachedUserSession.expiresAt && Date.now() > cachedUserSession.expiresAt) {
      console.warn('Google OAuth session in memory has expired');
      clearSession();
      return null;
    }
    return cachedUserSession;
  }

  // Otherwise check localStorage
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as UserAuthSession;
    if (!session || !session.accessToken) {
      clearSession();
      return null;
    }

    // Check expiration if present
    if (session.expiresAt && Date.now() > session.expiresAt) {
      console.warn('Google OAuth session in localStorage has expired');
      clearSession();
      return null;
    }

    cachedUserSession = session;
    cachedAccessToken = session.accessToken;
    return session;
  } catch (err) {
    console.error('Failed to parse stored auth session', err);
    clearSession();
    return null;
  }
};

export const initAuth = (
  onAuthSuccess?: (session: UserAuthSession) => void,
  onAuthFailure?: () => void
) => {
  // 1. Instantly deliver stored session if valid to prevent reload logout flash
  const existing = getStoredAuthSession();
  if (existing && onAuthSuccess) {
    onAuthSuccess(existing);
  }

  // 2. Listen to Firebase auth state
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const activeSession = getStoredAuthSession();
      if (activeSession) {
        const updatedSession: UserAuthSession = {
          ...activeSession,
          email: user.email || activeSession.email,
          name: user.displayName || activeSession.name,
          picture: user.photoURL || activeSession.picture,
          isAuthenticated: true,
        };
        saveSession(updatedSession);
        if (onAuthSuccess) onAuthSuccess(updatedSession);
      } else if (!isSigningIn) {
        clearSession();
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      if (!isSigningIn) {
        clearSession();
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

export async function googleSignIn(): Promise<UserAuthSession | null> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }
    
    const user = result.user;
    const session: UserAuthSession = {
      accessToken: credential.accessToken,
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600 * 1000,
      email: user.email || undefined,
      name: user.displayName || undefined,
      picture: user.photoURL || undefined,
      isAuthenticated: true,
    };

    saveSession(session);
    return session;
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
}

export const getAccessToken = async (): Promise<string | null> => {
  const session = getStoredAuthSession();
  return session?.accessToken || null;
};

export const googleSignOut = async () => {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('Error during signOut:', e);
  }
  clearSession();
};
