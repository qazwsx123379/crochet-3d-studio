import { describe, expect, it } from 'vitest';
import { analyze, type PatternRow } from '../pattern/analyze';
import { buildProfile, buildShape, stadium, type ShapeRound } from './geometry';

const rows = (...t: [string, number?][]): PatternRow[] => t.map(([text, repeat], i) => ({ id: 'r' + i, text, repeat: repeat ?? 1, note: '' }));
function shape(rs: PatternRow[], method: 'spiral' | 'flat' = 'spiral', start: 'ring' | 'chain' = 'ring', stuffed = false) {
  const a = analyze(rs, { method, start });
  const rounds: ShapeRound[] = a.rounds.map((info) => ({ info, hexes: info.stitches.map(() => '#E8833A') }));
  return { a, rounds, opts: { method, start, stuffed } };
}

describe('buildProfile', () => {
  it('lays increase rounds flat and straight rounds upright', () => {
    const s = shape(rows(['6X'], ['(V)*6'], ['(X,V)*6'], ['X*18', 4]));
    const { profile } = buildProfile(s.rounds, s.opts);
    // Increase rounds barely rise.
    expect(profile[3].y - profile[2].y).toBeLessThan(0.5);
    // Constant rounds rise a full stitch height and keep their radius.
    expect(profile[5].y - profile[4].y).toBeCloseTo(1, 5);
    expect(profile[5].r).toBeCloseTo(profile[4].r, 5);
    expect(profile[4].r).toBeCloseTo(18 / (2 * Math.PI), 5);
  });

  it('closes a ball that is decreased to 6 stitches', () => {
    const s = shape(rows(['6X'], ['(V)*6'], ['(X,V)*6'], ['X*18', 3], ['(X,A)*6'], ['(A)*6']));
    const { profile } = buildProfile(s.rounds, s.opts);
    expect(profile[profile.length - 1].r).toBe(0);
  });

  it('stuffing makes a closed shape rounder and wider', () => {
    const r = rows(['6X'], ['(V)*6'], ['(X,V)*6'], ['X*18', 3], ['(X,A)*6'], ['(A)*6']);
    const flat = buildProfile(shape(r).rounds, shape(r).opts).profile;
    const s = shape(r, 'spiral', 'ring', true);
    const stuffed = buildProfile(s.rounds, s.opts).profile;
    expect(Math.max(...stuffed.map((p) => p.r))).toBeGreaterThan(Math.max(...flat.map((p) => p.r)));
  });

  it('uses the foundation chain as the straight part of an oval', () => {
    const s = shape(rows(['ch10'], ['X*20'], ['X*20']), 'spiral', 'chain');
    const { straight, profile } = buildProfile(s.rounds, s.opts);
    expect(straight).toBe(9);
    expect(profile[1].r).toBeGreaterThan(0);
  });
});

describe('stadium', () => {
  it('is a circle when the straight part is zero', () => {
    const p = stadium(0.3, 2, 0);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(2, 6);
  });
  it('has the expected perimeter points', () => {
    const p = stadium(0, 1, 4);
    expect(p.x).toBeCloseTo(2, 6);
    expect(p.z).toBeCloseTo(-1, 6);
  });
});

describe('buildShape', () => {
  it('makes one placement per real stitch and pickable faces', () => {
    const s = shape(rows(['6X'], ['(V)*6']));
    const b = buildShape(s.rounds, s.opts)!;
    expect(b.placements).toHaveLength(6 + 6);
    expect(b.faceRound.length * 9).toBe(b.positions.length);
    expect(new Set(b.faceRound)).toEqual(new Set([1, 2]));
  });
  it('builds flat pieces as a sheet', () => {
    const s = shape(rows(['ch8'], ['X*8', 3]), 'flat', 'chain');
    const b = buildShape(s.rounds, s.opts)!;
    expect(b.kind).toBe('flat');
    expect(b.rings.size).toBe(4);
  });
  it('returns null with nothing to draw', () => {
    expect(buildShape([], { method: 'spiral', start: 'ring', stuffed: false })).toBeNull();
  });
});
