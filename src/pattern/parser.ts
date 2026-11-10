/**
 * Turns one round of pattern text such as `(X,V)*6` or `魔術環 6X` into a flat
 * list of stitches, and counts how many stitches it uses and makes.
 *
 * Grammar (whitespace, `,` `，` `、` separate items and are otherwise ignored):
 *   seq   := item*
 *   item  := NUMBER? atom NUMBER? (('*' | '×') NUMBER)?   (a NUMBER glued to a stitch, `ch10`, repeats it)
 *   atom  := STITCH | '(' seq ')' | '[' seq ']' | MOD '(' seq ')' | MOD atom
 * `[ … ]` means "all of these into the same stitch".
 * Stitch words are matched longest first, so `FV` is 長針加針 and never F + V.
 */
import { MODIFIER_WORDS, STITCH_BY_CODE, STITCH_WORDS, type ModifierCode } from './stitches';

export interface Stitch {
  code: string;
  mod?: ModifierCode;
  /** Worked into a gap or chain space (`{2X}`), so it uses no stitch of the round below. */
  free?: boolean;
  /** Stitches worked into the same base stitch share a group id. */
  group?: number;
}

export interface ParseError {
  message: string;
  /** Character offset in the source text. */
  at: number;
}

export interface ParsedRound {
  stitches: Stitch[];
  /** Stitches of the previous round used up. */
  consumed: number;
  /** Stitches available to the next round. */
  produced: number;
  /** The text started with 魔術環 / MR. */
  magicRing: boolean;
  errors: ParseError[];
  /** A `*到底` repeat: how many times it fitted, and how many stitches one repeat uses. */
  auto?: { times: number; unit: number };
  /** 「鉤R2的內半針」: the round this one is worked into, when not the one just before. */
  base?: number;
}

type Node =
  | { type: 'stitch'; code: string }
  | { type: 'seq'; items: Node[] }
  /** times −1 means "repeat to the end of the round" (`*到底`). */
  | { type: 'repeat'; node: Node; times: number }
  | { type: 'space'; node: Node }
  | { type: 'same'; node: Node }
  | { type: 'mod'; mod: ModifierCode; node: Node };

type Token =
  | { t: 'num'; v: number; at: number }
  | { t: 'stitch'; v: string; at: number; end: number }
  | { t: 'mod'; v: ModifierCode; at: number }
  | { t: 'ring'; at: number }
  | { t: 'auto'; at: number }
  | { t: 'back'; at: number }
  | { t: 'base'; v: number; at: number }
  | { t: '(' | ')' | '[' | ']' | '{' | '}' | '*'; at: number };

const RING_WORDS = ['魔術環', '環形起針', '环形起针', '魔术环', '環起', '环起', 'MR'];
const AUTO_WORDS = ['重複到底', '重复到底', '到底', '到尾', '~', '～'];
const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
/** 「3個未完成中長針」 is one puff/bobble stitch, not three stitches. */
const UNFINISHED = /^([0-9０-９]+|[一二兩两三四五六七八九十])?\s*[個个]?\s*未完成的?(短針|短针|中長針|中长针|長長針|长长针|長針|长针|[XxTtFfEe](?![VvAaPp]))/;
/** 「外鉤2F」「內鉤FV」: post stitches around the stitch below. */
const POST = /^(外|內|内)[鉤钩]\s*([0-9０-９]+)?\s*(FV|fv|F|f|長針|长针)(?![VvAa])/;
/** 「倒2鉤2X」: the next stitches go back along the chain just made, not into the round below. */
const BACK = /^倒(?:數|数)?第?\s*[0-9０-９一二三四五]\s*[針针]?\s*[鉤钩]/;
/** 「鉤R2的內半針」「在第4圈」: work into an earlier round. */
const BASE = /^(?:[鉤钩在]\s*)?(?:R|第)\s*([0-9０-９]+)\s*(?:圈|排|行)?\s*的?/;
/** Words that only say "crochet" or describe handling, not stitches. */
const FILLER = ['正常鉤', '正常钩', '翻轉織片', '翻转织片', '翻面', '裏山', '里山', '起針', '起针', '正常', '鉤', '钩', '起', '在'];
/** 「起立2ch」「立起3鎖針」: turning chains that don't count as stitches. */
const TURNING = /^(?:起立|立起)(?:針|针)?\s*([0-9０-９]+)?\s*(?:個|个)?\s*(?:ch|CH|Ch|鎖針|锁针|鎖|锁)?/;
const SEPARATORS = new Set([' ', '\t', ',', '，', '、', '；', ';', '　']);
const PUNCT: Record<string, Token['t']> = { '(': '(', '（': '(', ')': ')', '）': ')', '[': '[', '【': '[', ']': ']', '】': ']', '{': '{', '｛': '{', '}': '}', '｝': '}', '*': '*', '×': '*', '＊': '*' };
const toAscii = (s: string) => s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));

