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
  /** Most stitches are worked in the back or front loop only. */
  loopOnly?: 'BLO' | 'FLO';
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
  let no = 1;
  let problems = 0;

  for (const row of rows) {
    const parsed = parseRound(row.text);
    const repeat = Math.max(1, Math.min(200, Math.floor(row.repeat || 1)));
    const first = no;
    let rowStatus: RoundStatus = 'ok';
    let rowMsg = '';

    for (let k = 0; k < repeat; k++) {
      const info: RoundInfo = {
        no, rowId: row.id, inRow: k, stitches: parsed.stitches, consumed: parsed.consumed, produced: parsed.produced,
        expected: prevProduced, status: 'ok', message: '', loopOnly: loopOnly(parsed.stitches),
      };
      const isFirst = rounds.length === 0;
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
      } else if (prevProduced !== undefined && parsed.consumed !== prevProduced) {
        const diff = prevProduced - parsed.consumed;
        info.status = diff > 0 ? 'short' : 'over';
        info.message = diff > 0
          ? `上一圈 ${prevProduced} 針，這圈只用掉 ${parsed.consumed} 針，還差 ${diff} 針`
          : `上一圈只有 ${prevProduced} 針，這圈要用 ${parsed.consumed} 針，多了 ${-diff} 針`;
      }
      if (k === 0) { rowStatus = info.status; rowMsg = info.message; }
      if (info.status === 'syntax' || info.status === 'short' || info.status === 'over') problems++;
      rounds.push(info);
      if (info.status !== 'empty' && info.status !== 'syntax') prevProduced = info.produced;
      no++;
    }
    rowInfos.push({ row, first, last: no - 1, parsed, status: rowStatus, message: rowMsg, produced: rounds[rounds.length - 1].produced });
  }
  const maxStitches = rounds.reduce((m, r) => Math.max(m, r.produced), 0);
  return { rounds, rows: rowInfos, maxStitches, problems };
}
