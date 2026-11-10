import { describe, expect, it } from 'vitest';
import { linesToRows } from './ImportDialog';

describe('linesToRows', () => {
  it('reads pasted patterns with ranges, counts and notes', () => {
    const rows = linesToRows('R1: 魔術環 6X (6)\nR2: (V)*6\n\nR4-R8: X*18  # 開始塞棉花\n(X,A)*6');
    expect(rows.map((r) => [r.text, r.repeat, r.note])).toEqual([
      ['魔術環 6X', 1, ''],
      ['(V)*6', 1, ''],
      ['X*18', 5, '開始塞棉花'],
      ['(X,A)*6', 1, ''],
    ]);
  });
});

import { analyze } from '../pattern/analyze';
describe('pasting patterns from Chinese posts', () => {
  it('reads the hamburger base as written', () => {
    const rows = linesToRows('底片\n1. 棕色63ch\n2. 倒三回60F\n3. 棕色起立2ch，内半针60F\n4. 棕色起立2ch，内半针60F\n5. 棕色x ,k1,[6F],k1\n6. 白色x,3ch');
    expect(rows.map((r) => r.text)).toEqual(['63ch', '60F', '起立2ch,内半针60F', '起立2ch,内半针60F', 'x ,k1,[6F],k1', 'x,3ch']);
    expect(rows[0].note).toContain('底片');
    expect(rows[0].note).toContain('換棕色');
    expect(rows[5].note).toContain('換白色');
  });
  it('reads 「69起针倒3钩67F」', () => {
    const rows = linesToRows('R1:69起针倒3钩67F\nR2:(FV,F,FV,K1)*到底');
    expect(rows.map((r) => r.text)).toEqual(['69ch', '67F', '(FV,F,FV,K1)*到底']);
    expect(rows[1].note).toContain('倒數第 3 針');
    const a = analyze(rows, { method: 'flat', start: 'chain' });
    expect(a.problems).toBe(0);
  });
});