export class PatternSyntaxError extends Error {
  constructor(message: string, public at: number) {
    super(message);
  }
}

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  outer: while (i < src.length) {
    const ch = src[i];
    if (SEPARATORS.has(ch)) { i++; continue; }
    for (const w of AUTO_WORDS) {
      if (src.startsWith(w, i)) { out.push({ t: 'auto', at: i }); i += w.length; continue outer; }
    }
    const rest = src.slice(i);
    const un = rest.match(UNFINISHED);
    if (un) {
      const n = un[1] ? (CN_NUM[un[1]] ?? parseInt(toAscii(un[1]), 10)) : 3;
      const kind = un[2];
      const code = /中|^[Tt]$/.test(kind) ? 'Q' : /短|^[Xx]$/.test(kind) ? 'B' : n >= 5 ? 'P' : 'B';
      out.push({ t: 'stitch', v: code, at: i, end: i + un[0].length });
      i += un[0].length;
      continue;
    }
    const po = rest.match(POST);
    if (po) {
      const code = po[1] === '外' ? 'FP' : 'BP';
      const end = i + po[0].length;
      if (po[2]) out.push({ t: 'num', v: parseInt(toAscii(po[2]), 10), at: i });
      if (/V|v/.test(po[3])) {
        // A post increase: two post stitches around the same stitch.
        out.push({ t: '[', at: i }, { t: 'stitch', v: code, at: i, end }, { t: 'stitch', v: code, at: i, end }, { t: ']', at: i });
      } else out.push({ t: 'stitch', v: code, at: i, end });
      i = end;
      continue;
    }
    const bk = rest.match(BACK);
    if (bk) { out.push({ t: 'back', at: i }); i += bk[0].length; continue; }
    const bs = rest.match(BASE);
    if (bs && (out.length === 0 || /[鉤钩在第]/.test(bs[0]))) { out.push({ t: 'base', v: parseInt(toAscii(bs[1]), 10), at: i }); i += bs[0].length; continue; }
    const tu = rest.match(TURNING);
    if (tu) {
      if (tu[1]) out.push({ t: 'num', v: parseInt(toAscii(tu[1]), 10), at: i });
      out.push({ t: 'stitch', v: 'tch', at: i, end: i + tu[0].length });
      i += tu[0].length;
      continue;
    }
    if (PUNCT[ch]) { out.push({ t: PUNCT[ch] as '(' , at: i }); i++; continue; }
    if (/[0-9０-９]/.test(ch)) {
      let j = i;
      let s = '';
      while (j < src.length && /[0-9０-９]/.test(src[j])) { s += String.fromCharCode(src.charCodeAt(j) > 0xff ? src.charCodeAt(j) - 0xfee0 : src.charCodeAt(j)); j++; }
      out.push({ t: 'num', v: parseInt(s, 10), at: i });
      i = j;
      continue;
    }
    for (const w of RING_WORDS) {
      if (src.startsWith(w, i)) { out.push({ t: 'ring', at: i }); i += w.length; continue outer; }
    }
    for (const w of FILLER) {
      if (src.startsWith(w, i)) { i += w.length; continue outer; }
    }
    // Modifiers and stitches share the alphabet; try the longest word of either kind.
    const mod = MODIFIER_WORDS.find((m) => src.startsWith(m.word, i));
    const st = STITCH_WORDS.find((s) => src.startsWith(s.word, i));
    if (mod && (!st || mod.word.length >= st.word.length)) { out.push({ t: 'mod', v: mod.code, at: i }); i += mod.word.length; continue; }
    if (st) { out.push({ t: 'stitch', v: st.code, at: i, end: i + st.word.length }); i += st.word.length; continue; }
    throw new PatternSyntaxError(`看不懂「${ch}」`, i);
  }
  return out;
}

