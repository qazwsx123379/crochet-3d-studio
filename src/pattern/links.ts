/**
 * Which stitch(es) of the round below each stitch is worked into, by stitch
 * index. Used to lay out the symbol chart; mirrors how the 3D relaxation ties
 * stitches together (rounds run the same way as the round below, flat rows
 * turn and work back from its far end, a row may start part-way along).
 */
import { STITCH_BY_CODE, consumesOf } from './stitches';
import type { Method, RoundInfo } from './analyze';

export function stitchParents(rounds: RoundInfo[], method: Method): Map<number, number[][]> {
  const out = new Map<number, number[][]>();
  let prevSlots: number[] = []; // stitch indices of the round below, one per stitch it left
  const slotsByNo = new Map<number, number[]>();
  for (const r of rounds) {
    if (!r.stitches.length || r.status === 'syntax') continue;
    const under = r.base !== undefined ? slotsByNo.get(r.base) ?? prevSlots : prevSlots;
    const below = method === 'flat' ? [...under].reverse() : under;
    let ptr = Math.max(0, (r.startAt ?? 1) - 1);
    const take = (n: number): number[] => {
      if (!below.length) return [];
      const got: number[] = [];
      for (let k = 0; k < n; k++) got.push(below[method === 'flat' ? Math.min(ptr + k, below.length - 1) : (ptr + k) % below.length]);
      ptr += n;
      return [...new Set(got)];
    };
    const parents: number[][] = [];
    let lastGroup: number | undefined;
    let groupParents: number[] = [];
    r.stitches.forEach((st) => {
      const def = STITCH_BY_CODE[st.code];
      if (!def) { parents.push([]); return; }
      if (st.group !== undefined && st.group === lastGroup) parents.push(groupParents);
      else if (st.group !== undefined) {
        const consumes = r.stitches.some((s) => s.group === st.group && consumesOf(s)) ? 1 : 0;
        groupParents = take(consumes);
        parents.push(groupParents);
      } else parents.push(take(consumesOf(st)));
      lastGroup = st.group;
    });
    out.set(r.no, parents);
    const slots: number[] = [];
    r.stitches.forEach((st, i) => { for (let q = 0; q < (STITCH_BY_CODE[st.code]?.produces ?? 0); q++) slots.push(i); });
    if (slots.length) { prevSlots = slots; slotsByNo.set(r.no, slots); }
  }
  return out;
}
