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

  it('draws flat pieces without relaxing', () => {
    const r = rounds(rows(['ch8'], ['X*8', 3]), 'flat', 'chain');
    const d = prepareRender(r, { method: 'flat', start: 'chain', stuffed: false }, true)!;
    expect(d.index).toBeUndefined();
    expect(d.doubleSided).toBe(true);
  });
});
