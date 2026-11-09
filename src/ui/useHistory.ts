import { useCallback, useRef, useState } from 'react';

/**
 * Undo/redo for one value. Edits that share a `mergeKey` within 800 ms
 * (typing in the same row) collapse into a single undo step.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const last = useRef<{ key?: string; at: number }>({ at: 0 });

  const set = useCallback((next: T | ((prev: T) => T), mergeKey?: string) => {
    setState((s) => {
      const value = typeof next === 'function' ? (next as (p: T) => T)(s.present) : next;
      if (value === s.present) return s;
      const now = Date.now();
      const merge = mergeKey !== undefined && last.current.key === mergeKey && now - last.current.at < 800;
      last.current = { key: mergeKey, at: now };
      return { past: merge ? s.past : [...s.past.slice(-199), s.present], present: value, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    last.current = { at: 0 };
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);
  const redo = useCallback(() => {
    last.current = { at: 0 };
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);
  /** Replace the value without an undo step (e.g. another part was opened). */
  const reset = useCallback((value: T) => setState({ past: [], present: value, future: [] }), []);

  return { value: state.present, set, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
