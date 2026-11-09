import { useMemo, useState } from 'react';
import type { PatternRow } from '../pattern/analyze';
import { splitRoundPrefix } from '../pattern/parser';
import { newId } from '../store/yarns';

/** Turn pasted lines (`R1: 6X`, `R8-R12: X*30`, or plain lines) into rows. */
export function linesToRows(text: string): PatternRow[] {
  const rows: PatternRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\(\d+\)\s*$/, '').replace(/（\d+）\s*$/, '').trim();
    if (!line) continue;
    const { from, to, text: body } = splitRoundPrefix(line);
    // A trailing note after # or // stays with the row.
    const m = body.match(/^(.*?)(?:\s*(?:#|\/\/)\s*(.*))?$/);
    rows.push({ id: newId('row'), text: (m?.[1] ?? body).trim(), repeat: from !== undefined && to !== undefined ? to - from + 1 : 1, note: (m?.[2] ?? '').trim() });
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
