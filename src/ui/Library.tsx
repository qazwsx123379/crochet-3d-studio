import { useMemo, useState } from 'react';
import { actions, useStore } from '../store/store';
import type { Part, Work } from '../types';
import Thumb from './Thumb';
import ThemeMenu from './ThemeMenu';

function when(t: number): string {
  if (!t) return '範例';
  const d = new Date(t);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `今天 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function TopBar({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  return (
    <header className="topbar">
      <a className="brand" href="#/">鉤織 3D 工作室</a>
      <div className="spacer" />
      <label htmlFor="q" className="sr-only">搜尋</label>
      <input id="q" className="input" placeholder="搜尋作品、零件、標籤" value={query} onChange={(e) => onQuery(e.target.value)} style={{ width: 'min(360px, 40vw)', background: 'var(--bg)' }} />
      <ThemeMenu />
    </header>
  );
}

export default function Library() {
  const parts = useStore((s) => s.parts);
  const works = useStore((s) => s.works);
  const [tab, setTab] = useState<'works' | 'parts'>('parts');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const partList = useMemo(() => Object.values(parts).sort((a, b) => b.updatedAt - a.updatedAt), [parts]);
  const workList = useMemo(() => Object.values(works).sort((a, b) => b.updatedAt - a.updatedAt), [works]);
  const items: (Part | Work)[] = tab === 'parts' ? partList : workList;
  const tags = useMemo(() => [...new Set(items.flatMap((x) => x.tags))], [items]);
  const q = query.trim().toLowerCase();
  const filtered = items.filter((x) => (!tag || x.tags.includes(tag)) && (!q || x.name.toLowerCase().includes(q) || x.tags.some((t) => t.toLowerCase().includes(q))));

  const newPart = () => { const p = actions.createPart(); location.hash = `#/part/${p.id}`; };
  const newWork = () => { const w = actions.createWork(); location.hash = `#/work/${w.id}`; };

  return (
    <div className="page">
      <TopBar query={query} onQuery={setQuery} />
      <div className="lib">
        <div className="lib-head">
          <div role="tablist" style={{ display: 'flex', gap: 24 }}>
            <button className="tab" role="tab" aria-selected={tab === 'parts'} onClick={() => { setTab('parts'); setTag(null); }}>零件 {partList.length}</button>
            <button className="tab" role="tab" aria-selected={tab === 'works'} onClick={() => { setTab('works'); setTag(null); }}>作品 {workList.length}</button>
          </div>
          <div className="spacer" />
          <div style={{ display: 'flex', gap: 8, paddingBottom: 10 }}>
            <button className="btn" onClick={() => actions.resetSamples()} title="把範例零件恢復成原樣">恢復範例</button>
            {tab === 'parts' ? <button className="btn pri" onClick={newPart}>＋ 新增零件</button> : <button className="btn pri" onClick={newWork}>＋ 新增作品</button>}
          </div>
        </div>
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 13 }}>標籤</span>
            <button className="chip" aria-pressed={!tag} onClick={() => setTag(null)}>全部</button>
            {tags.map((t) => <button key={t} className="chip" aria-pressed={tag === t} onClick={() => setTag(t === tag ? null : t)}>{t}</button>)}
          </div>
        )}
        {filtered.length === 0 && <p className="muted">沒有符合的{tab === 'parts' ? '零件' : '作品'}。</p>}
        <div className="grid">
          {filtered.map((x) => {
            const isPart = tab === 'parts';
            const href = isPart ? `#/part/${x.id}` : `#/work/${x.id}`;
            const thumbParts = isPart ? [x as Part] : (x as Work).partIds.map((id) => parts[id]).filter(Boolean).slice(0, 3);
            const meta = isPart ? `${(x as Part).rows.reduce((n, r) => n + r.repeat, 0)} 圈・${when(x.updatedAt)}` : `${(x as Work).partIds.length} 個零件・${when(x.updatedAt)}`;
            return (
              <div key={x.id} className="card">
                <a href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="card-thumb">
                    {thumbParts.length ? thumbParts.map((p) => <Thumb key={p.id} part={p} size={thumbParts.length > 1 ? 80 : 140} />) : <span className="muted">還沒有零件</span>}
                  </div>
                </a>
                <div className="card-body">
                  <a href={href} className="card-title" style={{ textDecoration: 'none', color: 'inherit' }}>{x.name}</a>
                  <span className="muted" style={{ fontSize: 13 }}>{meta}</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {x.sample && <span className="tag">範例</span>}
                    {x.tags.map((t) => <span key={t} className="tag" style={{ background: 'var(--bg)', color: 'var(--muted)' }}>{t}</span>)}
                    <span className="spacer" />
                    {isPart && <button className="btn ghost sm" onClick={() => actions.duplicatePart(x.id)}>複製</button>}
                    {confirm === x.id ? (
                      <>
                        <button className="btn sm danger" onClick={() => { if (isPart) actions.deletePart(x.id); else actions.deleteWork(x.id); setConfirm(null); }}>確定刪除</button>
                        <button className="btn ghost sm" onClick={() => setConfirm(null)}>取消</button>
                      </>
                    ) : <button className="btn ghost sm" onClick={() => setConfirm(x.id)}>刪除</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>目前作品存在這台瀏覽器裡。接上雲端（第 0 階段）後，換電腦、手機也看得到。</p>
      </div>
    </div>
  );
}

export function WorkPage({ workId }: { workId: string }) {
  const work = useStore((s) => s.works[workId]);
  const parts = useStore((s) => s.parts);
  const [adding, setAdding] = useState(false);
  if (!work) return <div className="page"><div className="lib"><p>找不到這個作品。</p><a className="btn" href="#/">回作品庫</a></div></div>;
  const mine = work.partIds.map((id) => parts[id]).filter(Boolean);
  const others = Object.values(parts).filter((p) => !work.partIds.includes(p.id));
  const save = (w: Partial<Work>) => actions.saveWork({ ...work, ...w });
  return (
    <div className="page">
      <header className="topbar">
        <a className="brand" href="#/">鉤織 3D 工作室</a>
        <nav className="crumbs"><a href="#/">作品庫</a><span>/</span><b>{work.name}</b></nav>
        <div className="spacer" />
        <ThemeMenu />
      </header>
      <div className="lib">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="wname" className="sr-only">作品名稱</label>
          <input id="wname" className="input" value={work.name} onChange={(e) => save({ name: e.target.value })} style={{ fontFamily: 'var(--f-display)', fontSize: 24, height: 48, flex: '1 1 260px' }} />
          <button className="btn" onClick={() => setAdding((a) => !a)}>{adding ? '完成' : '＋ 加入已有的零件'}</button>
          <button className="btn pri" onClick={() => { const p = actions.createPart(); save({ partIds: [...work.partIds, p.id] }); location.hash = `#/part/${p.id}`; }}>＋ 新零件</button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>在 3D 裡把零件拼起來的「組裝」會在第 6 階段做好；現在先把同一個作品的零件放在一起。</p>
        {adding && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {others.length ? others.map((p) => <button key={p.id} className="chip" onClick={() => save({ partIds: [...work.partIds, p.id] })}>＋ {p.name}</button>) : <span className="muted">所有零件都已經在這個作品裡。</span>}
          </div>
        )}
        <div className="grid">
          {mine.map((p) => (
            <div key={p.id} className="card">
              <a href={`#/part/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}><div className="card-thumb"><Thumb part={p} /></div></a>
              <div className="card-body">
                <a href={`#/part/${p.id}`} className="card-title" style={{ textDecoration: 'none', color: 'inherit' }}>{p.name}</a>
                <div style={{ display: 'flex' }}><span className="spacer" /><button className="btn ghost sm" onClick={() => save({ partIds: work.partIds.filter((id) => id !== p.id) })}>從作品移除</button></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
