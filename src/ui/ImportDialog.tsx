import { useMemo, useState } from 'react';
import type { PatternRow } from '../pattern/analyze';
import { parseRound, splitRoundPrefix } from '../pattern/parser';
import { newId } from '../store/yarns';

/** Turn pasted lines (`R1: 6X`, `R8-R12: X*30`, or plain lines) into rows. */
/**
 * Common phrasings from Chinese pattern posts, rewritten into the editor's
 * notation: 「69起针倒3钩67F」 → 69ch 然後 67F, 「棕色63ch」 → 63ch with a colour note.
 */
function tidy(body: string): { text: string; note: string } {
  const notes: string[] = [];
  let t = body;
  const colour = t.match(/^([\u4e00-\u9fa5]{1,3}色)\s*[,，、]?\s*/);
  if (colour) { notes.push(`換${colour[1]}`); t = t.slice(colour[0].length); }
  t = t.replace(/(\d+)\s*(?:個|个)?\s*起[针針]/g, '$1ch,');
  t = t.replace(/倒(?:数|數)?第?\s*([\d一二三四五六])\s*[回针針]?\s*(?:开始|開始)?\s*[钩鉤]?/g, (_m, n) => { notes.push(`倒數第 ${n} 針開始鉤`); return ','; });
  return { text: t.replace(/([,，]\s*)+/g, ',').replace(/^[,，\s]+|[,，\s]+$/g, ''), note: notes.join('，') };
}

export function linesToRows(text: string): PatternRow[] {
  const rows: PatternRow[] = [];
  let heading = '';
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/\(\d+\)\s*$/, '').replace(/（\d+）\s*$/, '').trim();
    if (!line) continue;
    // 「1. 6x」「2、6v」 numbered lists count as round numbers.
    line = line.replace(/^(\d+)\s*[.、．]\s*/, 'R$1: ');
    const { from, to, text: body } = splitRoundPrefix(line);
    // A trailing note after # or // stays with the row.
    const m = body.match(/^(.*?)(?:\s*(?:#|\/\/)\s*(.*))?$/);
    const t = tidy((m?.[1] ?? body).trim());
    // A line with no numbers and no stitches is a heading (「底片」「绿色花边」): keep it as a note.
    if (from === undefined && !/\d/.test(t.text) && parseRound(t.text).errors.length) { heading = line; continue; }
    const note = [heading && `【${heading}】`, t.note, (m?.[2] ?? '').trim()].filter(Boolean).join(' ');
    heading = '';
    // 「69起针倒3钩67F」 is the starting chain and the first row in one line.
    const split = !rows.length && t.text.match(/^(\d+ch),(.+)$/);
    if (split) {
      rows.push({ id: newId('row'), text: split[1], repeat: 1, note: [heading && `【${heading}】`, '起針'].filter(Boolean).join(' ') });
      rows.push({ id: newId('row'), text: split[2], repeat: 1, note });
      continue;
    }
    rows.push({ id: newId('row'), text: t.text, repeat: from !== undefined && to !== undefined ? to - from + 1 : 1, note });
  }
  return rows;
}

interface Props { onImport: (rows: PatternRow[], replace: boolean) => void; onClose: () => void }

export default function ImportDialog({ onImport, onClose }: Props) {
  const [text, setText] = useState('');
  const rows = useMemo(() => linesToRows(text), [text]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-label="貼上整份織圖" style={{ width: 'min(640px, 100%)' }}>
        <div className="dialog-head"><h2>貼上整份織圖</h2><button className="btn ghost icon" aria-label="關閉" onClick={onClose}>✕</button></div>
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label htmlFor="imp" className="muted" style={{ fontSize: 13 }}>一行一圈。可以寫 <code>R8-R12: X*30</code> 代表連續 5 圈，行尾的 <code>(30)</code> 會自動忽略，<code># 後面</code>會變成備註。</label>
          <textarea id="imp" value={text} onChange={(e) => setText(e.target.value)} rows={12} placeholder={'R1: 魔術環 6X\nR2: (V)*6\nR3: (X,V)*6\nR4-R8: X*18  # 開始塞棉花'} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, fontFamily: 'var(--f-mono)', fontSize: 14, background: 'var(--surface)', resize: 'vertical' }} />
          <span className="muted" style={{ fontSize: 13 }}>會加入 {rows.length} 行，共 {rows.reduce((n, r) => n + r.repeat, 0)} 圈。</span>
        </div>
        <div className="dialog-foot">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn" disabled={!rows.length} onClick={() => onImport(rows, false)}>加在最後面</button>
          <button className="btn pri" disabled={!rows.length} onClick={() => onImport(rows, true)}>取代目前織圖</button>
        </div>
      </section>
    </div>
  );
}
