import { useMemo, useRef, useState } from 'react';
import type { Analysis, PatternRow } from '../pattern/analyze';
import type { Part } from '../types';
import { colorChanges, roundHexes, type ColorSpan } from '../pattern/colors';
import { toChinese } from '../pattern/parser';

interface Props {
  part: Part;
  analysis: Analysis;
  activeRowId: string | null;
  display: 'code' | 'chinese';
  inputRefs: React.MutableRefObject<Map<string, HTMLInputElement>>;
  onFocusRow: (id: string) => void;
  onChange: (id: string, patch: Partial<PatternRow>, mergeKey?: string) => void;
  onAddAfter: (id: string | null) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  /** Paint stitches [from, to] of every round in the row; `round` paints the whole round. */
  onStripPaint: (rowId: string, from: number, to: number) => void;
  paintActive: boolean;
  /** Paint every round of this row with the current colour. */
  onPaintRow: (rowId: string) => void;
  currentColor: { name: string; hex: string } | undefined;
}

/** Lets the box be empty while typing; the number is applied when it is valid and tidied on blur. */
function RepeatInput({ value, label, onCommit }: { value: number; label: string; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const clamp = (v: string) => Math.max(1, Math.min(200, Math.floor(Number(v)) || 1));
  return (
    <input type="number" min={1} max={200} value={editing ? text : String(value)} aria-label={label}
      onFocus={() => { setEditing(true); setText(String(value)); }}
      onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value !== '' && n >= 1) onCommit(clamp(e.target.value)); }}
      onBlur={() => { setEditing(false); onCommit(clamp(text)); }}
      style={{ width: 40, border: '1px solid var(--line)', borderRadius: 4, padding: '0 2px', background: 'var(--surface)', fontSize: 11 }} />
  );
}

/** 「第 1–12 針 ●南瓜橘 → 第 13–18 針 ●黑」 */
function ColorNote({ label, spans, whole }: { label?: string; spans: ColorSpan[]; whole: boolean }) {
  const dot = (hex: string) => <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: hex, border: '1px solid var(--line)', verticalAlign: '-1px', margin: '0 3px 0 4px' }} />;
  return (
    <span className="row-msg color-note">
      {label && <b>{label}：</b>}
      {whole
        ? <>這圈換成{dot(spans[0].hex)}{spans[0].name}</>
        : spans.map((s, i) => <span key={i}>{i > 0 && ' → '}第 {s.from === s.to ? s.from : `${s.from}–${s.to}`} 針{dot(s.hex)}{s.name}</span>)}
    </span>
  );
}

