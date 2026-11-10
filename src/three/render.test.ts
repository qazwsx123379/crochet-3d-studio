import { describe, expect, it } from 'vitest';
import { analyze, type PatternRow } from '../pattern/analyze';
import { prepareRender } from './render';

const rows = (...t: [string, number?][]): PatternRow[] => t.map(([text, repeat], i) => ({ id: 'r' + i, text, repeat: repeat ?? 1, note: '' }));
const rounds = (rs: PatternRow[], method: 'spiral' | 'joined' | 'flat' = 'spiral', start: 'ring' | 'chain' = 'ring') =>
  analyze(rs, { method, start }).rounds.map((info) => ({ info, hexes: info.stitches.map(() => '#E8833A') }));

describe('prepareRender', () => {
  it('relaxes a stuffed ball into a finite, closed, outward-facing surface', () => {
    const r = rounds(rows(['6X'], ['(V)*6'], ['(X,V)*6'], ['X*18', 3], ['(X,A)*6'], ['(A)*6']));
    const d = prepareRender(r, { method: 'spiral', start: 'ring', stuffed: true }, true)!;
    expect(d.index).toBeDefined();
    expect([...d.positions].every(Number.isFinite)).toBe(true);
    expect(d.faceRound.length * 3).toBe(d.index!.length);
    // Increases are drawn as two stitches: 6 + 12 + 18*4 + 12 + 6 = 108 yarn stitches.
    expect(d.placements).toHaveLength(6 + 12 + 18 * 4 + 12 + 6);
    expect(d.doubleSided).toBe(false);
  });

  it('keeps a flat disc flat and shows yarn on both sides', () => {
    const r = rounds(rows(['12F'], ['(FV)*12'], ['(F,FV)*12']), 'joined');
    const d = prepareRender(r, { method: 'joined', start: 'ring', stuffed: false }, true)!;
    expect(d.maxY - d.minY).toBeLessThan(d.radius * 0.35);
    expect(d.doubleSided).toBe(true);
  });

  it('keeps a plain flat piece flat', () => {
    const r = rounds(rows(['ch8'], ['X*8', 3]), 'flat', 'chain');
    const d = prepareRender(r, { method: 'flat', start: 'chain', stuffed: false }, true)!;
    expect(d.doubleSided).toBe(true);
    const ring = d.rings.get(4)!;
    // The last row is still close to a straight line across.
    const ends = [ring[0], ring[ring.length - 1]];
    const span = Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1], ends[1][2] - ends[0][2]);
    expect(span).toBeGreaterThan(5);
  });

  it('bends a flat row that increases into every stitch', () => {
    const r = rounds(rows(['ch20'], ['X*20'], ['V*20']), 'flat', 'chain');
    const d = prepareRender(r, { method: 'flat', start: 'chain', stuffed: false }, true)!;
    const ring = d.rings.get(3)!;
    const a = ring[0], b = ring[ring.length - 1];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L = Math.hypot(...ab);
    // Distance of each point from the straight line a–b: a curved or ruffled row strays from it.
    const off = Math.max(...ring.map((p) => {
      const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
      const t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (L * L);
      return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
    }));
    expect(off).toBeGreaterThan(1);
    // and the row is shorter end to end than its 40 stitches laid straight
    expect(L).toBeLessThan(38);
  });

  it('starts a round at the chosen stitch of the round below', () => {
    const plain = rounds(rows(['6X'], ['(V)*6'], ['X*12']));
    const shifted = analyze([...rows(['6X'], ['(V)*6']), { id: 'r2', text: 'X*12', repeat: 1, note: '', startAt: 7 }], { method: 'spiral', start: 'ring' })
      .rounds.map((info) => ({ info, hexes: info.stitches.map(() => '#E8833A') }));
    const a = prepareRender(plain, { method: 'spiral', start: 'ring', stuffed: false }, true)!;
    const b = prepareRender(shifted, { method: 'spiral', start: 'ring', stuffed: false }, true)!;
    const first = (d: typeof a) => d.placements.find((p) => p.roundNo === 3 && p.index === 0)!.pos;
    // The first stitch of round 3 sits on the far side when it starts at stitch 7 of 12.
    const pa = first(a), pb = first(b);
    expect(pa[0] * pb[0] + pa[2] * pb[2]).toBeLessThan(0);
  });
});
