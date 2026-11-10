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

export interface ColorSpan { from: number; to: number; colorId: string; name: string; hex: string }

/**
 * Colour changes a crocheter needs to know about, per round: the runs of
 * colour inside the round (stitch numbers are 1-based, in the order the
 * stitches are written), and whether the round as a whole switches colour.
 * Rounds in one colour that carry on from the round before get no note.
 */
export function colorChanges(part: Part, rounds: RoundInfo[]): Map<number, { spans: ColorSpan[]; whole: boolean }> {
  const byId = new Map(part.palette.map((c) => [c.id, c]));
  const out = new Map<number, { spans: ColorSpan[]; whole: boolean }>();
  let lastColor = '';
  for (const r of rounds) {
    if (!r.stitches.length || r.status === 'syntax') continue;
    const ids = roundColorIds(part, r);
    const spans: ColorSpan[] = [];
    ids.forEach((id, i) => {
      const last = spans[spans.length - 1];
      if (last && last.colorId === id) last.to = i + 1;
      else { const c = byId.get(id); spans.push({ from: i + 1, to: i + 1, colorId: id, name: c?.name ?? '', hex: c?.hex ?? '#ccc' }); }
    });
    if (spans.length > 1) out.set(r.no, { spans, whole: false });
    else if (lastColor && spans[0].colorId !== lastColor) out.set(r.no, { spans, whole: true });
    lastColor = ids[ids.length - 1];
  }
  return out;
}

/** The same notes as plain text, e.g. 「第 1–12 針 南瓜橘 → 第 13–18 針 黑」. */
export function colorChangeText(change: { spans: ColorSpan[]; whole: boolean }): string {
  if (change.whole) return `這圈換成「${change.spans[0].name}」`;
  return change.spans.map((s) => `第 ${s.from === s.to ? s.from : `${s.from}–${s.to}`} 針「${s.name}」`).join(' → ');
}
