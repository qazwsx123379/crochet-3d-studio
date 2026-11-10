/**
 * Expands the editor's rows into actual rounds and checks every round's
 * stitch count against the round before it.
 */
import { parseRound, type ParsedRound, type Stitch } from './parser';

export type Method = 'spiral' | 'joined' | 'flat';
export type StartKind = 'ring' | 'chain';

export interface PartSettingsLike {
  method: Method;
  start: StartKind;
}

export interface PatternRow {
  id: string;
  text: string;
  /** How many identical rounds this row stands for (R6–R10 → 5). */
  repeat: number;
  note: string;
  /**
   * Stitch of the round (or row) below where this one begins, 1-based. Rounds
   * still go all the way round from there; a flat row leaves the stitches
   * before it unworked. Applies to the row's first round.
   */
  startAt?: number;
  /** Round this row is worked into, when not the one just before (「鉤R2的外半針」). */
  base?: number;
}

export type RoundStatus = 'ok' | 'empty' | 'syntax' | 'short' | 'over' | 'start';

export interface RoundInfo {
  /** 1-based round number. */
  no: number;
  rowId: string;
  /** Index of this round inside its row (0 for the first). */
  inRow: number;
  stitches: Stitch[];
  consumed: number;
  produced: number;
  /** Stitches the previous round left; undefined for the first round. */
  expected?: number;
  status: RoundStatus;
  message: string;
  /** Chain foundation length when this round is the starting chain. */
  foundation?: number;
  /** Where this round begins in the round below (1-based), when not the first stitch. */
  startAt?: number;
  /** Most stitches are worked in the back or front loop only. */
  loopOnly?: 'BLO' | 'FLO';
  /** Worked into this earlier round instead of the one just before. */
  base?: number;
}

export interface RowInfo {
  row: PatternRow;
  first: number;
  last: number;
  parsed: ParsedRound;
  /** Status of the row's first round (later rounds repeat it). */
  status: RoundStatus;
  message: string;
  produced: number;
}

export interface Analysis {
  rounds: RoundInfo[];
  rows: RowInfo[];
  maxStitches: number;
  problems: number;
}

function loopOnly(stitches: Stitch[]): 'BLO' | 'FLO' | undefined {
  if (!stitches.length) return undefined;
  const blo = stitches.filter((s) => s.mod === 'BLO').length;
  const flo = stitches.filter((s) => s.mod === 'FLO').length;
  if (blo * 2 >= stitches.length) return 'BLO';
  if (flo * 2 >= stitches.length) return 'FLO';
  return undefined;
}

