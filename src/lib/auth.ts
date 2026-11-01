import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User
} from 'firebase/auth';
import { getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { doc, getDoc, getFirestore, runTransaction, serverTimestamp } from 'firebase/firestore';
import type { CodexSettings } from './storage';

export interface SignedInUser {
  uid: string;
  username: string;
  mode: 'local' | 'firebase';
}

type LocalAccount = {
  uid: string;
  username: string;
  salt: string;
  passwordHash: string;
  createdAt: number;
};

const USERS_KEY = 'codex.local.users.v1';
const SESSION_KEY = 'codex.local.session.v1';

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateCredentials(username: string, password: string): string | null {
  const normalized = normalizeUsername(username);
  if (!/^[a-z0-9_-]{3,20}$/.test(normalized)) {
    return 'Use 3–20 characters: letters, numbers, underscore or hyphen.';
  }
  if (password.length < 6) return 'Password must contain at least 6 characters.';
  return null;
}

function readLocalUsers(): Record<string, LocalAccount> {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? '{}') as Record<string, LocalAccount>;
  } catch {
    return {};
  }
}

function writeLocalUsers(users: Record<string, LocalAccount>): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function hasFirebaseConfig(config: CodexSettings['firebaseConfig']): boolean {
  return Boolean(config.apiKey.trim() && config.authDomain.trim() && config.projectId.trim() && config.appId.trim());
}

function firebaseServices(config: CodexSettings['firebaseConfig']) {
  if (!hasFirebaseConfig(config)) throw new Error('Firebase configuration is incomplete.');
  const options: FirebaseOptions = {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    appId: config.appId,
    messagingSenderId: config.messagingSenderId || undefined
  };
  const appName = `codex-ai-${config.projectId}`;
  const app = getApps().find((item) => item.name === appName) ?? initializeApp(options, appName);
  const auth = getAuth(app);
  const db = getFirestore(app);
  return { auth, db };
}

function syntheticEmail(username: string): string {
  return `${normalizeUsername(username)}@users.codexai.invalid`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 180000, hash: 'SHA-256' }, key, 256);
  return toBase64(new Uint8Array(bits));
}

function authMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code.includes('email-already-in-use')) return 'This name is already in use. Please try another one.';
  if (code.includes('wrong-password') || code.includes('invalid-credential') || code.includes('user-not-found')) return 'Name or password is incorrect.';
  if (code.includes('weak-password')) return 'Password is too weak. Use at least 6 characters.';
  if (code.includes('network-request-failed')) return 'Network connection failed. Check your internet connection.';
  if (code.includes('operation-not-allowed')) return 'Enable Email/Password sign-in in Firebase Authentication.';
  if (code.includes('permission-denied')) return 'Firestore rules blocked this action. Apply the rules from FIREBASE_SETUP.md.';
  if (error instanceof Error && error.message) return error.message;
  return 'Authentication failed. Check your details and try again.';
}

async function ensureCloudProfile(user: User, username: string, db: ReturnType<typeof getFirestore>): Promise<void> {
  const profileRef = doc(db, 'profiles', user.uid);
  const profile = await getDoc(profileRef);
  if (!profile.exists()) {
    await runTransaction(db, async (transaction) => {
      const usernameRef = doc(db, 'usernames', username);
      const nameSnapshot = await transaction.get(usernameRef);
      if (nameSnapshot.exists() && nameSnapshot.data().uid !== user.uid) {
        throw new Error('This name is already in use. Please try another one.');
      }
      if (!nameSnapshot.exists()) {
        transaction.set(usernameRef, { uid: user.uid, username, createdAt: serverTimestamp() });
      }
      transaction.set(profileRef, { uid: user.uid, username, createdAt: serverTimestamp() });
    });
  }
}

