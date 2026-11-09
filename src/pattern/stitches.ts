/**
 * The stitch library. Every stitch records how many stitches of the previous
 * round it uses (`consumes`) and how many it leaves for the next round
 * (`produces`). The parser and the stitch-count checker rely only on these
 * two numbers, so adding a stitch here is enough to support it everywhere.
 */

export type StitchShape =
  | 'chain' // a loose chain loop
  | 'slip' // flat, almost no height
  | 'post' // a regular standing stitch (sc, hdc, dc, tr)
  | 'bump' // a puffy stitch: bobble, popcorn, puff
  | 'fan' // several tall stitches from one base: shell
  | 'picot' // a small decorative loop
  | 'loop' // loop stitch
  | 'skip'; // nothing is worked

export interface StitchDef {
  /** Input code, e.g. `X`, `FV`. Case-sensitive. */
  code: string;
  /** Traditional Chinese name shown on buttons. */
  name: string;
  /** Short label for small buttons. */
  short: string;
  /** Extra Chinese words the parser also accepts. */
  aliases: string[];
  consumes: number;
  produces: number;
  /** Height relative to a single crochet (短針 = 1). */
  height: number;
  shape: StitchShape;
  /** Default keyboard shortcut (single key) or empty. */
  key: string;
  group: 'basic' | 'incdec' | 'fancy';
}

export const STITCHES: StitchDef[] = [
  { code: 'ch', name: '鎖針', short: '鎖針', aliases: ['鎖針'], consumes: 0, produces: 1, height: 0.5, shape: 'chain', key: 'c', group: 'basic' },
  { code: 'sl', name: '引拔', short: '引拔', aliases: ['引拔', '引拔針'], consumes: 1, produces: 1, height: 0.3, shape: 'slip', key: 's', group: 'basic' },
  { code: 'X', name: '短針', short: '短針', aliases: ['短針'], consumes: 1, produces: 1, height: 1, shape: 'post', key: 'x', group: 'basic' },
  { code: 'T', name: '中長針', short: '中長針', aliases: ['中長針'], consumes: 1, produces: 1, height: 1.5, shape: 'post', key: 't', group: 'basic' },
  { code: 'F', name: '長針', short: '長針', aliases: ['長針'], consumes: 1, produces: 1, height: 2, shape: 'post', key: 'f', group: 'basic' },
  { code: 'E', name: '長長針', short: '長長針', aliases: ['長長針'], consumes: 1, produces: 1, height: 2.6, shape: 'post', key: 'e', group: 'basic' },
  { code: 'V', name: '短針加針', short: '加針', aliases: ['短針加針', '加針'], consumes: 1, produces: 2, height: 1, shape: 'post', key: 'v', group: 'incdec' },
  { code: 'A', name: '短針減針', short: '減針', aliases: ['短針減針', '減針'], consumes: 2, produces: 1, height: 1, shape: 'post', key: 'a', group: 'incdec' },
  { code: 'FV', name: '長針加針', short: '長加', aliases: ['長針加針'], consumes: 1, produces: 2, height: 2, shape: 'post', key: '', group: 'incdec' },
  { code: 'FA', name: '長針減針', short: '長減', aliases: ['長針減針'], consumes: 2, produces: 1, height: 2, shape: 'post', key: '', group: 'incdec' },
  { code: 'Q', name: '棗型針', short: '棗型', aliases: ['棗型針', '棗形針'], consumes: 1, produces: 1, height: 2, shape: 'bump', key: '', group: 'fancy' },
  { code: 'P', name: '爆米花針', short: '爆米花', aliases: ['爆米花針', '爆米花'], consumes: 1, produces: 1, height: 2, shape: 'bump', key: '', group: 'fancy' },
  { code: 'B', name: '泡泡針', short: '泡泡', aliases: ['泡泡針'], consumes: 1, produces: 1, height: 1.6, shape: 'bump', key: '', group: 'fancy' },
  { code: 'S', name: '貝殼針', short: '貝殼', aliases: ['貝殼針'], consumes: 1, produces: 5, height: 2, shape: 'fan', key: '', group: 'fancy' },
  { code: 'pc', name: '狗牙針', short: '狗牙', aliases: ['狗牙針', '鎖針結粒'], consumes: 0, produces: 0, height: 0.6, shape: 'picot', key: '', group: 'fancy' },
  { code: 'FP', name: '外鉤長針', short: '外鉤長', aliases: ['外鉤長針'], consumes: 1, produces: 1, height: 2, shape: 'post', key: '', group: 'fancy' },
  { code: 'BP', name: '內鉤長針', short: '內鉤長', aliases: ['內鉤長針'], consumes: 1, produces: 1, height: 2, shape: 'post', key: '', group: 'fancy' },
  { code: 'CF', name: '交叉長針', short: '交叉長', aliases: ['交叉長針'], consumes: 2, produces: 2, height: 2, shape: 'post', key: '', group: 'fancy' },
  { code: 'L', name: '線圈針', short: '線圈', aliases: ['線圈針'], consumes: 1, produces: 1, height: 1, shape: 'loop', key: '', group: 'fancy' },
  { code: 'sk', name: '空鎖針', short: '跳過', aliases: ['空鎖針', '跳針', '跳過'], consumes: 1, produces: 0, height: 0, shape: 'skip', key: '', group: 'fancy' },
];

/** Modifiers wrap a group: `BLO(X*30)`. */
export const MODIFIERS = [
  { code: 'BLO', name: '只鉤後半針', aliases: ['後半針', '只鉤後半針'] },
  { code: 'FLO', name: '只鉤前半針', aliases: ['前半針', '只鉤前半針'] },
] as const;
export type ModifierCode = (typeof MODIFIERS)[number]['code'];

export const STITCH_BY_CODE: Record<string, StitchDef> = Object.fromEntries(STITCHES.map((s) => [s.code, s]));

/** Every word the tokenizer recognises as a stitch, longest first so `FV` wins over `F`. */
export const STITCH_WORDS: { word: string; code: string }[] = STITCHES.flatMap((s) => [
  { word: s.code, code: s.code },
  ...s.aliases.map((a) => ({ word: a, code: s.code })),
]).sort((a, b) => b.word.length - a.word.length);

export const MODIFIER_WORDS: { word: string; code: ModifierCode }[] = MODIFIERS.flatMap((m) => [
  { word: m.code, code: m.code as ModifierCode },
  ...m.aliases.map((a) => ({ word: a, code: m.code as ModifierCode })),
]).sort((a, b) => b.word.length - a.word.length);
