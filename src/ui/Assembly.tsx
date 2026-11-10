/**
 * 組裝: put a work's parts together in 3D. Parts can be dragged, turned,
 * resized, copied and mirrored; "part A round X onto part B round Y" lines two
 * rounds up; copies can be spread evenly along a round; safety eyes, noses,
 * mouths and bows are placed by clicking the surface.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { Accessory, AccessoryKind, Part, V3, Work, WorkItem } from '../types';
import { actions, useCanEdit, useStore } from '../store/store';
import { newId } from '../store/yarns';
import ThemeMenu from './ThemeMenu';
import { alignItems, defaultItems, partData, roundNumbers, spreadAlong, stitchCount } from '../three/assembly';
import type { GizmoMode, Selection } from '../three/AssemblyScene';

const AssemblyScene = lazy(() => import('../three/AssemblyScene'));
const ExportDialog = lazy(() => import('./ExportDialog'));

export const ACCESSORIES: { kind: AccessoryKind; name: string; color: string; size: number; icon: string }[] = [
  { kind: 'eye', name: '安全眼', color: '#151515', size: 1.2, icon: '●' },
  { kind: 'nose', name: '鼻子', color: '#3a2a22', size: 1.2, icon: '▼' },
  { kind: 'mouth', name: '刺繡嘴巴', color: '#3a2a22', size: 1.6, icon: '◡' },
  { kind: 'blush', name: '腮紅', color: '#f29aa6', size: 1.6, icon: '◍' },
  { kind: 'bow', name: '蝴蝶結', color: '#e0465c', size: 2, icon: '⋈' },
  { kind: 'button', name: '鈕扣', color: '#f4d35e', size: 1.2, icon: '◎' },
];
const accName = (k: AccessoryKind) => ACCESSORIES.find((a) => a.kind === k)?.name ?? k;

function Num({ label, value, step = 0.5, onChange }: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <label className="asm-num">
      <span>{label}</span>
      <input type="number" step={step} value={text ?? String(Math.round(value * 100) / 100)}
        onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n)) onChange(n); }}
        onBlur={() => setText(null)} />
    </label>
  );
}

export function WorkPage({ workId }: { workId: string }) {
  const work = useStore((s) => s.works[workId]);
  const parts = useStore((s) => s.parts);
  const prefs = useStore((s) => s.prefs);
  const [selected, setSelected] = useState<Selection>(null);
  const [mode, setMode] = useState<GizmoMode>('translate');
  const [placing, setPlacing] = useState<AccessoryKind | null>(null);
  const [view, setView] = useState<{ name: 'front' | 'side' | 'top'; n: number }>({ name: 'front', n: 0 });
  const [fit, setFit] = useState(0);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState('');
  const canEdit = useCanEdit();

  // A work arranged before assembly existed gets a starting layout, saved once.
  useEffect(() => {
    if (work && !work.items) actions.saveWork({ ...work, items: defaultItems(work, parts, true), accessories: work.accessories ?? [] });
  }, [work?.id, !!work?.items]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => work?.items ?? [], [work?.items]);
  const accessories = useMemo(() => work?.accessories ?? [], [work?.accessories]);
  const total = useMemo(() => items.reduce((n, it) => n + (parts[it.partId] ? stitchCount(parts[it.partId]) : 0), 0), [items, parts]);
  const yarn = prefs.yarn && total <= 14000;
  const dataOf = useCallback((p: Part) => partData(p, yarn), [yarn]);

  if (!work) return <div className="page"><div className="lib"><p>找不到這個作品。</p><a className="btn" href="#/">回作品庫</a></div></div>;

  const save = (patch: Partial<Work>) => {
    if (!canEdit) { flash('目前沒有網路：恢復連線後才能修改'); return; }
    const next = { ...work, ...patch };
    // The part list follows what is placed, so the library and exports stay in step.
    if (patch.items) next.partIds = [...new Set([...patch.items.map((i) => i.partId)])];
    actions.saveWork(next);
  };
  const setItems = (list: WorkItem[]) => save({ items: list });
  const setAccs = (list: Accessory[]) => save({ accessories: list });
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(''), 2600); };

  const selItem = selected?.kind === 'item' ? items.find((i) => i.id === selected.id) : undefined;
  const selAcc = selected?.kind === 'acc' ? accessories.find((a) => a.id === selected.id) : undefined;
  const patchItem = (id: string, patch: Partial<WorkItem>) => setItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const patchAcc = (id: string, patch: Partial<Accessory>) => setAccs(accessories.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const addPart = (p: Part) => {
    const d = dataOf(p);
    const x = items.length ? Math.max(...items.map((i) => i.pos[0])) + (d ? d.radius * 2 : 6) : 0;
    const it: WorkItem = { id: newId('item'), partId: p.id, pos: [x, 0, 0], rot: [0, 0, 0], scale: 1 };
    setItems([...items, it]);
    setSelected({ kind: 'item', id: it.id });
    setAdding(false);
    setFit((f) => f + 1);
  };
  const duplicate = (it: WorkItem, mirror: boolean) => {
    const copy: WorkItem = mirror
      ? { ...it, id: newId('item'), pos: [-it.pos[0], it.pos[1], it.pos[2]], rot: [it.rot[0], -it.rot[1], -it.rot[2]], mirror: !it.mirror }
      : { ...it, id: newId('item'), pos: [it.pos[0] + 2, it.pos[1], it.pos[2]] };
    setItems([...items, copy]);
    setSelected({ kind: 'item', id: copy.id });
  };
  const place = (pos: V3, normal: V3) => {
    if (!placing) return;
    const def = ACCESSORIES.find((a) => a.kind === placing)!;
    const a: Accessory = { id: newId('acc'), kind: placing, pos, normal, spin: 0, size: def.size, color: def.color };
    setAccs([...accessories, a]);
    setSelected({ kind: 'acc', id: a.id });
    setPlacing(null);
  };

  const libraryParts = Object.values(parts).sort((a, b) => b.updatedAt - a.updatedAt);
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.partId, (counts.get(it.partId) ?? 0) + 1);

  return (
    <div className="page asm-page">
      <header className="topbar">
        <a className="brand" href="#/">鉤織 3D 工作室</a>
        <nav className="crumbs"><a href="#/">作品庫</a><span>/</span><b>組裝</b></nav>
        <label htmlFor="wname" className="sr-only">作品名稱</label>
        <input id="wname" className="name-input" value={work.name} onChange={(e) => save({ name: e.target.value })} />
        <div className="spacer" />
        <button className="btn" onClick={() => setExporting(true)}>匯出</button>
        <ThemeMenu />
      </header>
      <div className="asm">
        <aside className="asm-left">
          <h3 className="label">零件</h3>
          <ul className="asm-list">
            {items.map((it) => {
              const p = parts[it.partId];
              const on = selected?.kind === 'item' && selected.id === it.id;
              return (
                <li key={it.id}>
                  <button className={`asm-row${on ? ' on' : ''}`} onClick={() => setSelected({ kind: 'item', id: it.id })}>
                    <span className="asm-name">{p?.name ?? '（零件已刪除）'}{it.mirror ? '・鏡像' : ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={() => setAdding((a) => !a)}>{adding ? '收起' : '＋ 加入零件'}</button>
            <button className="btn sm ghost" onClick={() => { const p = actions.createPart(); save({ items: [...items, { id: newId('item'), partId: p.id, pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 }] }); location.hash = `#/part/${p.id}`; }}>＋ 新零件</button>
          </div>
          {adding && (
            <div className="asm-add">
              {libraryParts.map((p) => (
                <button key={p.id} className="chip" onClick={() => addPart(p)}>＋ {p.name}{counts.get(p.id) ? ` (已有 ${counts.get(p.id)})` : ''}</button>
              ))}
            </div>
          )}
          <h3 className="label" style={{ marginTop: 18 }}>配件</h3>
          <div className="asm-accs">
            {ACCESSORIES.map((a) => (
              <button key={a.kind} className={`st${placing === a.kind ? ' on' : ''}`} aria-pressed={placing === a.kind} onClick={() => setPlacing((k) => (k === a.kind ? null : a.kind))}>
                <b style={{ color: a.color }}>{a.icon}</b><small>{a.name}</small>
              </button>
            ))}
          </div>
          {accessories.length > 0 && (
            <ul className="asm-list">
              {accessories.map((a) => (
                <li key={a.id}><button className={`asm-row${selected?.kind === 'acc' && selected.id === a.id ? ' on' : ''}`} onClick={() => setSelected({ kind: 'acc', id: a.id })}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: a.color, display: 'inline-block' }} /> <span className="asm-name">{accName(a.kind)}</span>
                </button></li>
              ))}
            </ul>
          )}
        </aside>

        <section className="asm-stage" aria-label="3D 組裝">
          <div className="asm-tools">
            <div className="seg" role="group" aria-label="拖曳工具">
              <button aria-pressed={mode === 'translate'} onClick={() => setMode('translate')}>移動</button>
              <button aria-pressed={mode === 'rotate'} onClick={() => setMode('rotate')}>旋轉</button>
              <button aria-pressed={mode === 'scale'} onClick={() => setMode('scale')}>大小</button>
            </div>
            <div className="spacer" />
            <button className="btn sm ghost" onClick={() => setView((v) => ({ name: 'front', n: v.n + 1 }))}>正</button>
            <button className="btn sm ghost" onClick={() => setView((v) => ({ name: 'side', n: v.n + 1 }))}>側</button>
            <button className="btn sm ghost" onClick={() => setView((v) => ({ name: 'top', n: v.n + 1 }))}>俯</button>
            <button className="btn sm ghost" onClick={() => setFit((f) => f + 1)}>看全部</button>
            <button className="btn sm ghost" title="把零件重新排成預設的樣子（配件會保留）" onClick={() => { save({ items: defaultItems(work, parts, true) }); setSelected(null); setFit((f) => f + 1); }}>還原預設擺法</button>
          </div>
          {placing && <div className="asm-hint">點零件表面，把「{accName(placing)}」放上去 <button className="btn sm ghost" onClick={() => setPlacing(null)}>取消</button></div>}
          {!placing && !selected && <div className="asm-hint subtle">點一個零件選取它，再拖曳箭頭移動；左邊可以加入配件</div>}
          {toast && <div className="asm-hint">{toast}</div>}
          <Suspense fallback={<div className="splash"><span className="muted">載入 3D…</span></div>}>
            <AssemblyScene items={items} accessories={accessories} parts={parts} dataOf={dataOf} yarn={yarn} selected={selected} mode={mode} placing={placing}
              view={view} fitKey={`${work.id}-${fit}`} onSelect={setSelected}
              onItemMove={(id, patch) => patchItem(id, patch)} onAccMove={(id, patch) => patchAcc(id, patch)} onPlace={place} />
          </Suspense>
        </section>

        <aside className="asm-right">
          {selItem ? (
            <ItemPanel key={selItem.id} item={selItem} items={items} parts={parts} dataOf={dataOf}
              onChange={(patch) => patchItem(selItem.id, patch)}
              onDuplicate={(m) => duplicate(selItem, m)}
              onDelete={() => { setItems(items.filter((i) => i.id !== selItem.id)); setSelected(null); }}
              onSpread={(list) => { setItems([...items, ...list]); flash(`排好了 ${list.length} 個`); }}
              onFlash={flash} />
          ) : selAcc ? (
            <div className="asm-panel">
              <h3>{accName(selAcc.kind)}</h3>
              <Num label="大小" value={selAcc.size} step={0.1} onChange={(v) => patchAcc(selAcc.id, { size: Math.max(0.1, v) })} />
              <Num label="轉角度" value={selAcc.spin} step={15} onChange={(v) => patchAcc(selAcc.id, { spin: v })} />
              <label className="asm-num"><span>顏色</span><input type="color" value={selAcc.color} onChange={(e) => patchAcc(selAcc.id, { color: e.target.value })} /></label>
              <p className="muted" style={{ fontSize: 12 }}>拖曳箭頭移動；想換位置也可以刪掉後重新點表面放。</p>
              <div className="asm-actions">
                <button className="btn sm" onClick={() => {
                  const c: Accessory = { ...selAcc, id: newId('acc'), pos: [-selAcc.pos[0], selAcc.pos[1], selAcc.pos[2]], normal: [-selAcc.normal[0], selAcc.normal[1], selAcc.normal[2]], spin: -selAcc.spin };
                  setAccs([...accessories, c]); setSelected({ kind: 'acc', id: c.id });
                }}>鏡像複製（左右對稱）</button>
                <button className="btn sm danger" onClick={() => { setAccs(accessories.filter((a) => a.id !== selAcc.id)); setSelected(null); }}>刪除</button>
              </div>
            </div>
          ) : (
            <div className="asm-panel">
              <h3>怎麼組裝</h3>
              <ol className="muted" style={{ fontSize: 13, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>點 3D 裡的零件（或左邊清單）選取它。</li>
                <li>用上方「移動／旋轉／大小」拖曳箭頭，或在右邊輸入數字。</li>
                <li>「接到」可以讓兩個零件的某一圈自動對齊，例如腳的最後一圈接身體第 12 圈。</li>
                <li>「沿著一圈排列」可以一次放好很多個，例如蛋糕上的櫻桃。</li>
                <li>配件：先點左邊的安全眼、鼻子…，再點零件表面。</li>
              </ol>
              <p className="muted" style={{ fontSize: 12 }}>共 {items.length} 個零件、{accessories.length} 個配件・{total} 針{yarn ? '' : '（針數太多，用平滑表面顯示）'}</p>
            </div>
          )}
        </aside>
      </div>
      {exporting && <Suspense fallback={null}><ExportDialog kind="work" work={work} onClose={() => setExporting(false)} /></Suspense>}
    </div>
  );
}

function ItemPanel({ item, items, parts, dataOf, onChange, onDuplicate, onDelete, onSpread, onFlash }: {
  item: WorkItem; items: WorkItem[]; parts: Record<string, Part>; dataOf: (p: Part) => ReturnType<typeof partData>;
  onChange: (p: Partial<WorkItem>) => void; onDuplicate: (mirror: boolean) => void; onDelete: () => void; onSpread: (list: WorkItem[]) => void; onFlash: (t: string) => void;
}) {
  const part = parts[item.partId];
  const data = part ? dataOf(part) : null;
  const mine = data ? roundNumbers(data) : [];
  const others = items.filter((i) => i.id !== item.id && parts[i.partId]);
  const [myRound, setMyRound] = useState(mine[mine.length - 1] ?? 1);
  const [otherId, setOtherId] = useState(others[0]?.id ?? '');
  const other = others.find((i) => i.id === otherId) ?? others[0];
  const otherData = other ? dataOf(parts[other.partId]) : null;
  const theirs = otherData ? roundNumbers(otherData) : [];
  const [theirRound, setTheirRound] = useState(0);
  const tr = theirs.includes(theirRound) ? theirRound : theirs[theirs.length - 1] ?? 1;
  const [count, setCount] = useState(6);

  if (!part || !data) return <div className="asm-panel"><p className="muted">這個零件已經被刪除或還沒有內容。</p><button className="btn sm danger" onClick={onDelete}>從作品移除</button></div>;
  const align = (flip: boolean) => {
    if (!other || !otherData) return;
    const next = alignItems({ part, data, item }, myRound, { part: parts[other.partId], data: otherData, item: other }, tr, flip);
    if (next) { onChange({ pos: next.pos, rot: next.rot }); onFlash(`${part.name} 第 ${myRound} 圈已接到 ${parts[other.partId].name} 第 ${tr} 圈`); }
  };
  const spread = () => {
    if (!other || !otherData) return;
    // The selected part is the one being copied; it lines up along the other part's round.
    onSpread(spreadAlong(part, data, item.scale, { part: parts[other.partId], data: otherData, item: other }, tr, count));
  };
  const v = (k: 'pos' | 'rot', i: number, n: number) => { const a = [...item[k]] as V3; a[i] = n; onChange({ [k]: a }); };
  return (
    <div className="asm-panel">
      <h3>{part.name}</h3>
      <a className="btn sm ghost" href={`#/part/${part.id}`}>編輯織圖 →</a>
      <div className="asm-grid">
        <span className="muted">位置</span>
        <Num label="X" value={item.pos[0]} onChange={(n) => v('pos', 0, n)} />
        <Num label="Y" value={item.pos[1]} onChange={(n) => v('pos', 1, n)} />
        <Num label="Z" value={item.pos[2]} onChange={(n) => v('pos', 2, n)} />
        <span className="muted">旋轉</span>
        <Num label="X" value={item.rot[0]} step={15} onChange={(n) => v('rot', 0, n)} />
        <Num label="Y" value={item.rot[1]} step={15} onChange={(n) => v('rot', 1, n)} />
        <Num label="Z" value={item.rot[2]} step={15} onChange={(n) => v('rot', 2, n)} />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Num label="大小" value={item.scale} step={0.1} onChange={(n) => onChange({ scale: Math.max(0.05, n) })} />
        <label style={{ fontSize: 13, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={!!item.mirror} onChange={(e) => onChange({ mirror: e.target.checked })} />左右鏡像</label>
      </div>
      <div className="asm-actions">
        <button className="btn sm" onClick={() => onDuplicate(false)}>複製一個</button>
        <button className="btn sm" onClick={() => onDuplicate(true)}>鏡像複製到另一邊</button>
        <button className="btn sm danger" onClick={onDelete}>移除</button>
      </div>
      {others.length > 0 && (
        <>
          <h4>接到另一個零件</h4>
          <div className="asm-join">
            <span>這個零件的第</span>
            <select value={myRound} onChange={(e) => setMyRound(Number(e.target.value))}>{mine.map((n) => <option key={n} value={n}>{n}</option>)}</select>
            <span>圈，接到</span>
            <select value={other?.id} onChange={(e) => setOtherId(e.target.value)}>{others.map((o) => <option key={o.id} value={o.id}>{parts[o.partId].name}{o.mirror ? '（鏡像）' : ''}</option>)}</select>
            <span>的第</span>
            <select value={tr} onChange={(e) => setTheirRound(Number(e.target.value))}>{theirs.map((n) => <option key={n} value={n}>{n}</option>)}</select>
            <span>圈</span>
          </div>
          <div className="asm-actions">
            <button className="btn sm pri" onClick={() => align(false)}>對齊接上</button>
            <button className="btn sm" onClick={() => align(true)} title="開口朝同一個方向，例如反折的帽簷">反方向接</button>
          </div>
          <h4>沿著一圈排列</h4>
          <div className="asm-join">
            <span>把這個零件沿著上面選的那一圈，平均放</span>
            <input type="number" min={1} max={60} value={count} onChange={(e) => setCount(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} style={{ width: 56 }} />
            <span>個</span>
          </div>
          <button className="btn sm" onClick={spread}>排列</button>
        </>
      )}
    </div>
  );
}