export async function registerAccount(usernameInput: string, password: string, config: CodexSettings['firebaseConfig']): Promise<SignedInUser> {
  const error = validateCredentials(usernameInput, password);
  if (error) throw new Error(error);
  const username = normalizeUsername(usernameInput);

  if (!hasFirebaseConfig(config)) {
    const users = readLocalUsers();
    if (users[username]) throw new Error('This name is already in use. Please try another one.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const account: LocalAccount = {
      uid: `local-${crypto.randomUUID()}`,
      username,
      salt: toBase64(salt),
      passwordHash: await hashPassword(password, salt),
      createdAt: Date.now()
    };
    users[username] = account;
    writeLocalUsers(users);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ uid: account.uid, username }));
    return { uid: account.uid, username, mode: 'local' };
  }

  try {
    const { auth, db } = firebaseServices(config);
    await setPersistence(auth, browserLocalPersistence);
    const credential = await createUserWithEmailAndPassword(auth, syntheticEmail(username), password);
    try {
      const usernameRef = doc(db, 'usernames', username);
      const profileRef = doc(db, 'profiles', credential.user.uid);
      await runTransaction(db, async (transaction) => {
        const nameSnapshot = await transaction.get(usernameRef);
        if (nameSnapshot.exists()) throw new Error('This name is already in use. Please try another one.');
        transaction.set(usernameRef, { uid: credential.user.uid, username, createdAt: serverTimestamp() });
        transaction.set(profileRef, { uid: credential.user.uid, username, createdAt: serverTimestamp() });
      });
    } catch (transactionError) {
      await deleteUser(credential.user).catch(() => undefined);
      throw transactionError;
    }
    return { uid: credential.user.uid, username, mode: 'firebase' };
  } catch (errorValue) {
    throw new Error(authMessage(errorValue));
  }
}

export async function loginAccount(usernameInput: string, password: string, config: CodexSettings['firebaseConfig']): Promise<SignedInUser> {
  const error = validateCredentials(usernameInput, password);
  if (error) throw new Error(error);
  const username = normalizeUsername(usernameInput);

  if (!hasFirebaseConfig(config)) {
    const account = readLocalUsers()[username];
    if (!account) throw new Error('Name or password is incorrect.');
    const actual = await hashPassword(password, fromBase64(account.salt));
    if (actual !== account.passwordHash) throw new Error('Name or password is incorrect.');
    localStorage.setItem(SESSION_KEY, JSON.stringify({ uid: account.uid, username }));
    return { uid: account.uid, username, mode: 'local' };
  }

  try {
    const { auth, db } = firebaseServices(config);
    await setPersistence(auth, browserLocalPersistence);
    const credential = await signInWithEmailAndPassword(auth, syntheticEmail(username), password);
    await ensureCloudProfile(credential.user, username, db);
    return { uid: credential.user.uid, username, mode: 'firebase' };
  } catch (errorValue) {
    throw new Error(authMessage(errorValue));
  }
}

export async function restoreSession(config: CodexSettings['firebaseConfig']): Promise<SignedInUser | null> {
  if (hasFirebaseConfig(config)) {
    try {
      const { auth, db } = firebaseServices(config);
      await setPersistence(auth, browserLocalPersistence);
      const user = await new Promise<User | null>((resolve) => {
        let unsubscribe: () => void = () => {}; 
        unsubscribe = onAuthStateChanged(auth, (value) => {
          unsubscribe();
          resolve(value);
        }, () => {
          unsubscribe();
          resolve(null);
        });
      });
      if (!user) return null;
      const profile = await getDoc(doc(db, 'profiles', user.uid));
      const username = String(profile.data()?.username ?? user.email?.split('@')[0] ?? 'user');
      return { uid: user.uid, username, mode: 'firebase' };
    } catch {
      return null;
    }
  }

  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as { uid: string; username: string } | null;
    if (!session) return null;
    const account = readLocalUsers()[session.username];
    if (!account || account.uid !== session.uid) return null;
    return { uid: account.uid, username: account.username, mode: 'local' };
  } catch {
    return null;
  }
}

export async function logoutAccount(user: SignedInUser | null, config: CodexSettings['firebaseConfig']): Promise<void> {
  if (user?.mode === 'firebase' && hasFirebaseConfig(config)) {
    const { auth } = firebaseServices(config);
    await signOut(auth);
  }
  localStorage.removeItem(SESSION_KEY);
}

export function isFirebaseConfigured(config: CodexSettings['firebaseConfig']): boolean {
  return hasFirebaseConfig(config);
}
