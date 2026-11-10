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
  return [head, stem, hat, coaster, swatch, sole, ...collarParts(), ...tartParts()];
}

/** Colour chosen stitches of one round. */
function stitchesOf(prefix: string, rowNo: number, idx: number[], colorId: string): Record<string, string> {
  return Object.fromEntries(idx.map((i) => [`${prefix}-r${rowNo}#0#${i}`, colorId]));
}
const every = (n: number, step: number, from = 0) => Array.from({ length: Math.ceil((n - from) / step) }, (_, k) => from + k * step);

/**
 * Two pet collars copied from patterns shared online, written the way the
 * originals were (lower-case codes, k1, 起立, 未完成, 到底), to prove the
 * editor can take them as they are.
 */
export function collarParts(): Part[] {
  const brown = c('br', '焦糖棕', '#9A5A2E');
  const flat = { method: 'flat' as const, start: 'chain' as const, yarn: 'HAPPY 牛奶棉', hook: 3 };
  const burger: Part = {
    ...base, id: 'sample-burger-base', name: '漢堡圍脖・底片', tags: ['寵物圍脖', '片織'],
    settings: flat,
    palette: [brown, c('w', '奶油白', '#F6F1E4')],
    rows: rows('burger', [
      ['63ch', 1, '棕色起針 63 個鎖針'],
      ['60F', 1, '倒數第 4 針開始鉤 60 長針（起針多的 3 針當起立）'],
      ['起立2ch,内半针60F', 2, '只鉤內半針，留下的外半針之後鉤花邊'],
      ['(x,k1,[6F],k1)*15', 1, '貝殼邊'],
      ['(x,3ch)*到底', 1, '換白色'],
    ]),
    roundColors: { 'burger-r5#0': 'w' },
  };
  const loops = (n: number) => `${n}ch`;
  const edge = (id: string, name: string, color: YarnColor, text: string, note: string): Part => ({
    ...base, id: `sample-burger-${id}`, name: `漢堡圍脖・${name}`, tags: ['寵物圍脖', '花邊'],
    settings: flat,
    palette: [color],
    rows: rows(`burger-${id}`, [[loops(60), 1, '代表底片留下的 60 個外半針（不用另外鉤）'], [text, 1, note]]),
    roundColors: {},
  });
  const lettuce = edge('lettuce', '生菜花邊', c('g', '生菜綠', '#7DB343'), '(1ch,3个未完成中长针,ch,k1)*到底', '在底片第 3 排的外半針上鉤');
  const cheese = edge('cheese', '起司花邊', c('y', '起司黃', '#F6CF45'), '(x,t,f,[e,1ch,e],f,t,x)*到底', '在底片第 4 排的外半針上鉤');
  const ketchup = edge('ketchup', '番茄醬花邊', c('r', '番茄紅', '#D9281E'), '60x', '在底片第 2 排的外半針上鉤');
  const tomato: Part = {
    ...base, id: 'sample-burger-tomato', name: '漢堡圍脖・番茄片', tags: ['寵物圍脖'],
    settings: { method: 'joined', start: 'ring', yarn: 'HAPPY 牛奶棉', hook: 3 },
    palette: [c('r', '番茄紅', '#D9281E'), c('y', '番茄籽黃', '#F6CF45')],
    rows: rows('tomato', [['6x'], ['6v'], ['6(x,v)'], ['6(x,v,x)'], ['6(3x,v)', 1, '鉤 4 片；黃色是表面繡的籽']]),
    roundColors: {},
    stitchColors: { ...stitchesOf('tomato', 2, every(12, 2), 'y'), ...stitchesOf('tomato', 3, every(18, 3, 1), 'y'), ...stitchesOf('tomato', 4, every(24, 4, 1), 'y') },
  };
  const tie: Part = {
    ...base, id: 'sample-burger-tie', name: '漢堡圍脖・繫帶', tags: ['寵物圍脖'],
    settings: flat,
    palette: [c('r', '番茄紅', '#D9281E')],
    rows: rows('tie', [['150ch', 1, '45ch，沿底片第 1 排鉤 60x，再 45ch'], ['150sl']]),
    roundColors: {},
  };

  const pink = c('pk', '草莓粉', '#F4B6C2');
  const cake: Part = {
    ...base, id: 'sample-cake', name: '草莓蛋糕圍脖', tags: ['寵物圍脖', '片織'],
    settings: flat,
    palette: [pink, c('br', '巧克力', '#8A4B2A'), c('cr', '奶油黃', '#F5E3A8'), c('w', '鮮奶油白', '#FBF8F0')],
    rows: rows('cake', [
      ['69ch', 1, '粉色起針 69 個鎖針'],
      ['67F', 1, '倒數第 3 針開始鉤 67 長針'],
      ['(FV,F,FV,k1)*到底', 1, '最後剩下的針不鉤'],
      ['(5x,{2x})*16', 1, '5 短針鉤在上一排的 5 針上，2 短針鉤在跳過的空隙裡'],
      ['(2F,FV,2F,7ch,k2)*16', 1, '6 長針做成奶油花，接著 7 鎖針跨過 2 針'],
      ['(k6,7x,1ch)*16', 1, '7 短針鉤在 7 鎖針上，奶油花留著不鉤'],
      ['(x,xv)*到底'],
    ]),
    roundColors: { 'cake-r2#0': 'br', 'cake-r3#0': 'cr', 'cake-r4#0': 'w', 'cake-r5#0': 'w', 'cake-r6#0': 'pk', 'cake-r7#0': 'pk' },
    stitchColors: Object.fromEntries(Array.from({ length: 16 }, (_, g) => Array.from({ length: 7 }, (_, k) => [`cake-r5#0#${g * 14 + 6 + k}`, 'pk'])).flat()),
  };
  const cherry: Part = {
    ...base, id: 'sample-cherry', name: '櫻桃', tags: ['寵物圍脖'],
    settings: { method: 'spiral', start: 'ring', yarn: 'HAPPY 牛奶棉', hook: 3 },
    palette: [c('r', '櫻桃紅', '#D3202F')],
    rows: rows('cherry', [['环起3ch,四个未完成长针,1ch', 1, '鉤針穿過線圈拉緊；做 16 顆']]),
    roundColors: {},
  };
  return [burger, lettuce, cheese, ketchup, tomato, tie, cake, cherry];
}