export default function RowList(p: Props) {
  const [notes, setNotes] = useState<Set<string>>(new Set());
  const changes = useMemo(() => colorChanges(p.part, p.analysis.rounds), [p.part, p.analysis]);
  const [focused, setFocused] = useState<string | null>(null);
  const dragFrom = useRef<{ row: string; i: number } | null>(null);
  const [hover, setHover] = useState<{ row: string; a: number; b: number } | null>(null);

  const cellAt = (e: React.PointerEvent<HTMLDivElement>, n: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - rect.left) / rect.width) * n)));
  };

  return (
    <div className="rows">
      <div className="rows-head"><span>圈</span><span>顏色</span><span>寫法</span><span style={{ textAlign: 'right' }}>針數</span><span /></div>
      <div className="rows-list">
        {p.analysis.rows.map((info) => {
          const row = info.row;
          const bad = info.status === 'syntax' || info.status === 'short' || info.status === 'over';
          const firstRound = p.analysis.rounds.find((r) => r.rowId === row.id && r.inRow === 0);
          const hexes = firstRound ? roundHexes(p.part, firstRound) : [];
          const n = hexes.length;
          const label = info.first === info.last ? `R${info.first}` : `R${info.first}–${info.last}`;
          const showNote = notes.has(row.id) || row.note.length > 0;
          const isActive = p.activeRowId === row.id;
          // The row being edited always shows the real text, so the cursor positions match.
          const value = p.display === 'chinese' && focused !== row.id && !isActive ? toChinese(row.text) : row.text;
          return (
            <div key={row.id} className={`row${isActive ? ' active' : ''}${bad ? ' bad' : ''}`}>
              <div className="row-no">
                <span>{label}</span>
                <label className="muted" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 2 }} title="這一行代表幾圈">
                  <span>×</span>
                  <RepeatInput value={row.repeat} label={`${label} 重複幾圈`} onCommit={(n) => p.onChange(row.id, { repeat: n })} />
                </label>
              </div>
              <div className="strip-cell">
                {n > 0 && (
                  <div className="strip" role="img" aria-label={`${label} 的顏色`}
                    onPointerDown={(e) => { if (!p.paintActive) return; e.currentTarget.setPointerCapture(e.pointerId); const i = cellAt(e, n); dragFrom.current = { row: row.id, i }; setHover({ row: row.id, a: i, b: i }); }}
                    onPointerMove={(e) => { if (dragFrom.current?.row === row.id) setHover({ row: row.id, a: dragFrom.current.i, b: cellAt(e, n) }); }}
                    onPointerUp={(e) => { if (dragFrom.current?.row !== row.id) return; const a = dragFrom.current.i, b = cellAt(e, n); dragFrom.current = null; setHover(null); p.onStripPaint(row.id, Math.min(a, b), Math.max(a, b)); }}
                  >
                    {hexes.map((h, i) => {
                      const lit = hover?.row === row.id && i >= Math.min(hover.a, hover.b) && i <= Math.max(hover.a, hover.b);
                      return <span key={i} style={{ background: h, outline: lit ? '2px solid var(--accent)' : undefined, outlineOffset: -2 }} />;
                    })}
                  </div>
                )}
              </div>
              <div className="row-text">
                <input
                  ref={(el) => { if (el) p.inputRefs.current.set(row.id, el); else p.inputRefs.current.delete(row.id); }}
                  value={value}
                  aria-label={`${label} 寫法`}
                  placeholder="點左邊針法，或直接打字，例如 (X,V)*6"
                  spellCheck={false}
                  onFocus={() => { setFocused(row.id); p.onFocusRow(row.id); }}
                  onBlur={() => setFocused((f) => (f === row.id ? null : f))}
                  onChange={(e) => p.onChange(row.id, { text: e.target.value }, `text:${row.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); p.onAddAfter(row.id); } }}
                />
                {info.message && <span className="row-msg">{info.message}</span>}
              </div>
              <div className={`row-count${bad ? ' bad' : ''}`}>{info.status === 'syntax' || info.status === 'empty' ? '—' : `(${info.produced})`}</div>
              <div className="row-tools">
                {p.currentColor && n > 0 && (
                  <button title={`這一圈換成「${p.currentColor.name}」`} aria-label={`這一圈換成${p.currentColor.name}`} onClick={() => p.onPaintRow(row.id)}
                    style={{ width: 'auto', padding: '0 6px', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: p.currentColor.hex, border: '1px solid var(--line)' }} />整圈
                  </button>
                )}
                <button title="備註" aria-label="備註" onClick={() => setNotes((s) => new Set(s).add(row.id))}>✎</button>
                <button title="複製這一行到下方" aria-label="複製這一行" onClick={() => p.onDuplicate(row.id)}>⧉</button>
                <button title="上移" aria-label="上移" onClick={() => p.onMove(row.id, -1)}>↑</button>
                <button title="下移" aria-label="下移" onClick={() => p.onMove(row.id, 1)}>↓</button>
                <button title="刪除這一行" aria-label="刪除這一行" onClick={() => p.onDelete(row.id)}>✕</button>
              </div>
              {(() => {
                // One note per round that changes colour; a repeated row names each round.
                const notesHere = p.analysis.rounds.filter((r) => r.rowId === row.id && changes.has(r.no));
                if (!notesHere.length) return null;
                return (
                  <div className="row-colors">
                    {notesHere.map((r) => { const c = changes.get(r.no)!; return <ColorNote key={r.no} label={info.first !== info.last ? `R${r.no}` : undefined} spans={c.spans} whole={c.whole} />; })}
                  </div>
                );
              })()}
              {showNote && (
                <div className="row-note">
                  <input value={row.note} placeholder="備註，例如：這圈開始塞棉花" aria-label={`${label} 備註`} onChange={(e) => p.onChange(row.id, { note: e.target.value }, `note:${row.id}`)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button className="add-row" onClick={() => p.onAddAfter(p.part.rows[p.part.rows.length - 1]?.id ?? null)}>＋ 新增一圈（在輸入框按 Enter 也可以）</button>
    </div>
  );
}
