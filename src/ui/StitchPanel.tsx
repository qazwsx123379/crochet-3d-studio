import { useState } from 'react';
import { STITCH_BY_CODE } from '../pattern/stitches';
import type { YarnColor } from '../types';
import { actions, useStore } from '../store/store';

export type PaintTool = 'select' | 'stitch' | 'segment' | 'round';

interface Props {
  onStitch: (code: string) => void;
  onWrap: (kind: 'repeat' | 'same' | 'BLO' | 'FLO' | 'times') => void;
  palette: YarnColor[];
  color: string;
  onColor: (id: string) => void;
  tool: PaintTool;
  onTool: (t: PaintTool) => void;
  onEditPalette: () => void;
}

const FIRST = 15;

export default function StitchPanel({ onStitch, onWrap, palette, color, onColor, tool, onTool, onEditPalette }: Props) {
  const order = useStore((s) => s.prefs.stitchOrder);
  const [more, setMore] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const shown = more ? order : order.slice(0, FIRST);
  const current = palette.find((c) => c.id === color);

  const drop = (target: string) => {
    if (!drag || drag === target) return;
    const next = order.filter((c) => c !== drag);
    next.splice(next.indexOf(target), 0, drag);
    actions.setPrefs({ stitchOrder: next });
  };

  // Buttons keep focus in the row being edited, so the stitch lands at the cursor.
  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <aside className="ed-left" aria-label="針法與顏色">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">針法</span>
        <span className="muted hide-phone" style={{ fontSize: 12 }}>拖拉可排序</span>
      </div>
      <div className="st-grid">
        {shown.map((code) => {
          const d = STITCH_BY_CODE[code];
          if (!d) return null;
          return (
            <button
              key={code}
              className={`st${drag === code ? ' dragging' : ''}${over === code && drag !== code ? ' drop' : ''}`}
              draggable
              onDragStart={(e) => { setDrag(code); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { e.preventDefault(); setOver(code); }}
              onDragLeave={() => setOver((o) => (o === code ? null : o))}
              onDrop={(e) => { e.preventDefault(); drop(code); setDrag(null); setOver(null); }}
              onDragEnd={() => { setDrag(null); setOver(null); }}
              onMouseDown={keep}
              onClick={() => onStitch(code)}
              title={`${d.name}（用掉 ${d.consumes} 針，產生 ${d.produces} 針）${d.key ? `・快速鍵 ${d.key.toUpperCase()}` : ''}`}
            >
              {d.key && <i>{d.key}</i>}
              <b>{d.code}</b>
              <span>{d.short}</span>
            </button>
          );
        })}
        <button className="st" onClick={() => setMore((m) => !m)} onMouseDown={keep}>
          <b>{more ? '−' : '…'}</b>
          <span>{more ? '收起' : `更多 ${order.length - FIRST} 種`}</span>
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn sm" onMouseDown={keep} onClick={() => onWrap('repeat')} title="把選取的針包成一組重複">( ) 重複</button>
        <button className="btn sm" onMouseDown={keep} onClick={() => onWrap('times')} title="插入 *，後面接次數">× 次數</button>
        <button className="btn sm" onMouseDown={keep} onClick={() => onWrap('same')} title="鉤在同一針裡">[ ] 同一針</button>
        <button className="btn sm" onMouseDown={keep} onClick={() => onWrap('FLO')}>FLO 前半針</button>
        <button className="btn sm" onMouseDown={keep} onClick={() => onWrap('BLO')}>BLO 後半針</button>
      </div>
      <div style={{ height: 1, background: 'var(--line)', flex: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="label">色票盤</span>
        <button className="btn ghost sm" onClick={onEditPalette}>編輯色票</button>
      </div>
      <div className="swatches" role="group" aria-label="選擇顏色">
        {palette.map((c) => (
          <button key={c.id} className="swatch" style={{ background: c.hex }} aria-pressed={c.id === color} aria-label={c.name} title={`${c.name}${c.brand ? `・${c.brand}` : ''}`} onClick={() => onColor(c.id)} />
        ))}
      </div>
      {current && <div className="muted" style={{ fontSize: 13 }}>目前：<b style={{ color: 'var(--ink)' }}>{current.name}</b>{current.brand && `・${current.brand} ${current.code || '色號待補'}`}</div>}
      <div className="seg" role="group" aria-label="上色方式" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
        {([['select', '只選取'], ['stitch', '點一針'], ['segment', '拖曳一段'], ['round', '整圈']] as const).map(([k, label]) => (
          <button key={k} aria-pressed={tool === k} onClick={() => onTool(k)}>{label}</button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        {tool === 'select' ? '點 3D、符號圖或顏色條，只會選取那一針。' : tool === 'segment' ? '在顏色條上按住拖曳；或在 3D、符號圖上先點起點再點終點（同一圈）。' : tool === 'round' ? '點任一針，整圈換成目前顏色。' : '點 3D、符號圖或顏色條上的針，換成目前顏色。'}
      </p>
    </aside>
  );
}
