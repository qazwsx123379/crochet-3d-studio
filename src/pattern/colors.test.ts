import { describe, expect, it } from 'vitest';
import { analyze } from './analyze';
import { colorChangeText, colorChanges, stitchKey, roundKey } from './colors';
import type { Part } from '../types';

const part = (over: Partial<Part>): Part => ({
  id: 'p', name: 'p', tags: [], updatedAt: 0, settings: { method: 'spiral', start: 'ring', yarn: '', hook: 3 },
  rows: [{ id: 'a', text: '6X', repeat: 1, note: '' }, { id: 'b', text: 'X*6', repeat: 2, note: '' }, { id: 'c', text: 'X*6', repeat: 1, note: '' }],
  palette: [{ id: 'o', name: '南瓜橘', hex: '#E8833A', brand: '', code: '' }, { id: 'k', name: '黑', hex: '#2B2B2B', brand: '', code: '' }],
  stitchColors: {}, roundColors: {}, ...over,
});

describe('colorChanges', () => {
  it('describes colour runs inside a round and whole-round switches', () => {
    const p0 = part({});
    const a = analyze(p0.rows, p0.settings);
    const r2 = a.rounds[1], r4 = a.rounds[3];
    const p = part({ stitchColors: { [stitchKey(r2, 3)]: 'k', [stitchKey(r2, 4)]: 'k' }, roundColors: { [roundKey(r4)]: 'k' } });
    const ch = colorChanges(p, a.rounds);
    expect([...ch.keys()]).toEqual([2, 4]);
    expect(colorChangeText(ch.get(2)!)).toBe('第 1–3 針「南瓜橘」 → 第 4–5 針「黑」 → 第 6 針「南瓜橘」');
    expect(colorChangeText(ch.get(4)!)).toBe('這圈換成「黑」');
  });
  it('says nothing for a piece in one colour', () => {
    const p = part({});
    expect(colorChanges(p, analyze(p.rows, p.settings).rounds).size).toBe(0);
  });
});
