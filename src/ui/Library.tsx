import { saveFile } from '../saveFile';
import { useMemo, useState } from 'react';
import { CLOUD, actions, useStore } from '../store/store';
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

  const [note, setNote] = useState('');
  const exportAll = () => {
    const data = { app: 'crochet-3d-studio', version: 1, exportedAt: new Date().toISOString(), parts: Object.values(parts), works: Object.values(works) };
    void saveFile(`鉤織備份_${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  };
  const importFile = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      const ps = Array.isArray(data) ? data : data.parts ?? (data.rows ? [data] : []);
      const ws = data.works ?? [];
      const n = actions.importData(ps, ws);
      setNote(n.parts || n.works ? `匯入了 ${n.parts} 個零件、${n.works} 個作品` : '這個檔案裡沒有找到零件或作品');
    } catch {
      setNote('看不懂這個檔案，請選擇從這裡匯出的 JSON 檔');
    }
    setTimeout(() => setNote(''), 4000);
  };

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
            <button className="btn" onClick={exportAll} title="把所有零件和作品存成一個 JSON 檔">備份全部</button>
            <label className="btn" title="從 JSON 備份檔匯入零件和作品" style={{ cursor: 'pointer' }}>
              匯入
              <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
            </label>
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
        {note && <p role="status" className="status-pill" style={{ alignSelf: 'flex-start' }}>{note}</p>}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <a href={href} className="card-title" style={{ textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</a>
                    {x.sample && <span className="tag">範例</span>}
                  </div>
                  <span className="muted" style={{ fontSize: 13 }}>{meta}</span>
                  {x.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {x.tags.map((t) => <span key={t} className="tag" style={{ background: 'var(--bg)', color: 'var(--muted)' }}>{t}</span>)}
                    </div>
                  )}
                  <div className="card-actions">
                    {confirm === x.id ? (
                      <>
                        <span className="muted" style={{ fontSize: 13, marginRight: 'auto' }}>確定要刪除？</span>
                        <button className="btn ghost sm" onClick={() => setConfirm(null)}>取消</button>
                        <button className="btn sm danger" onClick={() => { if (isPart) actions.deletePart(x.id); else actions.deleteWork(x.id); setConfirm(null); }}>刪除</button>
                      </>
                    ) : (
                      <>
                        {isPart && <button className="btn ghost sm" onClick={() => actions.duplicatePart(x.id)}>複製</button>}
                        <button className="btn ghost sm" onClick={() => setConfirm(x.id)}>刪除</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>{CLOUD ? '作品存在你的雲端帳號，換電腦、手機也看得到；看過的作品沒有網路時也能打開。' : '這是預覽版，作品只存在這台瀏覽器裡。正式網址登入後會存到雲端。'}</p>
      </div>
    </div>
  );
}
