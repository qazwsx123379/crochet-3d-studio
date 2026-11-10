import { describe, expect, it } from 'vitest';
import { buildCombo, groupToken } from './ComboBuilder';
import { parseRound } from '../pattern/parser';

describe('buildCombo', () => {
  it('writes repeats, same-stitch groups and loop-only groups that parse', () => {
    const add = (t: string) => { const r = parseRound(t); expect(r.errors).toEqual([]); return r; };
    expect(buildCombo('repeat', ['X', 'V'], 6, 'BLO')).toBe('(X,V)*6');
    expect(buildCombo('repeat', ['X', 'X', 'A'], 6, 'BLO')).toBe('(X*2,A)*6');
    expect(buildCombo('repeat', ['FV'], 6, 'BLO')).toBe('FV*6');
    expect(buildCombo('repeat', ['X', 'X'], 3, 'BLO')).toBe('(X*2)*3');
    expect(buildCombo('same', ['F', 'F', 'F'], 1, 'BLO')).toBe('[3F]');
    expect(buildCombo('same', ['ch', 'ch', 'F'], 4, 'BLO')).toBe('[2ch,F]*4');
    expect(buildCombo('loop', ['X'], 30, 'BLO')).toBe('BLO(X*30)');
    expect(buildCombo('loop', ['X', 'V'], 6, 'FLO')).toBe('FLO((X,V)*6)');
    expect(add('(X*2)*3').stitches).toHaveLength(6);
    // A repeat holding a same-stitch group.
    const g = groupToken(['F', 'F']);
    expect(g).toBe('[2F]');
    expect(buildCombo('repeat', ['X', g], 6, 'BLO')).toBe('(X,[2F])*6');
    expect(buildCombo('repeat', ['sk', groupToken(['F', 'F', 'F', 'F', 'F']), 'sk', 'X'], 4, 'BLO')).toBe('(sk,[5F],sk,X)*4');
    expect(buildCombo('repeat', [g, g], 3, 'BLO')).toBe('([2F]*2)*3');
    const shell = add('(sk,[5F],sk,X)*4');
    expect([shell.consumed, shell.produced]).toEqual([16, 24]);
    expect(add('(X,[2F])*6').produced).toBe(18);
    expect(add('FLO((X,V)*6)').produced).toBe(18);
    expect(add('[2ch,F]*4').consumed).toBe(4);
  });
});