class Parser {
  private p = 0;
  magicRing = false;
  constructor(private toks: Token[], private srcLen: number) {}

  private peek(): Token | undefined { return this.toks[this.p]; }
  private at(): number { return this.peek()?.at ?? this.srcLen; }

  base?: number;
  parse(): Node {
    // 「鉤R2的…」 can come anywhere before the stitches; take it out first.
    this.toks = this.toks.filter((t) => { if (t.t === 'base') { this.base = t.v; return false; } return true; });
    while (this.peek()?.t === 'ring') { this.magicRing = true; this.p++; }
    const seq = this.seq();
    const extra = this.peek();
    if (extra) throw new PatternSyntaxError(extra.t === ')' || extra.t === ']' || extra.t === '}' ? `多了一個「${extra.t}」` : '這裡無法接續', extra.at);
    return seq;
  }

  private seq(): Node {
    const items: Node[] = [];
    while (this.peek() && this.peek()!.t !== ')' && this.peek()!.t !== ']' && this.peek()!.t !== '}') {
      if (this.peek()!.t === 'ring') throw new PatternSyntaxError('魔術環只能寫在最前面', this.at());
      items.push(this.item());
    }
    return { type: 'seq', items };
  }

  private item(): Node {
    if (this.peek()?.t === 'back') {
      // 倒2鉤2X: these stitches are worked along the chain, using nothing below.
      this.p++;
      if (!this.peek()) throw new PatternSyntaxError('「倒…鉤」後面要接針法', this.srcLen);
      return { type: 'space', node: this.item() };
    }
    let prefix: number | undefined;
    const tk = this.peek()!;
    if (tk.t === 'num') {
      prefix = tk.v;
      this.p++;
      if (!this.peek() || this.peek()!.t === ')' || this.peek()!.t === ']' || this.peek()!.t === '}') throw new PatternSyntaxError(`數字 ${prefix} 後面要接針法`, this.at());
    }
    const atomTok = this.peek()!;
    let node = this.atom();
    // `ch10` / `鎖針10`: a number written right after a stitch, with no space, repeats it.
    const after = this.peek();
    if (prefix === undefined && atomTok.t === 'stitch' && after?.t === 'num' && after.at === atomTok.end) {
      this.p++;
      node = this.repeat(node, after.v, after.at);
    }
    if (prefix !== undefined) node = this.repeat(node, prefix, tk.at);
    if (this.peek()?.t === '*') {
      const starAt = this.at();
      this.p++;
      const n = this.peek();
      if (n?.t === 'auto') { this.p++; return this.autoRepeat(node, n.at); }
      if (n?.t !== 'num') throw new PatternSyntaxError('「*」後面要寫次數，或寫「到底」', starAt);
      this.p++;
      node = this.repeat(node, n.v, n.at);
    } else if (this.peek()?.t === 'auto') {
      const at = this.at();
      this.p++;
      return this.autoRepeat(node, at);
    }
    return node;
  }

  autos = 0;
  private autoRepeat(node: Node, at: number): Node {
    if (++this.autos > 1) throw new PatternSyntaxError('一圈只能有一個「到底」', at);
    return { type: 'repeat', node, times: -1 };
  }

  private repeat(node: Node, times: number, at: number): Node {
    if (times < 1) throw new PatternSyntaxError('次數至少要 1', at);
    if (times > 999) throw new PatternSyntaxError('次數太大了', at);
    return { type: 'repeat', node, times };
  }

  private atom(): Node {
    const tk = this.peek();
    if (!tk) throw new PatternSyntaxError('這裡少了針法', this.srcLen);
    if (tk.t === 'stitch') { this.p++; return { type: 'stitch', code: tk.v }; }
    if (tk.t === 'mod') {
      this.p++;
      // BLO(X*30), BLO X, BLO 30X
      const node = this.peek()?.t === '(' ? this.group('(', ')') : this.item();
      return { type: 'mod', mod: tk.v, node };
    }
    if (tk.t === '(') return this.group('(', ')');
    if (tk.t === '[') return { type: 'same', node: this.group('[', ']') };
    if (tk.t === '{') return { type: 'space', node: this.group('{', '}') };
    if (tk.t === 'auto') throw new PatternSyntaxError('「到底」前面要先寫要重複的針法，例如 (X,V)*到底', tk.at);
    if (tk.t === '*') throw new PatternSyntaxError('「*」前面要先寫針法', tk.at);
    throw new PatternSyntaxError(`這裡不該出現「${tk.t === 'num' ? tk.v : tk.t}」`, tk.at);
  }

