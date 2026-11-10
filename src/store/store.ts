/**
 * App data store. The UI only uses the hooks and actions exported here.
 *
 * Two modes:
 * - cloud (the real site): Google sign-in, data in Firestore under the
 *   signed-in person, cached on the device for offline viewing.
 * - local (the claude.ai preview build, `--mode preview`): no sign-in, data in
 *   this browser's localStorage. Firebase is not even bundled.
 */
import { useSyncExternalStore } from 'react';
import type { Part, Prefs, Work } from '../types';
import { STITCHES } from '../pattern/stitches';
import { sampleParts, sampleWorks } from './samples';
import { newId } from './yarns';
import type { Account, Change, Kind } from './cloud';

interface State {
  parts: Record<string, Part>;
  works: Record<string, Work>;
  prefs: Prefs;
}

export const CLOUD = import.meta.env.MODE !== 'preview';

const KEY = 'crochet-3d-studio/v1';

const defaultPrefs: Prefs = {
  theme: 'A',
  stitchOrder: STITCHES.map((s) => s.code),
  display: 'code',
  yarn: true,
  stuffed: true,
  background: 'white',
  symbolColor: 'symbol',
};

function samples(): Pick<State, 'parts' | 'works'> {
  return {
    parts: Object.fromEntries(sampleParts().map((p) => [p.id, p])),
    works: Object.fromEntries(sampleWorks().map((w) => [w.id, w])),
  };
}

/** Saved stitch orders keep stitches added in later versions, at the end. */
function withPrefs(p?: Partial<Prefs>): Prefs {
  const order = p?.stitchOrder ?? [];
  const merged = [...order.filter((c) => STITCHES.some((x) => x.code === c)), ...STITCHES.map((x) => x.code).filter((c) => !order.includes(c))];
  return { ...defaultPrefs, ...p, stitchOrder: merged };
}

/** What this browser saved before (used by local mode, and imported on the first cloud sign-in). */
function loadLocal(): State | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as State;
    return { parts: s.parts ?? {}, works: s.works ?? {}, prefs: withPrefs(s.prefs) };
  } catch {
    return null;
  }
}

let state: State = CLOUD ? { parts: {}, works: {}, prefs: withPrefs() } : loadLocal() ?? { ...samples(), prefs: defaultPrefs };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

/* ---------------- sign-in state ---------------- */

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; error?: string }
  | { status: 'signedIn'; account: Account; ready: boolean };

let authState: AuthState = CLOUD ? { status: 'loading' } : { status: 'signedIn', account: { uid: 'local', name: '', email: '', photo: '' }, ready: true };
const setAuth = (a: AuthState) => { authState = a; emit(); };
export function useAuth(): AuthState { return useSyncExternalStore(subscribe, () => authState); }

/* ---------------- save status ---------------- */

export type SaveState = 'saving' | 'saved' | 'failed' | 'offline';
let saveSnap: { state: SaveState; at: number } = { state: 'saved', at: 0 };
function setSave(state: SaveState, at = saveSnap.at) {
  if (state !== saveSnap.state || at !== saveSnap.at) { saveSnap = { state, at }; emit(); }
}
/** Whether the latest edit is saved, and when. */
export function useSaveStatus() { return useSyncExternalStore(subscribe, () => saveSnap); }

/* ---------------- local mode ---------------- */

let localTimer: ReturnType<typeof setTimeout> | undefined;
function writeLocalNow() {
  clearTimeout(localTimer);
  localTimer = undefined;
  try { localStorage.setItem(KEY, JSON.stringify(state)); setSave('saved', Date.now()); } catch { setSave('failed'); }
}

/* ---------------- cloud mode ---------------- */

type Cloud = typeof import('./cloud');
// Only the real site loads Firebase; the preview build drops it entirely.
const loadCloud: (() => Promise<Cloud>) | null = CLOUD ? () => import('./cloud') : null;
let cloud: Cloud | null = null;
let uid = '';
/** Documents edited here and not yet acknowledged; remote changes to them are ignored meanwhile. */
const queued = new Map<string, { kind: Kind | 'prefs'; id: string }>();
const inFlight = new Map<string, number>();
let cloudTimer: ReturnType<typeof setTimeout> | undefined;

