import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, setDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { Certificate } from '../types';

// Initialize Firebase App singleton safely
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
if (typeof window !== 'undefined') {
  testConnection();
}

/**
 * Persists a newly issued certificate to Firestore using the authenticated admin session,
 * strictly enforcing the blueprint & firestore.rules schema constraints.
 */
export async function persistCertificateToFirestore(cert: Certificate): Promise<boolean> {
  if (!auth.currentUser) {
    return false;
  }
  const safeId = String(cert.id || '').replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 128);
  const path = `certificates/${safeId}`;
  const docPayload: Record<string, any> = {
    id: safeId,
    certificateNumber: String(cert.certificateNumber || '').slice(0, 64),
    scrappingRegistrationNumber: String(cert.scrappingRegistrationNumber || '').slice(0, 64),
    ownerName: String(cert.ownerName || '').slice(0, 200),
    address: String(cert.address || 'Not Provided').slice(0, 500),
    idProofNumber: String(cert.idProofNumber || 'Not Provided').slice(0, 128),
    vehicleRegistrationNumber: String(cert.vehicleRegistrationNumber || 'Not Provided').slice(0, 64),
    chassisNumber: String(cert.chassisNumber || 'Not Provided').slice(0, 128),
    engineNumber: String(cert.engineNumber || 'Not Provided').slice(0, 128),
    showFullChassisEngine: Boolean(cert.showFullChassisEngine),
    make: String(cert.make || 'Two Wheeler').slice(0, 100),
    model: String(cert.model || 'Standard').slice(0, 100),
    location: String(cert.location || 'Delhi NCR').slice(0, 100),
    yearOfManufacture: String(cert.yearOfManufacture || '2012').slice(0, 16),
    dateOfHandover: String(cert.dateOfHandover || '').slice(0, 32),
    dateOfIssue: String(cert.dateOfIssue || '').slice(0, 32),
    qrToken: String(cert.qrToken || '').slice(0, 128),
    verificationUrl: String(cert.verificationUrl || '').slice(0, 500),
    status: ['VALID', 'CANCELLED', 'SUPERSEDED', 'REVOKED'].includes(cert.status) ? cert.status : 'VALID',
    isLocked: true,
    isImmutable: true,
    version: Number(cert.version || 1),
    dataHash: String(cert.dataHash || '').slice(0, 128),
    createdBy: String(cert.createdBy || 'Admin').slice(0, 128),
    createdAt: String(cert.createdAt || new Date().toISOString()).slice(0, 64),
    updatedAt: String(cert.updatedAt || new Date().toISOString()).slice(0, 64),
  };

  try {
    await setDoc(doc(db, 'certificates', safeId), docPayload);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    return false;
  }
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

