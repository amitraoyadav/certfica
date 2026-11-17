import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import type { Certificate } from '../types';

// Initialize Firebase App singleton safely (used strictly for Google Drive OAuth popup sign-in)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Certificate persistence is handled atomically on the server via POST /api/certificates
 * using Google Service Account credentials. Direct browser-side Firestore writes are disabled.
 */
export async function persistCertificateToFirestore(_cert: Certificate): Promise<boolean> {
  return true;
}

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
];

const provider = new GoogleAuthProvider();
DRIVE_SCOPES.forEach((scope) => provider.addScope(scope));

// In-memory token cache (NEVER persisted to localStorage/sessionStorage per security rules)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

const authListeners = new Set<(user: User, token: string) => void>();

export const onDriveAuthChanged = (callback: (user: User, token: string) => void): (() => void) => {
  authListeners.add(callback);
  if (cachedAccessToken && auth.currentUser) {
    try {
      callback(auth.currentUser, cachedAccessToken);
    } catch {}
  }
  return () => {
    authListeners.delete(callback);
  };
};

export const initDriveAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (onAuthSuccess) {
    authListeners.add(onAuthSuccess);
    if (cachedAccessToken && auth.currentUser) {
      try {
        onAuthSuccess(auth.currentUser, cachedAccessToken);
      } catch {}
    }
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleDriveSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Drive OAuth access token.');
    }

    cachedAccessToken = credential.accessToken;
    authListeners.forEach((cb) => {
      try {
        cb(result.user, credential.accessToken!);
      } catch {}
    });

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Drive sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getDriveAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const isDriveConnected = (): boolean => {
  return Boolean(cachedAccessToken && auth.currentUser);
};

export const googleDriveSignOut = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
};