function flushCloud() {
  clearTimeout(cloudTimer);
  cloudTimer = undefined;
  if (!cloud || !uid) return;
  const jobs = [...queued.values()];
  queued.clear();
  for (const job of jobs) {
    const key = `${job.kind}/${job.id}`;
    inFlight.set(key, (inFlight.get(key) ?? 0) + 1);
    const data = job.kind === 'prefs' ? state.prefs : job.kind === 'parts' ? state.parts[job.id] ?? null : state.works[job.id] ?? null;
    const p = job.kind === 'prefs' ? cloud.writePrefs(uid, data as object) : cloud.writeDoc(uid, job.kind, job.id, data as object | null);
    p.then(() => {
      const n = (inFlight.get(key) ?? 1) - 1;
      if (n <= 0) inFlight.delete(key); else inFlight.set(key, n);
      if (!inFlight.size && !queued.size) setSave('saved', Date.now());
    }).catch(() => setSave('failed'));
  }
  if (!navigator.onLine) setSave('offline');
}

function queueCloud(kind: Kind | 'prefs', id: string) {
  queued.set(`${kind}/${id}`, { kind, id });
  setSave(navigator.onLine ? 'saving' : 'offline');
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(flushCloud, 600);
}

function diffAndQueue(prev: State, next: State) {
  for (const kind of ['parts', 'works'] as const) {
    const a = prev[kind] as Record<string, unknown>, b = next[kind] as Record<string, unknown>;
    for (const id of Object.keys(b)) if (a[id] !== b[id]) queueCloud(kind, id);
    for (const id of Object.keys(a)) if (!(id in b)) queueCloud(kind, id);
  }
  if (prev.prefs !== next.prefs) queueCloud('prefs', 'prefs');
}

function applyRemote(kind: Kind, changes: Change[]) {
  if (!changes.length) return;
  const map = { ...(state[kind] as Record<string, unknown>) };
  for (const c of changes) {
    const key = `${kind}/${c.id}`;
    if (queued.has(key) || inFlight.has(key)) continue; // our newer edit wins
    if (c.data) map[c.id] = c.data; else delete map[c.id];
  }
  state = { ...state, [kind]: map };
  emit();
}

async function startCloud() {
  if (!loadCloud) return;
  cloud = await loadCloud();
  const c = cloud;
  let stop: (() => void) | undefined;
  window.addEventListener('online', () => { if (queued.size) flushCloud(); else if (saveSnap.state === 'offline') setSave(inFlight.size ? 'saving' : 'saved'); });
  window.addEventListener('offline', () => setSave('offline'));
  c.watchAuth(async (account) => {
    stop?.();
    stop = undefined;
    if (!account) { uid = ''; state = { parts: {}, works: {}, prefs: withPrefs() }; setAuth({ status: 'signedOut' }); return; }
    uid = account.uid;
    setAuth({ status: 'signedIn', account, ready: false });
    try {
      // First sign-in on this account: bring in what this browser had, or the samples.
      if (navigator.onLine && !(await c.isInitialised(uid))) {
        const local = loadLocal();
        const start = local && Object.keys(local.parts).length ? local : { ...samples(), prefs: local?.prefs ?? defaultPrefs };
        await c.importInitial(uid, start.parts, start.works, start.prefs, local ? 'browser' : 'samples');
      }
    } catch (e) {
      setAuth({ status: 'signedIn', account, ready: true });
      console.error(e);
    }
    const loaded = new Set<Kind>();
    stop = c.watchUser(uid, {
      onDocs: (kind, changes) => {
        applyRemote(kind, changes);
        loaded.add(kind);
        if (loaded.size === 2 && authState.status === 'signedIn' && !authState.ready) setAuth({ ...authState, ready: true });
      },
      onPrefs: (data) => { if (data && !queued.has('prefs/prefs') && !inFlight.has('prefs/prefs')) { state = { ...state, prefs: withPrefs(data as Partial<Prefs>) }; emit(); } },
      onError: (message) => { console.error(message); setSave('failed'); },
    });
  });
}

