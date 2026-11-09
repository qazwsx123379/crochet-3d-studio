/**
 * Firebase: Google sign-in and Firestore. Everything a person makes lives
 * under users/{uid}/…, which the security rules restrict to that person:
 *   users/{uid}/parts/{partId}
 *   users/{uid}/works/{workId}
 *   users/{uid}/meta/prefs
 *   users/{uid}/meta/init   (written once, after the first-time import)
 * Firestore's on-device cache keeps the last data so it can be viewed offline.
 */
import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDoc, initializeFirestore, onSnapshot, persistentLocalCache, persistentMultipleTabManager,
  setDoc, writeBatch, type DocumentData,
} from 'firebase/firestore';

// The web config is public by design; access is controlled by the security rules.
const firebaseConfig = {
  apiKey: 'AIzaSyDjMcEZEvF7YGZW0q9Ko-pic7Xf8n68JXU',
  authDomain: 'crochet-3d-studio.firebaseapp.com',
  projectId: 'crochet-3d-studio',
  storageBucket: 'crochet-3d-studio.firebasestorage.app',
  messagingSenderId: '359797052905',
  appId: '1:359797052905:web:30d1f5c4a3f25a5f746778',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
});

export interface Account { uid: string; name: string; email: string; photo: string }

export function watchAuth(cb: (a: Account | null) => void) {
  return onAuthStateChanged(auth, (u: User | null) => cb(u ? { uid: u.uid, name: u.displayName ?? '', email: u.email ?? '', photo: u.photoURL ?? '' } : null));
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    // Some phones block pop-ups: fall back to a full-page redirect.
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(auth, provider);
    else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') throw e;
  }
}

export const signOutNow = () => signOut(auth);

export type Kind = 'parts' | 'works';

export interface Change { kind: Kind; id: string; data: DocumentData | null }

/** Listen to a person's parts, works and preferences. `onFirst` fires once both lists have loaded. */
export function watchUser(uid: string, handlers: {
  onDocs: (kind: Kind, changes: Change[], fromCache: boolean) => void;
  onPrefs: (data: DocumentData | null) => void;
  onError: (message: string) => void;
}) {
  const unsubs: (() => void)[] = [];
  for (const kind of ['parts', 'works'] as const) {
    unsubs.push(onSnapshot(collection(db, 'users', uid, kind), { includeMetadataChanges: false }, (snap) => {
      const changes: Change[] = snap.docChanges()
        .filter((c) => !c.doc.metadata.hasPendingWrites) // our own edits echoing back
        .map((c) => ({ kind, id: c.doc.id, data: c.type === 'removed' ? null : c.doc.data() }));
      handlers.onDocs(kind, changes, snap.metadata.fromCache);
    }, (e) => handlers.onError(e.message)));
  }
  unsubs.push(onSnapshot(doc(db, 'users', uid, 'meta', 'prefs'), (s) => { if (!s.metadata.hasPendingWrites) handlers.onPrefs(s.exists() ? s.data() : null); }, (e) => handlers.onError(e.message)));
  return () => unsubs.forEach((u) => u());
}

export async function isInitialised(uid: string): Promise<boolean> {
  const s = await getDoc(doc(db, 'users', uid, 'meta', 'init'));
  return s.exists();
}

/** First sign-in: copy the starting data (this browser's work, or the samples) into the account. */
export async function importInitial(uid: string, parts: Record<string, DocumentData>, works: Record<string, DocumentData>, prefs: DocumentData, source: string) {
  const entries = [...Object.entries(parts).map(([id, d]) => ['parts', id, d] as const), ...Object.entries(works).map(([id, d]) => ['works', id, d] as const)];
  // A batch holds up to 500 writes.
  for (let i = 0; i < entries.length; i += 450) {
    const batch = writeBatch(db);
    for (const [kind, id, d] of entries.slice(i, i + 450)) batch.set(doc(db, 'users', uid, kind, id), d);
    await batch.commit();
  }
  await setDoc(doc(db, 'users', uid, 'meta', 'prefs'), prefs);
  await setDoc(doc(db, 'users', uid, 'meta', 'init'), { at: Date.now(), source });
}

export function writeDoc(uid: string, kind: Kind, id: string, data: DocumentData | null): Promise<void> {
  const ref = doc(db, 'users', uid, kind, id);
  return data ? setDoc(ref, data) : deleteDoc(ref);
}

export function writePrefs(uid: string, data: DocumentData): Promise<void> {
  return setDoc(doc(db, 'users', uid, 'meta', 'prefs'), data);
}
