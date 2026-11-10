import { describe, expect, it } from 'vitest';
import { parseRound } from './parser';
import { analyze, type PatternRow } from './analyze';

const rows = (list: string[]): PatternRow[] => list.map((text, i) => ({ id: `r${i}`, text, repeat: 1, note: '' }));

describe('patterns copied from Chinese social posts', () => {
  it('reads lower-case codes, simplified names and k1', () => {
    expect(parseRound('6(x,v)').produced).toBe(18);
    expect(parseRound('3x,v').produced).toBe(5);
    expect(parseRound('x,k1,[6F],k1')).toMatchObject({ consumed: 4, produced: 7 });
    expect(parseRound('(x,xv)*2')).toMatchObject({ consumed: 4, produced: 6 });
    expect(parseRound('60x').produced).toBe(60);
    expect(parseRound('短针,长针,中长针,锁针').stitches.map((s) => s.code)).toEqual(['X', 'F', 'T', 'ch']);
    expect(parseRound('内半针 60F').stitches.every((s) => s.mod === 'BLO')).toBe(true);
  });
  it('treats 起立 chains as not counting', () => {
    const r = parseRound('起立2ch, BLO 60F');
    expect(r).toMatchObject({ consumed: 60, produced: 60 });
    expect(r.stitches.filter((s) => s.code === 'tch')).toHaveLength(2);
  });
  it('reads 「3个未完成中长针」 as one puff and 「四个未完成长针」 as one bobble', () => {
    expect(parseRound('1ch,3个未完成中长针,ch,k1').stitches.map((s) => s.code)).toEqual(['ch', 'Q', 'ch', 'sk']);
    expect(parseRound('环起3ch,四个未完成长针,1ch')).toMatchObject({ magicRing: true });
    expect(parseRound('四个未完成长针').stitches.map((s) => s.code)).toEqual(['B']);
  });
  it('fits a 到底 repeat to the stitches below and allows a short remainder', () => {
    const a = analyze(rows(['ch69', '67F', '(FV,F,FV,k1)*到底']), { method: 'flat', start: 'chain' });
    expect(a.rounds[1].status).toBe('ok');
    expect(a.rounds[1].message).toMatch('起立針');
    expect(a.rounds[2].status).toBe('ok');
    expect(a.rounds[2].produced).toBe(16 * 5);
    expect(a.rounds[2].message).toMatch('重複 16 次');
  });
  it('stitches in {braces} go into a gap and use nothing below', () => {
    expect(parseRound('(5X,{2X})*2')).toMatchObject({ consumed: 10, produced: 14 });
  });
  it('hamburger collar base adds up', () => {
    const a = analyze(rows(['63ch', '60F', '起立2ch,内半针60F', '起立2ch,内半针60F', '(x,k1,[6F],k1)*15', '(x,3ch)*到底']), { method: 'flat', start: 'chain' });
    expect(a.problems).toBe(0);
    expect(a.rounds[4].produced).toBe(105);
  });
  it('tomato slice adds up', () => {
    const a = analyze(rows(['6x', '6v', '6(x,v)', '6(x,v,x)', '6(3x,v)']), { method: 'joined', start: 'ring' });
    expect(a.problems).toBe(0);
    expect(a.rounds.map((r) => r.produced)).toEqual([6, 12, 18, 24, 30]);
  });
});

import { collarParts, tartParts } from '../store/samples';
describe('collar samples', () => {
  for (const p of [...collarParts(), ...tartParts()]) {
    it(`${p.name} has no counting problems`, () => {
      const a = analyze(p.rows, p.settings);
      const bad = a.rounds.filter((r) => r.status === 'syntax' || r.status === 'short' || r.status === 'over').map((r) => `R${r.no}: ${r.message}`);
      // The original tart chart's R5 (13 × 3 = 39 on 40 stitches) really is one short.
      expect(bad).toEqual(p.id === 'sample-tart-top' ? ['R5: 上一圈 40 針，這圈只用掉 39 針，還差 1 針'] : []);
    });
  }
});