export function sampleWorks(): Work[] {
  return [
    { id: 'sample-work-pumpkin', name: '萬聖節南瓜', partIds: ['sample-head', 'sample-stem', 'sample-hat'], tags: ['萬聖節'], updatedAt: 0, sample: true },
    { id: 'sample-work-small', name: '小物練習', partIds: ['sample-coaster', 'sample-swatch', 'sample-sole'], tags: ['杯墊', '片織'], updatedAt: 0, sample: true },
    ...collarWorks(),
    ...tartWorks(),
  ];
}

/** Sample ids added after the first release, given once to accounts that already exist. */
export const SAMPLE_VERSION = 3;
export function collarWorks(): Work[] {
  return [
    { id: 'sample-work-burger', name: '漢堡圍脖', partIds: ['sample-burger-base', 'sample-burger-lettuce', 'sample-burger-cheese', 'sample-burger-ketchup', 'sample-burger-tomato', 'sample-burger-tie'], tags: ['寵物圍脖'], updatedAt: 0, sample: true },
    { id: 'sample-work-cake', name: '草莓蛋糕圍脖', partIds: ['sample-cake', 'sample-cherry'], tags: ['寵物圍脖'], updatedAt: 0, sample: true },
  ];
}

/**
 * 草莓奶油塔, typed the way the original chart writes it (外钩2F, 正常钩F,
 * 钩5个未完成F, 钩R2的内半针, 倒2钩2X, 3CH 起立…).
 */