  private group(open: '(' | '[' | '{', close: ')' | ']' | '}'): Node {
    const openAt = this.at();
    this.p++; // open
    const inner = this.seq();
    if (this.peek()?.t !== close) throw new PatternSyntaxError(`「${open}」沒有對應的「${close}」`, openAt);
    this.p++;
    if (inner.type === 'seq' && inner.items.length === 0) throw new PatternSyntaxError(`「${open}${close}」裡面是空的`, openAt);
    return inner;
  }
}

interface Counts { consumed: number; produced: number }

const MAX_STITCHES = 5000;

interface Ctx { nextGroup: { v: number }; autoTimes: number; unit?: number; free?: boolean }

function expand(node: Node, out: Stitch[], mod: ModifierCode | undefined, ctx: Ctx, group?: number): Counts {
  switch (node.type) {
    case 'stitch': {
      if (out.length >= MAX_STITCHES) throw new PatternSyntaxError(`這一圈超過 ${MAX_STITCHES} 針，請檢查次數`, 0);
      const def = STITCH_BY_CODE[node.code];
      out.push({ code: node.code, ...(mod ? { mod } : {}), ...(group !== undefined ? { group } : {}), ...(ctx.free ? { free: true } : {}) });
      return { consumed: ctx.free ? 0 : def.consumes, produced: def.produces };
    }
    case 'seq': {
      const c = { consumed: 0, produced: 0 };
      for (const it of node.items) { const r = expand(it, out, mod, ctx, group); c.consumed += r.consumed; c.produced += r.produced; }
      return c;
    }
    case 'repeat': {
      const c = { consumed: 0, produced: 0 };
      let times = node.times;
      if (times < 0) {
        // Measure one repeat on scratch space, then fit as many as the round allows.
        const one = expand(node.node, [], mod, { ...ctx, nextGroup: { v: 0 } }, group);
        ctx.unit = one.consumed;
        times = ctx.autoTimes;
      }
      for (let k = 0; k < times; k++) { const r = expand(node.node, out, mod, ctx, group); c.consumed += r.consumed; c.produced += r.produced; }
      return c;
    }
    case 'mod':
      return expand(node.node, out, node.mod, ctx, group);
    case 'space': {
      const inner = expand(node.node, out, mod, { ...ctx, free: true }, group);
      return { consumed: 0, produced: inner.produced };
    }
    case 'same': {
      // A nested [ ] inside [ ] stays in the outer group.
      const g = group ?? ctx.nextGroup.v++;
      const inner = expand(node.node, out, mod, ctx, g);
      return { consumed: inner.consumed > 0 ? 1 : 0, produced: inner.produced };
    }
  }
}

/**
 * Parse one round. Never throws: syntax problems come back in `errors`.
 * `available` is how many stitches the round below left, used to size a `*到底` repeat.
 */
export function parseRound(src: string, available?: number): ParsedRound {
  const empty: ParsedRound = { stitches: [], consumed: 0, produced: 0, magicRing: false, errors: [] };
  if (!src.trim()) return empty;
  try {
    const toks = tokenize(src);
    const parser = new Parser(toks, src.length);
    const ast = parser.parse();
    let stitches: Stitch[] = [];
    if (parser.autos) {
      // First pass with no repeats tells us what the rest of the round uses.
      const probe: Ctx = { nextGroup: { v: 0 }, autoTimes: 0 };
      const base = expand(ast, [], undefined, probe);
      const unit = probe.unit ?? 0;
      if (unit <= 0) throw new PatternSyntaxError('「到底」要重複的針法至少要用掉 1 針', 0);
      const times = available === undefined ? 1 : Math.max(0, Math.floor((available - base.consumed) / unit));
      const c = expand(ast, stitches, undefined, { nextGroup: { v: 0 }, autoTimes: times });
      return { stitches, consumed: c.consumed, produced: c.produced, magicRing: parser.magicRing, errors: [], auto: { times, unit }, ...(parser.base ? { base: parser.base } : {}) };
    }
    stitches = [];
    const c = expand(ast, stitches, undefined, { nextGroup: { v: 0 }, autoTimes: 0 });
    return { stitches, consumed: c.consumed, produced: c.produced, magicRing: parser.magicRing, errors: [], ...(parser.base ? { base: parser.base } : {}) };
  } catch (e) {
    if (e instanceof PatternSyntaxError) return { ...empty, errors: [{ message: e.message, at: e.at }] };
    throw e;
  }
}

