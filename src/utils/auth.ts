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

let cachedAccessToken: string | null = null;
let cachedUserSession: UserAuthSession | null = null;
let isSigningIn = false;

export const initAuth = (
  onAuthSuccess?: (session: UserAuthSession) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedUserSession) {
        if (onAuthSuccess) onAuthSuccess(cachedUserSession);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        cachedUserSession = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      cachedUserSession = null;
      if (onAuthFailure) onAuthFailure();
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
    
    cachedAccessToken = credential.accessToken;
    const user = result.user;
    cachedUserSession = {
      accessToken: cachedAccessToken,
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600 * 1000,
      email: user.email || undefined,
      name: user.displayName || undefined,
      picture: user.photoURL || undefined,
      isAuthenticated: true,
    };
    return cachedUserSession;
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
}

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getStoredAuthSession = (): UserAuthSession | null => {
  return cachedUserSession;
};

export const googleSignOut = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  cachedUserSession = null;
};
