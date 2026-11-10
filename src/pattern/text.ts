/**
 * The pattern as plain text, the way it is copied, printed and exported:
 * one line per row with its stitch count, notes and colour changes.
 */
import type { Part } from '../types';
import type { Analysis } from './analyze';
import { colorChanges, colorChangeText } from './colors';

export interface TextRow { label: string; start: string; text: string; count: number; note: string; colours: string[] }

export function patternRows(part: Part, analysis: Analysis): TextRow[] {
  const changes = colorChanges(part, analysis.rounds);
  const flat = part.settings.method === 'flat';
  return analysis.rows.map((ri) => ({
    label: ri.first === ri.last ? `R${ri.first}` : `R${ri.first}-R${ri.last}`,
    start: (ri.row.startAt ?? 1) > 1 ? `從上一${flat ? '排' : '圈'}第 ${ri.row.startAt} 針開始` : '',
    text: ri.row.text,
    count: ri.produced,
    note: ri.row.note,
    colours: analysis.rounds.filter((r) => r.rowId === ri.row.id && changes.has(r.no))
      .map((r) => `${ri.first !== ri.last ? `R${r.no} ` : ''}${colorChangeText(changes.get(r.no)!)}`),
  }));
}

export function patternText(part: Part, analysis: Analysis): string {
  return patternRows(part, analysis).map((r) => {
    const head = `${r.label}${r.start ? `（${r.start}）` : ''}: ${r.text} (${r.count})${r.note ? `  # ${r.note}` : ''}`;
    return [head, ...r.colours.map((c) => `    顏色：${c}`)].join('\n');
  }).join('\n');
}

export const METHOD_NAME = { spiral: '螺旋繞圈', joined: '每圈接合', flat: '往返片織' } as const;
export const START_NAME = { ring: '魔術環起針', chain: '鎖針起針' } as const;