/** `R8-R12: X*30` → { from: 8, to: 12, text: 'X*30' }. Lines without a prefix return from/to undefined. */
export function splitRoundPrefix(line: string): { from?: number; to?: number; text: string } {
  const m = line.match(/^\s*[Rr第]?\s*(\d+)\s*(?:[-–~～至到]\s*[Rr]?\s*(\d+))?\s*[圈行]?\s*[:：]\s*(.*)$/);
  if (!m) return { text: line.trim() };
  const from = parseInt(m[1], 10);
  const to = m[2] ? parseInt(m[2], 10) : from;
  return { from, to: Math.max(from, to), text: m[3].trim() };
}

/** Rewrite codes as Chinese names, for the 中文 display mode. */
export function toChinese(src: string): string {
  try {
    const toks = tokenize(src);
    let out = '';
    let last = 0;
    for (const tk of toks) {
      if (tk.t !== 'stitch' && tk.t !== 'mod') continue;
      const word = STITCH_WORDS.find((w) => src.startsWith(w.word, tk.at) && w.code === (tk.t === 'stitch' ? tk.v : ''))
        ?? MODIFIER_WORDS.find((w) => src.startsWith(w.word, tk.at));
      const len = word ? word.word.length : 1;
      const name = tk.t === 'stitch' ? STITCH_BY_CODE[tk.v].name : (tk.v === 'BLO' ? '後半針' : '前半針');
      out += src.slice(last, tk.at) + name;
      last = tk.at + len;
    }
    return out + src.slice(last);
  } catch {
    return src;
  }
}

/**
 * Write a list of stitches back as compact pattern text, the inverse of
 * parseRound: runs become X*10, same-stitch groups become [3F], loop-only
 * runs become BLO(…). Used when one stitch of a round is changed by clicking.
 */
export function stitchesToText(stitches: Stitch[]): string {
  type Item = { text: string; mod?: Stitch['mod'] };
  const items: Item[] = [];
  let i = 0;
  while (i < stitches.length) {
    const s = stitches[i];
    if (s.group !== undefined) {
      let j = i;
      while (j < stitches.length && stitches[j].group === s.group) j++;
      const inner: string[] = [];
      for (let k = i; k < j;) {
        let m = k;
        while (m < j && stitches[m].code === stitches[k].code) m++;
        inner.push(m - k > 1 ? `${m - k}${stitches[k].code}` : stitches[k].code);
        k = m;
      }
      items.push({ text: `[${inner.join(',')}]`, mod: s.mod });
      i = j;
      continue;
    }
    let j = i;
    while (j < stitches.length && stitches[j].group === undefined && stitches[j].code === s.code && stitches[j].mod === s.mod) j++;
    items.push({ text: j - i > 1 ? `${s.code}*${j - i}` : s.code, mod: s.mod });
    i = j;
  }
  // Merge identical neighbouring items ([2F],[2F] → [2F]*2) and wrap loop-only runs.
  const out: string[] = [];
  let k = 0;
  while (k < items.length) {
    const mod = items[k].mod;
    let j = k;
    const parts: string[] = [];
    while (j < items.length && items[j].mod === mod) {
      let m = j;
      while (m < items.length && items[m].mod === mod && items[m].text === items[j].text && items[j].text.startsWith('[')) m++;
      parts.push(m - j > 1 ? `${items[j].text}*${m - j}` : items[j].text);
      j = Math.max(m, j + 1);
    }
    out.push(mod ? `${mod}(${parts.join(',')})` : parts.join(','));
    k = j;
  }
  return out.join(',');
}
