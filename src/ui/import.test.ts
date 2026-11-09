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
