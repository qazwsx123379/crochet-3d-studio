import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Part } from '../types';
import type { PatternRow, RoundInfo } from '../pattern/analyze';
import { analyze } from '../pattern/analyze';
import { roundColorIds, roundHexes, roundKey, stitchKey } from '../pattern/colors';
import { STITCHES, STITCH_BY_CODE } from '../pattern/stitches';
import { prepareRender } from '../three/render';
import type { Pick, ViewName } from '../three/Preview3D';
import { THEMES } from '../themes';
import { actions, useSaveStatus, useStore } from '../store/store';
import { newId } from '../store/yarns';
import { useHistory } from './useHistory';
import StitchPanel, { type PaintTool } from './StitchPanel';
import RowList from './RowList';
import SymbolChart from './SymbolChart';
import PartSettingsDialog from './PartSettingsDialog';
import ImportDialog from './ImportDialog';
import ThemeMenu from './ThemeMenu';
import ComboBuilder, { type ComboKind } from './ComboBuilder';

const Preview3D = lazy(() => import('../three/Preview3D'));

const METHOD_LABEL = { spiral: '螺旋繞圈', joined: '每圈引拔', flat: '往返片織' } as const;
const START_LABEL = { ring: '魔術環起針', chain: '鎖針起針' } as const;

/** Text to insert so a new stitch is separated from the one before it. */
function joinToken(before: string, token: string): string {
  const b = before.replace(/\s+$/, '');
  if (!b || /[([,，、【（]$/.test(b)) return token;
  if (/\*\s*\d+$/.test(b)) return `,${token}`; // after a repeat count
  if (/\d$/.test(b)) return token; // a count prefix such as 6X
  return `,${token}`;
}

function usePhone() {
  const q = '(max-width: 899px)';
  const [phone, setPhone] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

export default function Editor({ partId }: { partId: string }) {
  const phone = usePhone();
  const save = useSaveStatus();
  const stored = useStore((s) => s.parts[partId]);
  const prefs = useStore((s) => s.prefs);
  const hist = useHistory<Part | undefined>(stored);
  const part = hist.value;

  // Open another part → start a fresh history.
  useEffect(() => { hist.reset(stored); }, [partId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Save every edit (the store writes to this browser after a short pause).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (part) actions.savePart(part);
  }, [part]);

  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Pick | null>(null);
  const [tool, setTool] = useState<PaintTool>('select');
  const [colorId, setColorId] = useState<string>('');
  const [center, setCenter] = useState<'text' | 'chart'>('text');
  const [tab, setTab] = useState<'pattern' | '3d' | 'chart'>('pattern');
  const [view, setView] = useState<{ name: ViewName; n: number }>({ name: 'front', n: 0 });
  const [autoRotate, setAutoRotate] = useState(false);
  const [upTo, setUpTo] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [dialog, setDialog] = useState<null | 'settings' | 'palette' | 'import'>(null);
  const [combo, setCombo] = useState<ComboKind | null>(null);
  const [toast, setToast] = useState('');
  const segAnchor = useRef<Pick | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  const analysis = useMemo(() => (part ? analyze(part.rows, part.settings) : null), [part?.rows, part?.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = analysis?.rounds.length ?? 0;
  const shown = upTo === null ? total : Math.min(upTo, total);

  useEffect(() => { if (part && !part.palette.some((c) => c.id === colorId)) setColorId(part.palette[0]?.id ?? ''); }, [part, colorId]);

  // The 3D rebuild runs in the gaps between keystrokes so typing never waits for it.
  const lazyPart = useDeferredValue(part);
  const lazyAnalysis = useDeferredValue(analysis);
  const shape = useMemo(() => {
    if (!lazyPart || !lazyAnalysis) return null;
    const rounds = lazyAnalysis.rounds.filter((r) => r.no <= shown && r.status !== 'syntax' && r.status !== 'empty').map((info) => ({ info, hexes: roundHexes(lazyPart, info) }));
    return prepareRender(rounds, { method: lazyPart.settings.method, start: lazyPart.settings.start, stuffed: prefs.stuffed }, prefs.texture);
  }, [lazyPart, lazyAnalysis, shown, prefs.stuffed, prefs.texture]);

  // Round-by-round playback.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setUpTo((u) => {
        const next = (u ?? 0) + 1;
        if (next >= total) { setPlaying(false); return null; }
        return next;
      });
    }, 380);
    return () => clearInterval(id);
  }, [playing, total]);

  const update = useCallback((fn: (p: Part) => Part, mergeKey?: string) => hist.set((p) => (p ? fn(p) : p), mergeKey), [hist]);
  const changeRow = useCallback((id: string, patch: Partial<PatternRow>, mergeKey?: string) => update((p) => ({ ...p, rows: p.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }), mergeKey), [update]);

  // Focus is applied right after React renders the new text, so the cursor lands
  // where it should and fast typing after Enter goes into the new row.
  const pendingFocus = useRef<{ id: string; caret?: number } | null>(null);
  const applyFocus = () => {
    const f = pendingFocus.current;
    const el = f && inputRefs.current.get(f.id);
    if (!f || !el) return;
    el.focus();
    const pos = Math.min(f.caret ?? el.value.length, el.value.length);
    el.setSelectionRange(pos, pos);
  };
  useLayoutEffect(() => { applyFocus(); pendingFocus.current = null; });
  const focusRow = (id: string, caret?: number) => {
    const f = { id, caret };
    pendingFocus.current = f;
    applyFocus();
    // If nothing re-renders, forget the request so it can't steal focus later.
    requestAnimationFrame(() => { if (pendingFocus.current === f) pendingFocus.current = null; });
  };

  const targetRow = (): PatternRow | undefined => part?.rows.find((r) => r.id === activeRowId) ?? part?.rows[part.rows.length - 1];

  /** Insert text at the cursor of the active row (or at its end). */
  const insertText = (make: (before: string, sel: string, after: string) => { text: string; caret: number }) => {
    const row = targetRow();
    if (!row) return;
    const el = inputRefs.current.get(row.id);
    const focusedHere = el && document.activeElement === el;
    const start = focusedHere ? el.selectionStart ?? row.text.length : row.text.length;
    const end = focusedHere ? el.selectionEnd ?? start : start;
    const r = make(row.text.slice(0, start), row.text.slice(start, end), row.text.slice(end));
    changeRow(row.id, { text: r.text });
    setActiveRowId(row.id);
    focusRow(row.id, r.caret);
  };

  const insertStitch = (code: string) => insertText((before, _sel, after) => {
    const tok = joinToken(before, code);
    return { text: before + tok + after, caret: before.length + tok.length };
  });

  const addRowAfter = (id: string | null) => {
    const row: PatternRow = { id: newId('row'), text: '', repeat: 1, note: '' };
    update((p) => {
      const i = id ? p.rows.findIndex((r) => r.id === id) : p.rows.length - 1;
      const rows = [...p.rows];
      rows.splice(i + 1, 0, row);
      return { ...p, rows };
    });
    setActiveRowId(row.id);
    focusRow(row.id);
  };

  const deleteRow = (id: string) => update((p) => {
    // Drop the row's colours too, so they don't come back if the row is written again.
    const strip = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith(`${id}#`)));
    const rows = p.rows.length <= 1 ? [{ ...p.rows[0], text: '', note: '', repeat: 1 }] : p.rows.filter((r) => r.id !== id);
    return { ...p, rows, stitchColors: strip(p.stitchColors), roundColors: strip(p.roundColors) };
  });
  const moveRow = (id: string, dir: -1 | 1) => update((p) => {
    const i = p.rows.findIndex((r) => r.id === id), j = i + dir;
    if (j < 0 || j >= p.rows.length) return p;
    const rows = [...p.rows];
    [rows[i], rows[j]] = [rows[j], rows[i]];
    return { ...p, rows };
  });
  const duplicateRow = (id: string) => update((p) => {
    const i = p.rows.findIndex((r) => r.id === id);
    const src = p.rows[i];
    const copy: PatternRow = { ...src, id: newId('row') };
    const rows = [...p.rows];
    rows.splice(i + 1, 0, copy);
    // Copy the row's colours to the new row.
    const remap = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([k]) => k.startsWith(`${src.id}#`)).map(([k, v]) => [copy.id + k.slice(src.id.length), v]));
    return { ...p, rows, stitchColors: { ...p.stitchColors, ...remap(p.stitchColors) }, roundColors: { ...p.roundColors, ...remap(p.roundColors) } };
  });

  /** Focusing a row lights up its first round in 3D and on the chart. */
  const focusRowLink = (id: string) => {
    setActiveRowId(id);
    const r = analysis?.rounds.find((x) => x.rowId === id && x.inRow === 0);
    const alreadyInRow = selected && analysis?.rounds.find((x) => x.no === selected.roundNo)?.rowId === id;
    if (r && r.stitches.length && !alreadyInRow) setSelected({ roundNo: r.no, index: 0 });
  };

  /* ---------- colour painting ---------- */

  const paintRange = (rounds: RoundInfo[], from: number, to: number) => update((p) => {
    const stitchColors = { ...p.stitchColors };
    for (const r of rounds) for (let i = from; i <= to && i < r.stitches.length; i++) stitchColors[stitchKey(r, i)] = colorId;
    return { ...p, stitchColors };
  });
  const paintRound = (rounds: RoundInfo[]) => update((p) => {
    const stitchColors = { ...p.stitchColors };
    const roundColors = { ...p.roundColors };
    for (const r of rounds) {
      roundColors[roundKey(r)] = colorId;
      for (const k of Object.keys(stitchColors)) if (k.startsWith(`${roundKey(r)}#`)) delete stitchColors[k];
    }
    return { ...p, stitchColors, roundColors };
  });

  const handlePick = (pick: Pick) => {
    if (!analysis) return;
    const r = analysis.rounds.find((x) => x.no === pick.roundNo);
    if (!r) return;
    setSelected(pick);
    setActiveRowId(r.rowId);
    inputRefs.current.get(r.rowId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (tool === 'stitch') paintRange([r], pick.index, pick.index);
    else if (tool === 'round') paintRound([r]);
    else if (tool === 'segment') {
      const a = segAnchor.current;
      if (a && a.roundNo === pick.roundNo) {
        paintRange([r], Math.min(a.index, pick.index), Math.max(a.index, pick.index));
        segAnchor.current = null;
        setToast('已上色');
      } else {
        segAnchor.current = pick;
        setToast(`起點：R${pick.roundNo} 第 ${pick.index + 1} 針，再點同一圈的終點`);
      }
    }
  };

  const stripPaint = (rowId: string, from: number, to: number) => {
    if (!analysis) return;
    const rounds = analysis.rounds.filter((r) => r.rowId === rowId);
    if (tool === 'round') paintRound(rounds);
    else paintRange(rounds, tool === 'stitch' ? to : from, to);
  };

  /* ---------- keyboard ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
      const mod = e.ctrlKey || e.metaKey;
      if (dialog || combo) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) hist.redo(); else hist.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); hist.redo(); return; }
      if (typing || mod || e.altKey || t.closest('button, a, [role=button], [role=tab]')) return;
      const st = STITCHES.find((s) => s.key && s.key === e.key.toLowerCase());
      if (st) { e.preventDefault(); insertStitch(st.code); return; }
      if (e.key === 'Enter' && part) { e.preventDefault(); focusRow(targetRow()?.id ?? part.rows[0].id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 2600); return () => clearTimeout(id); }, [toast]);

  if (!part || !analysis) {
    return <div className="page"><div className="lib"><p>找不到這個零件，可能已被刪除。</p><a className="btn" href="#/">回作品庫</a></div></div>;
  }

  const usage: Record<string, number> = {};
  for (const r of analysis.rounds) for (const id of roundColorIds(part, r)) usage[id] = (usage[id] ?? 0) + 1;

  const copyAll = async () => {
    const text = analysis.rows.map((ri) => `${ri.first === ri.last ? `R${ri.first}` : `R${ri.first}-R${ri.last}`}: ${ri.row.text} (${ri.produced})${ri.row.note ? `  # ${ri.row.note}` : ''}`).join('\n');
    try { await navigator.clipboard.writeText(text); setToast('已複製整份織圖文字'); } catch { setToast('這個瀏覽器不允許複製，請改用匯出'); }
  };

  const showChart = phone ? tab === 'chart' : center === 'chart';
  const selRound = selected ? analysis.rounds.find((r) => r.no === selected.roundNo) : undefined;
  const selStitch = selRound?.stitches[selected!.index];
  const accent = (THEMES.find((t) => t.id === prefs.theme) ?? THEMES[0]).accent;
  const anyTexture = prefs.texture;

  return (
    <div className="editor">
      <header className="topbar">
        <a className="brand hide-phone" href="#/">鉤織 3D 工作室</a>
        <a className="btn icon ghost show-phone" href="#/" aria-label="回作品庫">‹</a>
        <nav className="crumbs" aria-label="位置" style={{ alignItems: 'center' }}>
          <a href="#/" className="hide-phone">作品庫</a><span className="hide-phone">/</span>
          <input className="name-input" value={part.name} aria-label="零件名稱（點一下就能改）" title="點一下就能改名稱"
            onChange={(e) => update((p) => ({ ...p, name: e.target.value }), 'name')}
            onBlur={(e) => { if (!e.target.value.trim()) update((p) => ({ ...p, name: '未命名零件' })); }} />
          {part.sample && <span className="tag">範例</span>}
        </nav>
        <div className="spacer" />
        <span className={`status-pill${save.state === 'failed' ? ' failed' : ''}`} role="status" aria-live="polite"
          title={save.state === 'failed' ? '沒有存成功，請先用「複製文字」備份' : save.state === 'offline' ? '目前沒有網路，修改會先存在這台裝置，恢復連線後自動上傳' : '每次修改都會自動儲存'}>
          {save.state === 'saving' ? '儲存中…' : save.state === 'failed' ? '儲存失敗，請先複製文字備份' : save.state === 'offline' ? '離線中，連線後會同步' : save.at ? `✓ 已儲存 ${new Date(save.at).toTimeString().slice(0, 5)}` : '✓ 已儲存'}
        </span>
        <button className="btn icon" aria-label="復原" title="復原（Ctrl+Z）" disabled={!hist.canUndo} onClick={hist.undo}>↶</button>
        <button className="btn icon" aria-label="重做" title="重做（Ctrl+Y）" disabled={!hist.canRedo} onClick={hist.redo}>↷</button>
        <button className="btn hide-phone" onClick={() => setDialog('import')}>貼上織圖</button>
        <button className="btn hide-phone" onClick={copyAll}>複製文字</button>
        <button className="btn" onClick={() => setDialog('settings')}>零件設定</button>
        <ThemeMenu />
      </header>

      <div className="ed-tabs">
        <div className="seg" role="tablist" aria-label="切換畫面">
          <button aria-pressed={tab === 'pattern'} onClick={() => setTab('pattern')}>織圖</button>
          <button aria-pressed={tab === '3d'} onClick={() => setTab('3d')}>3D</button>
          <button aria-pressed={tab === 'chart'} onClick={() => setTab('chart')}>符號圖</button>
        </div>
      </div>

      <div className="ed-body" data-tab={tab}>
        <StitchPanel onStitch={insertStitch} onCombo={setCombo} palette={part.palette} color={colorId} onColor={setColorId} tool={tool} onTool={(t) => { setTool(t); segAnchor.current = null; }} onEditPalette={() => setDialog('palette')} />

        <main className="ed-mid">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="seg hide-phone" role="tablist" aria-label="中間顯示">
              <button aria-pressed={center === 'text'} onClick={() => setCenter('text')}>文字織圖</button>
              <button aria-pressed={center === 'chart'} onClick={() => setCenter('chart')}>符號圖</button>
            </div>
            {!showChart ? (
              <div className="seg" role="group" aria-label="文字顯示">
                <button aria-pressed={prefs.display === 'code'} onClick={() => actions.setPrefs({ display: 'code' })}>代碼</button>
                <button aria-pressed={prefs.display === 'chinese'} onClick={() => actions.setPrefs({ display: 'chinese' })}>中文</button>
              </div>
            ) : (
              <div className="seg" role="group" aria-label="符號圖顏色">
                <button aria-pressed={prefs.symbolColor === 'symbol'} onClick={() => actions.setPrefs({ symbolColor: 'symbol' })}>符號變色</button>
                <button aria-pressed={prefs.symbolColor === 'cell'} onClick={() => actions.setPrefs({ symbolColor: 'cell' })}>格子上色</button>
              </div>
            )}
            <div className="spacer" />
            {analysis.problems > 0 && <span className="tag" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>{analysis.problems} 圈針數不對</span>}
            <span className="muted hide-phone" style={{ fontSize: 13 }}>{METHOD_LABEL[part.settings.method]}・{START_LABEL[part.settings.start]}・{part.settings.yarn}・{part.settings.hook.toFixed(1)} mm</span>
          </div>
          {showChart ? (
            <SymbolChart part={part} analysis={analysis} mode={prefs.symbolColor} selected={selected} onPick={handlePick} />
          ) : (
            <RowList
              part={part} analysis={analysis} activeRowId={activeRowId} display={prefs.display} inputRefs={inputRefs}
              onFocusRow={focusRowLink} onChange={changeRow} onAddAfter={addRowAfter} onDelete={deleteRow} onDuplicate={duplicateRow} onMove={moveRow}
              onStripPaint={stripPaint} paintActive={tool !== 'select'}
            />
          )}
        </main>

        <section className="ed-right" aria-label="3D 預覽">
          <div className="p3-head">
            <span className="label" style={{ marginRight: 'auto' }}>3D 預覽</span>
            <button className="btn icon" aria-label="正面" title="正面" onClick={() => setView((v) => ({ name: 'front', n: v.n + 1 }))}>正</button>
            <button className="btn icon" aria-label="側面" title="側面" onClick={() => setView((v) => ({ name: 'side', n: v.n + 1 }))}>側</button>
            <button className="btn icon" aria-label="俯視" title="俯視" onClick={() => setView((v) => ({ name: 'top', n: v.n + 1 }))}>俯</button>
            <button className="btn" title="上下翻轉（帽子從帽尖開始鉤時用）" aria-pressed={!!part.settings.flip} onClick={() => update((p) => ({ ...p, settings: { ...p.settings, flip: !p.settings.flip } }))}>⇅ 翻轉</button>
            <button className="btn" aria-pressed={autoRotate} onClick={() => setAutoRotate((a) => !a)} style={autoRotate ? { borderColor: 'var(--accent)', color: 'var(--accent-ink)', background: 'var(--soft)' } : undefined}>⟳ 自動旋轉</button>
          </div>
          <div className={`p3-view${prefs.background === 'transparent' ? ' transparent' : ''}`} style={prefs.background === 'white' ? { background: '#FFFFFF' } : undefined}>
            <Suspense fallback={<p className="muted" style={{ padding: 16 }}>3D 載入中…</p>}>
              <Preview3D data={shape} flip={!!part.settings.flip} yarn={anyTexture} autoRotate={autoRotate} selected={selected} accent={accent} view={view} fitKey={partId} onPick={handlePick} />
            </Suspense>
            <div className="p3-badge">
              {selRound && selStitch ? `選取：R${selRound.no} 第 ${selected!.index + 1} 針（${STITCH_BY_CODE[selStitch.code]?.name ?? selStitch.code}${selStitch.mod ? `・${selStitch.mod === 'BLO' ? '後半針' : '前半針'}` : ''}）` : shape ? '點 3D 上的針，織圖會跳到那一圈' : '寫下第一圈就會出現 3D'}
            </div>
            <div className="p3-toggles">
              <label><input type="checkbox" checked={prefs.stuffed} onChange={(e) => actions.setPrefs({ stuffed: e.target.checked })} style={{ accentColor: 'var(--accent)' }} /> 塞棉花</label>
              <label title="手機上關掉比較順"><input type="checkbox" checked={prefs.texture} onChange={(e) => actions.setPrefs({ texture: e.target.checked })} style={{ accentColor: 'var(--accent)' }} /> 真實毛線</label>
            </div>
          </div>
          <div className="p3-foot">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn icon pri" aria-label={playing ? '暫停' : '逐圈播放'} onClick={() => { if (playing) setPlaying(false); else { setUpTo(1); setPlaying(true); } }}>{playing ? '❚❚' : '▶'}</button>
              <label htmlFor="upto" className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap', minWidth: 76 }}>顯示到 R{shown}</label>
              <input id="upto" type="range" min={1} max={Math.max(1, total)} value={Math.max(1, shown)} onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setUpTo(v >= total ? null : v); }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }} className="muted">
              背景
              <div className="seg">
                <button aria-pressed={prefs.background === 'white'} onClick={() => actions.setPrefs({ background: 'white' })}>白底</button>
                <button aria-pressed={prefs.background === 'transparent'} onClick={() => actions.setPrefs({ background: 'transparent' })}>透明</button>
              </div>
              <span className="spacer" />
              {shape && <span>{shape.placements.length} 針</span>}
            </div>
          </div>
        </section>
      </div>

      {toast && <div role="status" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', background: 'var(--ink)', color: 'var(--surface)', padding: '8px 16px', borderRadius: 10, fontSize: 14, zIndex: 60 }}>{toast}</div>}

      {(dialog === 'settings' || dialog === 'palette') && (
        <PartSettingsDialog part={part} focus={dialog} usage={usage} onClose={() => setDialog(null)} onSave={(p) => { update(() => p); setDialog(null); }} />
      )}
      {combo && (
        <ComboBuilder kind={combo} expected={analysis.rounds.find((x) => x.rowId === targetRow()?.id && x.inRow === 0)?.expected} rowLabel={(() => { const r = analysis.rows.find((x) => x.row.id === targetRow()?.id); return r ? (r.first === r.last ? `R${r.first}` : `R${r.first}–${r.last}`) : '這一圈'; })()}
          onClose={() => setCombo(null)}
          onInsert={(text) => { setCombo(null); insertText((before, _sel, after) => { const tok = joinToken(before, text); return { text: before + tok + after, caret: before.length + tok.length }; }); }} />
      )}
      {dialog === 'import' && (
        <ImportDialog onClose={() => setDialog(null)} onImport={(rows, replace) => { update((p) => ({ ...p, rows: replace ? rows : [...p.rows.filter((r) => r.text.trim() !== ''), ...rows] })); setDialog(null); }} />
      )}
    </div>
  );
}
