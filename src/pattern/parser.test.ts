import { describe, expect, it } from 'vitest';
import { parseRound, splitRoundPrefix, toChinese } from './parser';
import { analyze, type PatternRow } from './analyze';

const codes = (s: string) => parseRound(s).stitches.map((x) => x.code).join(' ');

describe('parseRound', () => {
  it('reads single stitches and counts', () => {
    const r = parseRound('X*6');
    expect(r.errors).toEqual([]);
    expect(r.stitches).toHaveLength(6);
    expect(r.consumed).toBe(6);
    expect(r.produced).toBe(6);
  });

  it('reads a count prefix', () => {
    expect(codes('6X')).toBe('X X X X X X');
  });

  it('reads a number glued to a stitch as a repeat', () => {
    expect(parseRound('ch10').stitches).toHaveLength(10);
    expect(parseRound('鎖針3').stitches).toHaveLength(3);
    expect(parseRound('X 6').errors).toHaveLength(1);
  });

  it('treats FV as one stitch (長針加針), longest match first', () => {
    const r = parseRound('(FV)*6');
    expect(r.stitches.every((s) => s.code === 'FV')).toBe(true);
    expect(r.consumed).toBe(6);
    expect(r.produced).toBe(12);
  });

  it('repeats groups', () => {
    const r = parseRound('(X,V)*6');
    expect(r.stitches).toHaveLength(12);
    expect(r.consumed).toBe(12);
    expect(r.produced).toBe(18);
  });

  it('supports nested repeats', () => {
    const r = parseRound('((X)*2,V)*6');
    expect(r.consumed).toBe(18);
    expect(r.produced).toBe(24);
  });

  it('handles decreases', () => {
    const r = parseRound('(X*3,A)*5');
    expect(r.consumed).toBe(25);
    expect(r.produced).toBe(20);
  });

  it('works several stitches into the same stitch', () => {
    const r = parseRound('[3F]');
    expect(r.stitches).toHaveLength(3);
    expect(new Set(r.stitches.map((s) => s.group)).size).toBe(1);
    expect(r.consumed).toBe(1);
    expect(r.produced).toBe(3);
    const r2 = parseRound('[2ch,F]*4');
    expect(r2.consumed).toBe(4);
    expect(r2.produced).toBe(12);
    expect(new Set(r2.stitches.map((s) => s.group)).size).toBe(4);
  });

  it('applies loop modifiers', () => {
    const r = parseRound('BLO(X*30)');
    expect(r.stitches).toHaveLength(30);
    expect(r.stitches.every((s) => s.mod === 'BLO')).toBe(true);
    expect(parseRound('FLO X, X').stitches.map((s) => s.mod ?? '-').join('')).toBe('FLO-');
  });

  it('reads Chinese input the same as codes', () => {
    expect(codes('短針*6')).toBe(codes('X*6'));
    expect(codes('(長針加針)*6')).toBe(codes('(FV)*6'));
    expect(codes('（短針，加針）×6')).toBe(codes('(X,V)*6'));
    expect(parseRound('後半針(短針*30)').stitches.every((s) => s.mod === 'BLO')).toBe(true);
  });

  it('recognises the magic ring prefix', () => {
    const r = parseRound('魔術環 6X');
    expect(r.magicRing).toBe(true);
    expect(r.produced).toBe(6);
  });

  it('counts special stitches', () => {
    expect(parseRound('S').produced).toBe(5);
    expect(parseRound('sk').produced).toBe(0);
    expect(parseRound('X,pc').consumed).toBe(1);
    expect(parseRound('CF*3').consumed).toBe(6);
  });

  it('reports syntax errors in Chinese with a position', () => {
    expect(parseRound('(X,V*6').errors[0].message).toContain('沒有對應');
    expect(parseRound('X*').errors[0].message).toContain('次數');
    expect(parseRound('X?').errors[0]).toEqual({ message: '看不懂「?」', at: 1 });
    expect(parseRound('X)').errors[0].message).toContain('多了');
  });

  it('lets a modifier take a count', () => {
    const r = parseRound('BLO 30X');
    expect(r.stitches).toHaveLength(30);
    expect(r.stitches.every((s) => s.mod === 'BLO')).toBe(true);
    expect(parseRound('後半針 6X').stitches).toHaveLength(6);
  });

  it('stops runaway repeats quickly', () => {
    const t0 = Date.now();
    expect(parseRound('((X*999)*999)*999').errors[0].message).toContain('5000');
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('accepts full-width digits', () => {
    expect(parseRound('X*６').stitches).toHaveLength(6);
  });
});

describe('splitRoundPrefix', () => {
  it('reads round ranges', () => {
    expect(splitRoundPrefix('R8-R12: X*30')).toEqual({ from: 8, to: 12, text: 'X*30' });
    expect(splitRoundPrefix('R3：(X,V)*6')).toEqual({ from: 3, to: 3, text: '(X,V)*6' });
    expect(splitRoundPrefix('第5圈: X*30')).toEqual({ from: 5, to: 5, text: 'X*30' });
    expect(splitRoundPrefix('X*30')).toEqual({ text: 'X*30' });
  });
});

describe('toChinese', () => {
  it('rewrites codes as names', () => {
    expect(toChinese('(X,V)*6')).toBe('(短針,短針加針)*6');
    expect(toChinese('BLO(FV)')).toBe('後半針(長針加針)');
  });
});

describe('analyze', () => {
  const row = (text: string, repeat = 1): PatternRow => ({ id: text + repeat, text, repeat, note: '' });
  const ring = { method: 'spiral' as const, start: 'ring' as const };

  it('checks a classic ball', () => {
    const a = analyze([row('6X'), row('(V)*6'), row('(X,V)*6'), row('X*18', 3), row('(X,A)*6'), row('(A)*6')], ring);
    expect(a.problems).toBe(0);
    expect(a.rounds.map((r) => r.produced)).toEqual([6, 12, 18, 18, 18, 18, 12, 6]);
    expect(a.rows[3].first).toBe(4);
    expect(a.rows[3].last).toBe(6);
    expect(a.maxStitches).toBe(18);
  });

  it('flags a short round with the exact difference', () => {
    const a = analyze([row('6X'), row('(V)*6'), row('(X,V)*6'), row('(X*2,V)*6'), row('(X*3,V)*6'), row('(X*3,A)*5')], ring);
    const last = a.rounds[a.rounds.length - 1];
    expect(last.status).toBe('short');
    expect(last.message).toBe('上一圈 30 針，這圈只用掉 25 針，還差 5 針');
    expect(a.problems).toBe(1);
  });

  it('flags a round that uses too many', () => {
    const a = analyze([row('6X'), row('X*8')], ring);
    expect(a.rounds[1].status).toBe('over');
  });

  it('doubles a chain foundation for an oval', () => {
    const a = analyze([row('ch10'), row('X*20')], { method: 'spiral', start: 'chain' });
    expect(a.rounds[0].foundation).toBe(10);
    expect(a.rounds[1].status).toBe('ok');
    const flat = analyze([row('ch10'), row('X*10')], { method: 'flat', start: 'chain' });
    expect(flat.rounds[1].status).toBe('ok');
  });

  it('finds the chain foundation after a blank first row', () => {
    const a = analyze([row(''), row('ch10'), row('X*20')], { method: 'spiral', start: 'chain' });
    expect(a.rounds[1].foundation).toBe(10);
    expect(a.rounds[2].status).toBe('ok');
  });

  it('detects back-loop rounds', () => {
    const a = analyze([row('6X'), row('BLO(X*6)')], ring);
    expect(a.rounds[1].loopOnly).toBe('BLO');
  });

  it('skips empty and broken rounds when counting', () => {
    const a = analyze([row('6X'), row(''), row('(X'), row('V*6')], ring);
    expect(a.rounds[1].status).toBe('empty');
    expect(a.rounds[2].status).toBe('syntax');
    expect(a.rounds[3].status).toBe('ok');
  });
});
