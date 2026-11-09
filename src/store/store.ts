/**
 * App data store. Stage 1–5 keeps everything in this browser's localStorage;
 * stage 0 swaps `persist`/`load` for Firebase without touching the UI, which
 * only uses the hooks and actions exported here.
 */
import { useSyncExternalStore } from 'react';
import type { Part, Prefs, Work } from '../types';
import { STITCHES } from '../pattern/stitches';
import { sampleParts, sampleWorks } from './samples';
import { newId } from './yarns';

interface State {
  parts: Record<string, Part>;
  works: Record<string, Work>;
  prefs: Prefs;
}

const KEY = 'crochet-3d-studio/v1';
const isPhone = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 899px)').matches;

const defaultPrefs: Prefs = {
  theme: 'A',
  stitchOrder: STITCHES.map((s) => s.code),
  display: 'code',
  texture: !isPhone,
  stuffed: true,
  background: 'white',
  symbolColor: 'symbol',
};

function seed(): State {
  return {
    parts: Object.fromEntries(sampleParts().map((p) => [p.id, p])),
    works: Object.fromEntries(sampleWorks().map((w) => [w.id, w])),
    prefs: defaultPrefs,
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const s = JSON.parse(raw) as State;
    const order = s.prefs?.stitchOrder ?? [];
    // Keep stitches added in later versions at the end of a saved order.
    const merged = [...order.filter((c) => STITCHES.some((x) => x.code === c)), ...STITCHES.map((x) => x.code).filter((c) => !order.includes(c))];
    return { parts: s.parts ?? {}, works: s.works ?? {}, prefs: { ...defaultPrefs, ...s.prefs, stitchOrder: merged } };
  } catch {
    return seed();
  }
}

let state: State = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveOk = true;

function writeNow() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  let ok = true;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { ok = false; /* storage full or blocked: keep working in memory */ }
  if (ok !== saveOk) { saveOk = ok; listeners.forEach((l) => l()); }
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 300);
}

// Don't lose the last edit when the tab is closed or hidden inside the save delay.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (saveTimer) writeNow(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) writeNow(); });
}

/** False after a save to this browser failed (for example, storage is full). */
export function useSaveOk(): boolean {
  return useSyncExternalStore(subscribe, () => saveOk);
}

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
  persist();
}

function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

export const getState = () => state;

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
    const works = Object.fromEntries(Object.entries(state.works).map(([k, w]) => [k, { ...w, partIds: w.partIds.filter((p) => p !== id) }]));
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
    const s = seed();
    set({ ...state, parts: { ...state.parts, ...s.parts }, works: { ...state.works, ...s.works } });
  },
};
