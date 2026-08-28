import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  setPersistence,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  inMemoryPersistence,
} from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  memoryLocalCache,
} from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  projectId: firebaseConfigJson.projectId,
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId,
  appId: firebaseConfigJson.appId,
};

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const fbApp = app;

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Google Workspace Scopes (Drive & Gmail)
export const GOOGLE_WORKSPACE_SCOPES = [
  // Google Drive
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.activity',
  'https://www.googleapis.com/auth/drive.activity.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.apps.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.install',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.photos.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.scripts',
  // Gmail
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.metadata',
  'https://www.googleapis.com/auth/gmail.insert',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
  'https://www.googleapis.com/auth/gmail.addons.current.action.compose',
  'https://www.googleapis.com/auth/gmail.addons.current.message.action',
  'https://www.googleapis.com/auth/gmail.addons.current.message.metadata',
  'https://www.googleapis.com/auth/gmail.addons.current.message.readonly',
];

export const GOOGLE_DRIVE_SCOPES = GOOGLE_WORKSPACE_SCOPES;

GOOGLE_WORKSPACE_SCOPES.forEach((scope) => {
  googleProvider.addScope(scope);
});

// In-Memory access token storage (Do NOT store in localStorage or sessionStorage per security guidelines)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Clear cached token on sign-out
auth.onAuthStateChanged((user) => {
  if (!user) {
    cachedAccessToken = null;
  }
});

export function getCachedDriveToken(): string | null {
  return cachedAccessToken;
}

export function setCachedDriveToken(token: string | null): void {
  cachedAccessToken = token;
}

export function getCachedGmailToken(): string | null {
  return cachedAccessToken;
}

export function setCachedGmailToken(token: string | null): void {
  cachedAccessToken = token;
}

export function getCachedWorkspaceToken(): string | null {
  return cachedAccessToken;
}

export function setCachedWorkspaceToken(token: string | null): void {
  cachedAccessToken = token;
}

// Gracefully configure Auth persistence across browser refreshes, standalone tabs, and mobile
if (typeof window !== 'undefined') {
  setPersistence(auth, indexedDBLocalPersistence)
    .catch(() => setPersistence(auth, browserLocalPersistence))
    .catch(() => setPersistence(auth, inMemoryPersistence))
    .catch((err) => console.warn('[AUTH_INITIALIZATION] Persistence notice (safe):', err));
}

// Initialize Firestore with robust dual-database and memory cache fallback
const databaseId = (firebaseConfigJson as any).firestoreDatabaseId || '(default)';

export const namedDb = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: memoryLocalCache(),
    }, databaseId);
  } catch (_e) {
    try {
      return getFirestore(app, databaseId);
    } catch {
      return getFirestore(app);
    }
  }
})();

export const defaultDb = (() => {
  try {
    return getFirestore(app);
  } catch (_e) {
    return namedDb;
  }
})();

export const db = namedDb;

export async function loginWithGoogle() {
  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  try {
    isSigningIn = true;
    if (isMobile) {
      // Use redirect on mobile devices to prevent browser popup termination or crash
      await signInWithRedirect(auth, googleProvider);
      return null;
    } else {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
      }
      return result.user;
    }
  } catch (error: any) {
    console.warn('[GOOGLE_SIGN_IN] Google Sign-In notice:', error);
    if (
      error?.code === 'auth/popup-blocked' ||
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request' ||
      error?.code === 'auth/operation-not-supported-in-this-environment'
    ) {
      // Fallback to redirect if popup fails or is blocked on desktop/tablet
      try {
        await signInWithRedirect(auth, googleProvider);
        return null;
      } catch (redirectErr) {
        console.error('[GOOGLE_SIGN_IN_REDIRECT] Redirect fallback error:', redirectErr);
        throw redirectErr;
      }
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
}

export async function requestWorkspaceAccessToken(): Promise<string> {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }

  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google Workspace authorization succeeded, but no access token was returned.');
    }
    cachedAccessToken = credential.accessToken;
    return cachedAccessToken;
  } catch (err: any) {
    console.error('[WORKSPACE_AUTH_ERROR] Error acquiring Google Workspace access token:', err);
    throw err;
  } finally {
    isSigningIn = false;
  }
}

export async function requestDriveAccessToken(): Promise<string> {
  return requestWorkspaceAccessToken();
}

export async function requestGmailAccessToken(): Promise<string> {
  return requestWorkspaceAccessToken();
}

export async function checkAuthRedirect() {
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
      }
      return result.user;
    }
    return null;
  } catch (error: any) {
    console.warn('[GOOGLE_SIGN_IN_REDIRECT] Redirect result check notice:', error);
    return null;
  }
}

export async function logoutUser() {
  try {
    await firebaseSignOut(auth);
    cachedAccessToken = null;
  } catch (error: any) {
    console.warn('[LOGOUT] Sign Out Error:', error);
    throw error;
  }
}