if (CLOUD && typeof window !== 'undefined') startCloud().catch((e) => setAuth({ status: 'signedOut', error: String(e) }));

export async function signIn() {
  try {
    if (!loadCloud) return;
    if (!cloud) cloud = await loadCloud();
    await cloud.signInWithGoogle();
  } catch (e) {
    setAuth({ status: 'signedOut', error: (e as Error).message });
  }
}
export async function signOutAccount() {
  flushCloud();
  await cloud?.signOutNow();
}

// Don't lose the last edit when the tab is closed or hidden inside the save delay.
if (typeof window !== 'undefined') {
  const flushAll = () => { if (localTimer) writeLocalNow(); if (cloudTimer) flushCloud(); };
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
}

/* ---------------- state updates ---------------- */

function set(next: State) {
  const prev = state;
  state = next;
  emit();
  if (CLOUD) diffAndQueue(prev, next);
  else {
    clearTimeout(localTimer);
    setSave('saving');
    localTimer = setTimeout(writeLocalNow, 300);
  }
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

export const getState = () => state;

/** Parts created in this visit whose settings haven't been chosen yet (the editor asks first). */
const freshParts = new Set<string>();
export const isFreshPart = (id: string) => freshParts.has(id);
export const clearFreshPart = (id: string) => { freshParts.delete(id); };

export const actions = {
  savePart(part: Part) {
    set({ ...state, parts: { ...state.parts, [part.id]: { ...part, updatedAt: Date.now() } } });
  },
  createPart(name = '新零件'): Part {
    const id = newId('part');
    const part: Part = {
      id, name, tags: [], updatedAt: Date.now(),
      settings: { method: 'spiral', start: 'ring', yarn: 'HAPPY 牛奶棉', hook: 3 },
      rows: [{ id: newId('row'), text: '6X', repeat: 1, note: '' }],
      palette: [{ id: newId('c'), name: '奶油白', hex: '#F4EEDF', brand: 'HAPPY 牛奶棉', code: '' }],
      stitchColors: {}, roundColors: {},
    };
    set({ ...state, parts: { ...state.parts, [id]: part } });
    freshParts.add(id);
    return part;
  },
  duplicatePart(id: string): Part | undefined {
    const src = state.parts[id];
    if (!src) return undefined;
    const part: Part = { ...structuredClone(src), id: newId('part'), name: `${src.name}（複製）`, sample: false, updatedAt: Date.now() };
    set({ ...state, parts: { ...state.parts, [part.id]: part } });
    return part;
  },
  deletePart(id: string) {
    const parts = { ...state.parts };
    delete parts[id];
    // Only works that used the part change.
    const works = Object.fromEntries(Object.entries(state.works).map(([k, w]) => [k, w.partIds.includes(id) ? { ...w, partIds: w.partIds.filter((p) => p !== id) } : w]));
    set({ ...state, parts, works });
  },
  saveWork(work: Work) {
    set({ ...state, works: { ...state.works, [work.id]: { ...work, updatedAt: Date.now() } } });
  },
  createWork(name = '新作品'): Work {
    const work: Work = { id: newId('work'), name, partIds: [], tags: [], updatedAt: Date.now() };
    set({ ...state, works: { ...state.works, [work.id]: work } });
    return work;
  },
  deleteWork(id: string) {
    const works = { ...state.works };
    delete works[id];
    set({ ...state, works });
  },
  setPrefs(p: Partial<Prefs>) {
    set({ ...state, prefs: { ...state.prefs, ...p } });
  },
  resetSamples() {
    const s = samples();
    set({ ...state, parts: { ...state.parts, ...s.parts }, works: { ...state.works, ...s.works } });
  },
};
