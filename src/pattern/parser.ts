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
}

type Node =
  | { type: 'stitch'; code: string }
  | { type: 'seq'; items: Node[] }
  | { type: 'repeat'; node: Node; times: number }
  | { type: 'same'; node: Node }
  | { type: 'mod'; mod: ModifierCode; node: Node };

type Token =
  | { t: 'num'; v: number; at: number }
  | { t: 'stitch'; v: string; at: number; end: number }
  | { t: 'mod'; v: ModifierCode; at: number }
  | { t: 'ring'; at: number }
  | { t: '(' | ')' | '[' | ']' | '*'; at: number };

const RING_WORDS = ['魔術環', '環形起針', 'MR'];
const SEPARATORS = new Set([' ', '\t', ',', '，', '、', '；', ';', '　']);
const PUNCT: Record<string, Token['t']> = { '(': '(', '（': '(', ')': ')', '）': ')', '[': '[', '【': '[', ']': ']', '】': ']', '*': '*', '×': '*', '＊': '*' };

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

  parse(): Node {
    while (this.peek()?.t === 'ring') { this.magicRing = true; this.p++; }
    const seq = this.seq();
    const extra = this.peek();
    if (extra) throw new PatternSyntaxError(extra.t === ')' || extra.t === ']' ? `多了一個「${extra.t}」` : '這裡無法接續', extra.at);
    return seq;
  }

  private seq(): Node {
    const items: Node[] = [];
    while (this.peek() && this.peek()!.t !== ')' && this.peek()!.t !== ']') {
      if (this.peek()!.t === 'ring') throw new PatternSyntaxError('魔術環只能寫在最前面', this.at());
      items.push(this.item());
    }
    return { type: 'seq', items };
  }

  private item(): Node {
    let prefix: number | undefined;
    const tk = this.peek()!;
    if (tk.t === 'num') {
      prefix = tk.v;
      this.p++;
      if (!this.peek() || this.peek()!.t === ')' || this.peek()!.t === ']') throw new PatternSyntaxError(`數字 ${prefix} 後面要接針法`, this.at());
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
      if (n?.t !== 'num') throw new PatternSyntaxError('「*」後面要寫次數', starAt);
      this.p++;
      node = this.repeat(node, n.v, n.at);
    }
    return node;
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
    if (tk.t === '*') throw new PatternSyntaxError('「*」前面要先寫針法', tk.at);
    throw new PatternSyntaxError(`這裡不該出現「${tk.t === 'num' ? tk.v : tk.t}」`, tk.at);
  }

  private group(open: '(' | '[', close: ')' | ']'): Node {
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

function expand(node: Node, out: Stitch[], mod: ModifierCode | undefined, nextGroup: { v: number }, group?: number): Counts {
  switch (node.type) {
    case 'stitch': {
      if (out.length >= MAX_STITCHES) throw new PatternSyntaxError(`這一圈超過 ${MAX_STITCHES} 針，請檢查次數`, 0);
      const def = STITCH_BY_CODE[node.code];
      out.push({ code: node.code, ...(mod ? { mod } : {}), ...(group !== undefined ? { group } : {}) });
      return { consumed: def.consumes, produced: def.produces };
    }
    case 'seq': {
      const c = { consumed: 0, produced: 0 };
      for (const it of node.items) { const r = expand(it, out, mod, nextGroup, group); c.consumed += r.consumed; c.produced += r.produced; }
      return c;
    }
    case 'repeat': {
      const c = { consumed: 0, produced: 0 };
      for (let k = 0; k < node.times; k++) { const r = expand(node.node, out, mod, nextGroup, group); c.consumed += r.consumed; c.produced += r.produced; }
      return c;
    }
    case 'mod':
      return expand(node.node, out, node.mod, nextGroup, group);
    case 'same': {
      // A nested [ ] inside [ ] stays in the outer group.
      const g = group ?? nextGroup.v++;
      const inner = expand(node.node, out, mod, nextGroup, g);
      return { consumed: inner.consumed > 0 ? 1 : 0, produced: inner.produced };
    }
  }
}

/** Parse one round. Never throws: syntax problems come back in `errors`. */
export function parseRound(src: string): ParsedRound {
  const empty: ParsedRound = { stitches: [], consumed: 0, produced: 0, magicRing: false, errors: [] };
  if (!src.trim()) return empty;
  try {
    const toks = tokenize(src);
    const parser = new Parser(toks, src.length);
    const ast = parser.parse();
    const stitches: Stitch[] = [];
    const c = expand(ast, stitches, undefined, { v: 0 });
    return { stitches, consumed: c.consumed, produced: c.produced, magicRing: parser.magicRing, errors: [] };
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