export function analyze(rows: PatternRow[], settings: PartSettingsLike): Analysis {
  const rounds: RoundInfo[] = [];
  const rowInfos: RowInfo[] = [];
  let prevProduced: number | undefined;
  const producedByNo = new Map<number, number>();
  let no = 1;
  let problems = 0;

  for (const row of rows) {
    // A `*到底` repeat depends on what the round below left, so such rows are parsed per round.
    const plain = parseRound(row.text);
    const hasAuto = /到底|到尾|[~～]/.test(row.text) && !plain.errors.length;
    let parsed = plain;
    const repeat = Math.max(1, Math.min(200, Math.floor(row.repeat || 1)));
    const first = no;
    let rowStatus: RoundStatus = 'ok';
    let rowMsg = '';

    for (let k = 0; k < repeat; k++) {
      // 「鉤R2的外半針」: this round goes back into an earlier round (only its first copy).
      const wantBase = k === 0 ? row.base ?? plain.base : undefined;
      const base = wantBase && wantBase < no && producedByNo.has(wantBase) ? wantBase : undefined;
      if (base !== undefined) prevProduced = producedByNo.get(base);
      const startHere = k === 0 && row.startAt && row.startAt > 1 && prevProduced !== undefined ? Math.min(row.startAt, prevProduced) : 1;
      if (hasAuto) parsed = parseRound(row.text, prevProduced === undefined ? undefined : prevProduced - (settings.method === 'flat' ? startHere - 1 : 0));
      const info: RoundInfo = {
        no, rowId: row.id, inRow: k, stitches: parsed.stitches, consumed: parsed.consumed, produced: parsed.produced,
        expected: prevProduced, status: 'ok', message: '', loopOnly: loopOnly(parsed.stitches), ...(base ? { base } : {}),
      };
      // 「3CH, 17(…)」: chains at the start of a round raise the hook to height (起立) and don't count.
      let lead = 0;
      if (prevProduced !== undefined && !parsed.errors.length && /^\s*\d*\s*(?:ch|CH|Ch|鎖針|锁针)\s*\d*\s*[,，、\s]/.test(row.text)) {
        while (lead < info.stitches.length && info.stitches[lead].code === 'ch' && info.stitches[lead].group === undefined && !info.stitches[lead].free) lead++;
        const next = info.stitches[lead];
        if (lead >= 1 && lead <= 4 && next && next.code !== 'ch' && next.code !== 'sk') {
          info.stitches = info.stitches.map((st, i) => (i < lead ? { ...st, code: 'tch' } : st));
          info.produced -= lead;
        } else lead = 0;
      }
      const isFirst = prevProduced === undefined;
      if (parsed.errors.length) {
        info.status = 'syntax';
        info.message = parsed.errors[0].message;
      } else if (!parsed.stitches.length) {
        info.status = 'empty';
        info.message = '還沒寫內容';
      } else if (isFirst) {
        info.status = 'start';
        if (settings.start === 'chain' && parsed.stitches.every((s) => s.code === 'ch')) {
          info.foundation = parsed.stitches.length;
          info.message = `起針 ${parsed.stitches.length} 個鎖針`;
          // Working around both sides of the chain (oval) gives twice the stitches.
          info.produced = settings.method === 'flat' ? info.foundation : info.foundation * 2;
        } else {
          info.message = settings.start === 'ring' ? `魔術環裡鉤 ${parsed.produced} 針` : `第一圈 ${parsed.produced} 針`;
        }
      } else if (prevProduced !== undefined) {
        const start = k === 0 && row.startAt && row.startAt > 1 ? Math.min(row.startAt, prevProduced) : 1;
        if (start > 1) info.startAt = start;
        const flatSkip = settings.method === 'flat' ? start - 1 : 0;
        const available = prevProduced - flatSkip;
        const where = start > 1 ? `從上一${settings.method === 'flat' ? '排' : '圈'}第 ${start} 針開始，` : '';
        if (parsed.consumed > available) {
          info.status = 'over';
          info.message = `${where}上一圈${flatSkip ? '剩' : '只有'} ${available} 針，這圈要用 ${parsed.consumed} 針，多了 ${parsed.consumed - available} 針`;
        } else if (parsed.consumed < available) {
          const left = available - parsed.consumed;
          const prevRound = rounds[rounds.length - 1];
          if (parsed.auto && left < parsed.auto.unit) {
            info.message = `${where}重複 ${parsed.auto.times} 次${left ? `，最後剩 ${left} 針沒鉤` : ''}`;
          } else if (settings.method === 'flat' && start === 1 && prevRound?.foundation && left <= 3) {
            // 「69 起針，倒 3 鉤 67F」: the chains nearest the hook stand in for the turning chain.
            info.message = `起針最後 ${left} 個鎖針當作起立針（從倒數第 ${left + 1} 針開始鉤）`;
          } else if (start > 1) {
            // Starting part-way along is deliberate shaping: say what is left, don't flag it.
            info.message = `${where}最後剩 ${available - parsed.consumed} 針沒鉤`;
          } else {
            info.status = 'short';
            info.message = `上一圈 ${prevProduced} 針，這圈只用掉 ${parsed.consumed} 針，還差 ${available - parsed.consumed} 針`;
          }
        } else if (parsed.auto) info.message = `${where}重複 ${parsed.auto.times} 次，剛好用完`;
        else if (start > 1) info.message = `${where}剛好用完`;
      }
      if (base && info.status !== 'syntax' && info.status !== 'empty') info.message = `鉤在 R${base} 上${info.message ? '，' + info.message : ''}`;
      if (lead && info.status !== 'syntax') info.message = `開頭 ${lead} 鎖針當起立針${info.message ? '，' + info.message : ''}`;
      if (k === 0) { rowStatus = info.status; rowMsg = info.message; }
      if (info.status === 'syntax' || info.status === 'short' || info.status === 'over') problems++;
      rounds.push(info);
      if (info.status !== 'empty' && info.status !== 'syntax') { prevProduced = info.produced; producedByNo.set(info.no, info.produced); }
      no++;
    }
    rowInfos.push({ row, first, last: no - 1, parsed, status: rowStatus, message: rowMsg, produced: rounds[rounds.length - 1].produced });
  }
  const maxStitches = rounds.reduce((m, r) => Math.max(m, r.produced), 0);
  return { rounds, rows: rowInfos, maxStitches, problems };
}
