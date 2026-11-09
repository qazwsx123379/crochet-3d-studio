import type { Part, Work, YarnColor } from '../types';
import type { PatternRow } from '../pattern/analyze';

/** Example parts shown on first launch, marked 範例 so they are never mistaken for the owner's own. */

const c = (id: string, name: string, hex: string, brand = 'HAPPY 牛奶棉'): YarnColor => ({ id, name, hex, brand, code: '' });

function rows(prefix: string, list: [string, number?, string?][]): PatternRow[] {
  return list.map(([text, repeat, note], i) => ({ id: `${prefix}-r${i + 1}`, text, repeat: repeat ?? 1, note: note ?? '' }));
}

/** Colour every round of a row. */
function roundsOf(prefix: string, rowNo: number, repeat: number, colorId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let k = 0; k < repeat; k++) out[`${prefix}-r${rowNo}#${k}`] = colorId;
  return out;
}

const base = { tags: [] as string[], updatedAt: 0, sample: true, stitchColors: {} as Record<string, string> };

export function sampleParts(): Part[] {
  const head: Part = {
    ...base, id: 'sample-head', name: '南瓜頭', tags: ['萬聖節', '玩偶'],
    settings: { method: 'spiral', start: 'ring', yarn: 'HAPPY 牛奶棉', hook: 3 },
    palette: [c('o', '南瓜橘', '#E8833A'), c('l', '淺橘', '#F2A766'), c('k', '黑', '#2B2B2B')],
    rows: rows('head', [
      ['6X'], ['(V)*6'], ['(X,V)*6'], ['(X*2,V)*6'], ['(X*3,V)*6'], ['(X*4,V)*6'],
      ['X*36', 6, '第 9 圈放安全眼，間隔 6 針'],
      ['(X*4,A)*6', 1, '開始塞棉花'], ['(X*3,A)*6'], ['(X*2,A)*6'], ['(X,A)*6'], ['(A)*6', 1, '收口'],
    ]),
    roundColors: { ...roundsOf('head', 7, 6, 'o'), 'head-r7#1': 'l', 'head-r7#4': 'l' },
    stitchColors: {},
  };
  const stem: Part = {
    ...base, id: 'sample-stem', name: '蒂頭', tags: ['萬聖節'],
    settings: { method: 'spiral', start: 'ring', yarn: '唯棉', hook: 3 },
    palette: [c('g', '葉綠', '#3E6B48', '唯棉')],
    rows: rows('stem', [['6X'], ['X*6', 4]]),
    roundColors: {},
  };
  const hat: Part = {
    ...base, id: 'sample-hat', name: '巫師帽', tags: ['萬聖節'],
    settings: { method: 'spiral', start: 'ring', yarn: '唯棉', hook: 3, flip: true },
    palette: [c('p', '巫師紫', '#6B4E9B', '唯棉'), c('o', '南瓜橘', '#E8833A')],
    rows: rows('hat', [
      ['4X'], ['(X,V)*2'], ['(X*2,V)*2'], ['(X*3,V)*2'], ['X*10'], ['(X*4,V)*2'], ['(X*2,V)*4'], ['X*16'],
      ['(X*3,V)*4'], ['X*20'], ['(X*4,V)*4'], ['X*24', 2], ['FLO((X,V)*12)', 1, '帽簷：只鉤前半針'], ['(X*2,V)*12'], ['X*48'],
    ]),
    roundColors: roundsOf('hat', 12, 2, 'o'),
  };
  const coaster: Part = {
    ...base, id: 'sample-coaster', name: '條紋杯墊', tags: ['杯墊'],
    settings: { method: 'joined', start: 'ring', yarn: 'EX991 多股紗', hook: 4 },
    palette: [c('b', '深藍', '#3E6B8C', 'EX991 多股紗'), c('w', '燕麥', '#D8C8AE', 'EX991 多股紗')],
    rows: rows('coaster', [['12F'], ['(FV)*12'], ['(F,FV)*12'], ['(F*2,FV)*12'], ['(F*3,FV)*12']]),
    roundColors: { 'coaster-r2#0': 'w', 'coaster-r4#0': 'w' },
  };
  const swatch: Part = {
    ...base, id: 'sample-swatch', name: '條紋方塊', tags: ['片織'],
    settings: { method: 'flat', start: 'chain', yarn: 'HAPPY 牛奶棉', hook: 3 },
    palette: [c('pk', '櫻花粉', '#F2B8C6'), c('w', '奶油白', '#F4EEDF')],
    rows: rows('swatch', [['ch16'], ['X*16', 4], ['X*16', 4], ['X*16', 4]]),
    roundColors: { ...roundsOf('swatch', 3, 4, 'w') },
  };
  const sole: Part = {
    ...base, id: 'sample-sole', name: '小鞋底', tags: ['送禮'],
    settings: { method: 'spiral', start: 'chain', yarn: 'HAPPY 牛奶棉', hook: 3 },
    palette: [c('s', '天空藍', '#8FB6D8')],
    rows: rows('sole', [['ch10', 1, '起針 10 個鎖針，兩側往返鉤'], ['X*20'], ['(V,X*8,V)*2'], ['(X,V,X*8,V,X)*2'], ['BLO(X*28)', 1, '只鉤後半針，鞋底轉角'], ['X*28', 3]]),
    roundColors: {},
  };
  return [head, stem, hat, coaster, swatch, sole];
}

export function sampleWorks(): Work[] {
  return [
    { id: 'sample-work-pumpkin', name: '萬聖節南瓜', partIds: ['sample-head', 'sample-stem', 'sample-hat'], tags: ['萬聖節'], updatedAt: 0, sample: true },
    { id: 'sample-work-small', name: '小物練習', partIds: ['sample-coaster', 'sample-swatch', 'sample-sole'], tags: ['杯墊', '片織'], updatedAt: 0, sample: true },
  ];
}
