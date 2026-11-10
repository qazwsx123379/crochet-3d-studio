import { useEffect, useRef, useState } from 'react';
import type { Part, YarnColor } from '../types';
import { YARN_LINES, newId } from '../store/yarns';

interface Props {
  part: Part;
  /** Which section opens first. */
  focus?: 'settings' | 'palette';
  onSave: (p: Part) => void;
  onClose: () => void;
  usage: Record<string, number>;
  /** First time for a new part: ask how it starts before anything else. */
  fresh?: boolean;
}

const HOOKS = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];

export default function PartSettingsDialog({ part, focus, onSave, onClose, usage, fresh }: Props) {
  const [draft, setDraft] = useState<Part>(() => structuredClone(part));
  const [picker, setPicker] = useState(false);
  const s = draft.settings;
  const set = (patch: Partial<Part['settings']>) => setDraft((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const setColor = (id: string, patch: Partial<YarnColor>) => setDraft((d) => ({ ...d, palette: d.palette.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const addColor = (c: Omit<YarnColor, 'id'>) => setDraft((d) => ({ ...d, palette: [...d.palette, { ...c, id: newId('c') }] }));
  const removeColor = (id: string) => setDraft((d) => {
    if (d.palette.length <= 1) return d;
    const strip = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== id));
    return { ...d, palette: d.palette.filter((c) => c.id !== id), stitchColors: strip(d.stitchColors), roundColors: strip(d.roundColors) };
  });

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (focus === 'palette') document.getElementById('palette-section')?.scrollIntoView(); }, [focus]);

  const opt = <K extends keyof Part['settings']>(key: K, value: Part['settings'][K], title: string, sub: string) => (
    <button type="button" className="opt" aria-pressed={s[key] === value} onClick={() => set({ [key]: value } as Partial<Part['settings']>)}><b>{title}</b><span>{sub}</span></button>
  );

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-label="零件設定">
        <div className="dialog-head">
          <h2>{fresh ? '新零件：先選怎麼開始' : `零件設定・${part.name}`}</h2>
          <button className="btn ghost icon" aria-label="關閉" onClick={onClose}>✕</button>
        </div>
        {fresh && <p style={{ margin: '14px 24px 0', fontSize: 14 }} className="muted">玩偶、帽子通常用「魔術環」從中心往外繞圈；鞋底、橢圓或片織用「鎖針起針」。之後隨時可以在上方的設定列或「零件設定」修改。</p>}
        <div className="dialog-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="field"><label htmlFor="pname">名稱</label><input id="pname" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="field"><span>織法</span>
              <div className="opts">
                {opt('method', 'spiral', '螺旋繞圈', '不引拔，玩偶常用')}
                {opt('method', 'joined', '每圈引拔', '每圈接合再立起')}
                {opt('method', 'flat', '往返片織', '每行翻面')}
              </div>
            </div>
            <div className="field"><span>起針</span>
              <div className="opts">
                {opt('start', 'ring', '環形起針（魔術環）', '從中心往外繞圈')}
                {opt('start', 'chain', '鎖針起針', '第一行寫 ch10 這種鎖針數')}
              </div>
            </div>
            <div className="field"><span>3D 擺法</span>
              <label style={{ fontSize: 14, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!s.flip} onChange={(e) => set({ flip: e.target.checked })} />倒過來放（帽子這種從尖端開始鉤的）</label>
              {s.method === 'flat' && <label style={{ fontSize: 14, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!s.roll} onChange={(e) => set({ roll: e.target.checked })} />鉤完捲起來（玫瑰花、奶油花邊）</label>}
            </div>
            <div className="field"><label htmlFor="ptags">標籤（用逗號分開）</label>
              <input id="ptags" className="input" value={draft.tags.join('，')} onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(/[,，、]/).map((t) => t.trim()).filter(Boolean) })} />
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 13, background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>立起的鎖針不算進該圈針數（日式慣例），全系統統一。</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label htmlFor="pyarn">線材</label>
                <select id="pyarn" className="input" value={s.yarn} onChange={(e) => set({ yarn: e.target.value })}>
                  {YARN_LINES.map((y) => <option key={y.brand}>{y.brand}</option>)}
                  <option>其他</option>
                </select>
              </div>
              <div className="field"><label htmlFor="phook">鉤針號數</label>
                <select id="phook" className="input" value={s.hook} onChange={(e) => set({ hook: Number(e.target.value) })}>
                  {HOOKS.map((h) => <option key={h} value={h}>{h.toFixed(1)} mm</option>)}
                </select>
              </div>
            </div>
            <div id="palette-section" style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>色票盤（{draft.palette.length} 色）</span>
              <button className="btn sm" onClick={() => setPicker((v) => !v)}>{picker ? '收起品牌色' : '＋ 從品牌選色'}</button>
              <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => addColor({ name: '自訂顏色', hex: '#B9C4C2', brand: '', code: '' })}>＋ 自訂</button>
            </div>
            {picker && (
              <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {YARN_LINES.map((y) => (
                  <div key={y.brand}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{y.brand} <span className="muted" style={{ fontWeight: 400 }}>・顏色為近似值，色號待補</span></div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {y.colors.map((c) => <button key={c.name} title={c.name} aria-label={`${y.brand} ${c.name}`} onClick={() => addColor({ name: c.name, hex: c.hex, brand: y.brand, code: '' })} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--line)', background: c.hex }} />)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
              {draft.palette.map((c) => (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) 110px 64px 32px', gap: 8, alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid var(--divider)' }}>
                  <input type="color" value={c.hex} aria-label={`${c.name} 顏色`} onChange={(e) => setColor(c.id, { hex: e.target.value })} style={{ width: 34, height: 34, border: 0, padding: 0, background: 'none' }} />
                  <input className="input" style={{ height: 32 }} value={c.name} aria-label="顏色名稱" onChange={(e) => setColor(c.id, { name: e.target.value })} />
                  <input className="input" style={{ height: 32 }} value={c.code} placeholder={c.brand ? '色號' : '—'} aria-label="色號" onChange={(e) => setColor(c.id, { code: e.target.value })} />
                  <span className="muted" style={{ fontSize: 12, textAlign: 'right', fontFamily: 'var(--f-mono)' }}>{usage[c.id] ?? 0} 針</span>
                  <button className="btn ghost icon" style={{ width: 30, height: 30 }} aria-label={`刪除 ${c.name}`} disabled={draft.palette.length <= 1} onClick={() => removeColor(c.id)}>✕</button>
                </div>
              ))}
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>刪除顏色後，用到它的針會變回這一圈的預設顏色。</p>
          </div>
        </div>
        <div className="dialog-foot">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn pri" onClick={() => onSave(draft)}>{fresh ? '開始寫織圖' : '儲存'}</button>
        </div>
      </section>
    </div>
  );
}