export function tartParts(): Part[] {
  const su = (id: string, name: string, hex: string, code: string): YarnColor => ({ id, name, hex, brand: '蘇蘇姐家 4 股唯棉', code });
  const white = su('w', '乳白色', '#F6F1E6', '06');
  const brown = su('b', '淺棕色', '#C48A4A', '23');
  const green = su('g', '艾綠色', '#6E8F3A', '37');
  const red = su('r', '紅色', '#D3232B', '51');
  const ring = { method: 'spiral' as const, start: 'ring' as const, yarn: '唯棉', hook: 2 };
  const top: Part = {
    ...base, id: 'sample-tart-top', name: '奶油塔・白色撻面', tags: ['草莓奶油塔'], settings: ring, palette: [white],
    rows: [
      ...rows('tart-top', [['环起10T'], ['10TV'], ['10(T, TV)'], ['10(T, TV, T)'], ['翻转织片钩内半针 13(SL, 3CH, 钩5个未完成F, k)', 1, '奶油花：翻面鉤 R4 的內半針']]),
      { id: 'tart-top-r6', text: '9(V, 3X), 2(V, X)', repeat: 1, note: '鉤在 R4 留下的外半針上', base: 4 },
    ],
    roundColors: {},
  };
  const crust: Part = {
    ...base, id: 'sample-tart-crust', name: '奶油塔・蛋撻皮', tags: ['草莓奶油塔'], settings: ring, palette: [brown],
    rows: rows('tart-crust', [
      ['环起10X'], ['10V'], ['20X'], ['10(X, V)'], ['30X'], ['10(2X, V)'],
      ['钩内半针9(FV, 3F), 2(FV, F)', 1, '只鉤內半針，撻皮立起來'],
      ['17(外钩2F, 正常钩F)', 1, '留長線斷線，挑外半針和撻面縫合'],
      ['3CH, 17(外钩2F, 正常钩F)', 1, '塞棉縫合後重新取線'],
      ['17(外钩FV, 外钩F, 正常SL)', 1, '花邊'],
    ]),
    roundColors: {},
  };
  const matcha: Part = {
    ...base, id: 'sample-tart-matcha', name: '奶油塔・抹茶奶油', tags: ['草莓奶油塔'],
    settings: { method: 'flat', start: 'chain', yarn: '唯棉', hook: 2, roll: true }, palette: [green],
    rows: rows('tart-matcha', [['起111CH'], ['钩里山110X'], ['钩R2的内半针 110X'], ['钩R2的外半针 110X', 1, '鉤完捲起來']]),
    roundColors: {},
  };
  const big: Part = {
    ...base, id: 'sample-tart-big', name: '奶油塔・大草莓', tags: ['草莓奶油塔'], settings: ring, palette: [red],
    rows: rows('tart-big', [['环起6X'], ['3(X, V)'], ['3(X, V, X)'], ['3(3X, V)'], ['3(2X, V, 2X)'], ['3(5X, V)'], ['7(X, A)'], ['7A', 1, '草莓點點取乳白色線縫上去']]),
    roundColors: {},
  };
  const small: Part = {
    ...base, id: 'sample-tart-small', name: '奶油塔・小草莓', tags: ['草莓奶油塔'], settings: ring, palette: [red],
    rows: rows('tart-small', [['环起6X'], ['3(X, V)'], ['3(X, V, X)'], ['3(3X, V)'], ['15X'], ['5(X, A)', 1, '留線，挑外半針塞棉縫合；做 5 個，不鉤蒂']]),
    roundColors: {},
  };
  const calyx: Part = {
    ...base, id: 'sample-tart-calyx', name: '奶油塔・草莓蒂', tags: ['草莓奶油塔'],
    settings: { method: 'joined', start: 'ring', yarn: '唯棉', hook: 2 }, palette: [green],
    rows: rows('tart-calyx', [['环起钩5(3CH, 倒2钩2X, SL)', 1, '縫在大草莓頂端']]),
    roundColors: {},
  };
  return [top, crust, matcha, big, small, calyx];
}

export function tartWorks(): Work[] {
  return [{ id: 'sample-work-tart', name: '草莓奶油塔', partIds: ['sample-tart-crust', 'sample-tart-top', 'sample-tart-small', 'sample-tart-matcha', 'sample-tart-big', 'sample-tart-calyx'], tags: ['草莓奶油塔'], updatedAt: 0, sample: true }];
}
