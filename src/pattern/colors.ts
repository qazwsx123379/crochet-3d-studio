import type { Part } from '../types';
import type { RoundInfo } from './analyze';

export const stitchKey = (r: Pick<RoundInfo, 'rowId' | 'inRow'>, i: number) => `${r.rowId}#${r.inRow}#${i}`;
export const roundKey = (r: Pick<RoundInfo, 'rowId' | 'inRow'>) => `${r.rowId}#${r.inRow}`;

const FALLBACK = '#D9D4CC';

/** Palette colour id of every stitch in a round (missing colours fall back to the round's, then the first). */
export function roundColorIds(part: Part, r: RoundInfo): string[] {
  const ids = new Set(part.palette.map((c) => c.id));
  const rc = part.roundColors[roundKey(r)];
  const base = rc && ids.has(rc) ? rc : part.palette[0]?.id ?? '';
  return r.stitches.map((_, i) => { const id = part.stitchColors[stitchKey(r, i)]; return id && ids.has(id) ? id : base; });
}

/** Hex colour of every stitch in a round, in stitch order. */
export function roundHexes(part: Part, r: RoundInfo): string[] {
  const byId = new Map(part.palette.map((c) => [c.id, c.hex]));
  return roundColorIds(part, r).map((id) => byId.get(id) ?? FALLBACK);
}

/** Summarise a round's colours as runs for the little colour strip. */
export function colorRuns(hexes: string[]): { hex: string; n: number }[] {
  const runs: { hex: string; n: number }[] = [];
  for (const h of hexes) {
    const last = runs[runs.length - 1];
    if (last && last.hex === h) last.n++;
    else runs.push({ hex: h, n: 1 });
  }
  return runs;
}

/** Readable text colour on top of a yarn colour. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1D2928' : '#FFFFFF';
}
