/**
 * 匯出: the full printable pattern as a PDF, the text pattern as a PNG, the 3D
 * view as a PNG, and a JSON backup. Everything is drawn in the browser: the
 * printable sheet below is real HTML (so Chinese text uses the device's own
 * fonts), turned into images page by page and placed into the PDF.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Part, Work } from '../types';
import { useStore } from '../store/store';
import { analyze } from '../pattern/analyze';
import { roundColorIds } from '../pattern/colors';
import { METHOD_NAME, START_NAME, patternRows } from '../pattern/text';
import SymbolChart, { ChartPrintContext } from './SymbolChart';
import { thumbnail } from '../three/thumbnail';
import { ACCESSORIES } from './Assembly';
import { saveFile } from '../saveFile';

interface Props { kind: 'part' | 'work'; part?: Part; work?: Work; onClose: () => void }

const PAGE_W = 794; // A4 at 96 dpi
const PAGE_H = 1123;

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || '鉤織作品';

/** The 3D view currently on screen, if any (the editor's preview or the assembly scene). */
function screenShot(white: boolean): string {
  const c = document.querySelector<HTMLCanvasElement>('.asm-stage canvas, .ed-right canvas');
  if (!c || !c.width) return '';
  try {
    if (!white) return c.toDataURL('image/png');
    const out = document.createElement('canvas');
    out.width = c.width;
    out.height = c.height;
    const g = out.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(c, 0, 0);
    return out.toDataURL('image/png');
  } catch {
    return '';
  }
}

function PartSection({ part, copies, thumb, opts }: { part: Part; copies: number; thumb?: string; opts: { text: boolean; chart: boolean } }) {
  const analysis = useMemo(() => analyze(part.rows, part.settings), [part]);
  const rows = useMemo(() => patternRows(part, analysis), [part, analysis]);
  const used = new Set<string>();
  for (const r of analysis.rounds) for (const id of roundColorIds(part, r)) used.add(id);
  const colours = part.palette.filter((c) => used.has(c.id));
  return (
    <section className="ps-part">
      <div className="ps-block ps-part-head">
        {thumb && <img src={thumb} alt="" />}
        <div>
          <h2>{part.name}{copies > 1 ? <small>　× {copies} 個</small> : null}</h2>
          <p>{METHOD_NAME[part.settings.method]}・{START_NAME[part.settings.start]}・{part.settings.yarn}・鉤針 {part.settings.hook} mm・共 {analysis.rounds.length} {part.settings.method === 'flat' ? '排' : '圈'}</p>
          <p className="ps-colours">{colours.map((c) => <span key={c.id}><i style={{ background: c.hex }} />{c.name}{c.code ? ` #${c.code}` : ''}</span>)}</p>
        </div>
      </div>
      {opts.text && (
        <div className="ps-rows">
          {rows.map((r, i) => (
            <div key={i} className="ps-block ps-row">
              <b>{r.label}</b>
              <div>
                <code>{r.text}</code>
                {r.start && <em>{r.start}</em>}
                {r.colours.map((c, k) => <em key={k} className="ps-colour">顏色：{c}</em>)}
                {r.note && <em>備註：{r.note}</em>}
              </div>
              <span>({r.count})</span>
            </div>
          ))}
        </div>
      )}
      {opts.chart && analysis.rounds.some((r) => r.stitches.length) && (
        <div className="ps-block ps-chart">
          <h3>符號圖</h3>
          <ChartPrintContext.Provider value={true}>
            <SymbolChart part={part} analysis={analysis} mode="symbol" selected={null} onPick={() => {}} />
          </ChartPrintContext.Provider>
        </div>
      )}
    </section>
  );
}

export default function ExportDialog({ kind, part, work, onClose }: Props) {
  const allParts = useStore((s) => s.parts);
  const title = kind === 'work' ? work!.name : part!.name;
  const list: { part: Part; copies: number }[] = useMemo(() => {
    if (kind === 'part') return [{ part: part!, copies: 1 }];
    const counts = new Map<string, number>();
    for (const it of work!.items ?? work!.partIds.map((id) => ({ partId: id }))) counts.set(it.partId, (counts.get(it.partId) ?? 0) + 1);
    return [...counts.entries()].map(([id, n]) => ({ part: allParts[id], copies: n })).filter((x) => x.part);
  }, [kind, part, work, allParts]);

  const [opts, setOpts] = useState({ cover: true, text: true, chart: true });
  const [white, setWhite] = useState(true);
  const [shot] = useState(() => screenShot(true));
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const sheet = useRef<HTMLDivElement>(null);
  const textSheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    Promise.all(list.map(async ({ part: p }) => [p.id, await thumbnail(p)] as const)).then((pairs) => { if (live) setThumbs(Object.fromEntries(pairs)); });
    return () => { live = false; };
  }, [list]);

  const accessories = kind === 'work' ? work!.accessories ?? [] : [];
  const yarns = [...new Set(list.map((x) => x.part.settings.yarn))];
  const hooks = [...new Set(list.map((x) => x.part.settings.hook))];

  /** Render an element to a canvas at print resolution. */
  const toCanvas = async (el: HTMLElement) => {
    const { toCanvas: draw } = await import('html-to-image');
    return draw(el, { pixelRatio: 2, backgroundColor: '#ffffff', skipFonts: true, width: PAGE_W, cacheBust: false });
  };

  const exportPdf = async () => {
    if (!sheet.current) return;
    setBusy('正在排版 PDF…');
    try {
      const el = sheet.current;
      const canvas = await toCanvas(el);
      const ratio = canvas.width / el.offsetWidth;
      // Break pages between blocks, never through a row or a chart.
      // The preview is shown zoomed out; measure in the sheet's own pixels.
      const box = el.getBoundingClientRect();
      const z = box.height / el.offsetHeight || 1;
      const blocks = [...el.querySelectorAll<HTMLElement>('.ps-block')].map((b) => { const r = b.getBoundingClientRect(); return [(r.top - box.top) / z, (r.bottom - box.top) / z] as const; });
      const breaks: number[] = [0];
      let start = 0;
      for (const [t, b] of blocks) {
        if (b - start > PAGE_H - 40 && t > start) { start = t - 12; breaks.push(start); }
      }
      breaks.push(el.offsetHeight);
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H], hotfixes: ['px_scaling'] });
      for (let i = 0; i < breaks.length - 1; i++) {
        const y0 = breaks[i], h = Math.min(breaks[i + 1] - y0, PAGE_H * 3);
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = Math.round(h * ratio);
        const g = slice.getContext('2d')!;
        g.fillStyle = '#fff';
        g.fillRect(0, 0, slice.width, slice.height);
        g.drawImage(canvas, 0, -Math.round(y0 * ratio));
        if (i > 0) pdf.addPage([PAGE_W, PAGE_H]);
        // A block taller than a page (a big chart) is scaled down to fit.
        const k = Math.min(1, (PAGE_H - 40) / h);
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', (PAGE_W - PAGE_W * k) / 2, 20, PAGE_W * k, h * k);
        pdf.setFontSize(9);
        pdf.setTextColor(150);
        pdf.text(`${i + 1} / ${breaks.length - 1}`, PAGE_W - 40, PAGE_H - 14);
      }
      await saveFile(`${safe(title)}_圖解.pdf`, pdf.output('blob'));
      setBusy('');
    } catch (e) {
      console.error(e);
      setBusy('匯出失敗，請再試一次');
    }
  };

  const exportTextPng = async () => {
    if (!textSheet.current) return;
    setBusy('正在產生圖片…');
    try {
      const c = await toCanvas(textSheet.current);
      await saveFile(`${safe(title)}_文字織圖.png`, c.toDataURL('image/png'));
      setBusy('');
    } catch (e) { console.error(e); setBusy('匯出失敗，請再試一次'); }
  };

  const export3d = async () => {
    const url = screenShot(white) || (list[0] ? await thumbnail(list[0].part) : '');
    if (!url) { setBusy('找不到 3D 畫面'); return; }
    await saveFile(`${safe(title)}_3D.png`, url);
  };

  const exportJson = () => {
    const data = {
      app: 'crochet-3d-studio', version: 1, exportedAt: new Date().toISOString(),
      parts: list.map((x) => x.part),
      works: kind === 'work' ? [work] : [],
    };
    void saveFile(`${safe(title)}.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  };

  const today = new Date().toLocaleDateString('zh-TW');
  const cover = shot || thumbs[list[0]?.part.id ?? ''];

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="匯出" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog export-dialog">
        <div className="dialog-head"><h2>匯出「{title}」</h2><button className="btn icon ghost" aria-label="關閉" onClick={onClose}>✕</button></div>
        <div className="export-body">
          <div className="export-side">
            <div className="export-card">
              <h3>完整圖解 PDF</h3>
              <p className="muted">可以印出來或傳給朋友。勾選要放的內容：</p>
              <label><input type="checkbox" checked={opts.cover} onChange={(e) => setOpts({ ...opts, cover: e.target.checked })} />封面、3D 圖和材料</label>
              <label><input type="checkbox" checked={opts.text} onChange={(e) => setOpts({ ...opts, text: e.target.checked })} />逐圈文字（含換色、備註）</label>
              <label><input type="checkbox" checked={opts.chart} onChange={(e) => setOpts({ ...opts, chart: e.target.checked })} />符號圖</label>
              <button className="btn pri" disabled={!!busy && busy.endsWith('…')} onClick={exportPdf}>下載 PDF</button>
            </div>
            <div className="export-card">
              <h3>文字織圖 PNG</h3>
              <p className="muted">一張圖片，方便存在手機相簿或貼到社群。</p>
              <button className="btn" onClick={exportTextPng}>下載 PNG</button>
            </div>
            <div className="export-card">
              <h3>3D 圖 PNG</h3>
              <p className="muted">用現在 3D 畫面的角度。先轉到喜歡的角度再按匯出。</p>
              <div className="seg" role="group" aria-label="背景">
                <button aria-pressed={white} onClick={() => setWhite(true)}>白底</button>
                <button aria-pressed={!white} onClick={() => setWhite(false)}>透明</button>
              </div>
              <button className="btn" onClick={export3d}>下載 3D 圖</button>
            </div>
            <div className="export-card">
              <h3>JSON 備份</h3>
              <p className="muted">完整資料，之後可以在作品庫「匯入」還原，或分享給也在用這個工具的人。</p>
              <button className="btn" onClick={exportJson}>下載 JSON</button>
            </div>
            {busy && <p role="status" className="muted">{busy}</p>}
          </div>
          <div className="export-preview" aria-label="PDF 預覽">
            <div className="ps-scale">
              <div className="ps" ref={sheet}>
                {opts.cover && (
                  <div className="ps-block ps-cover">
                    <p className="ps-brand">鉤織 3D 工作室・{today}</p>
                    <h1>{title}</h1>
                    {cover && <img className="ps-hero" src={cover} alt="" />}
                    <div className="ps-materials">
                      <div><b>線材</b>{yarns.join('、')}</div>
                      <div><b>鉤針</b>{hooks.map((h) => `${h} mm`).join('、')}</div>
                      {kind === 'work' && <div><b>零件</b>{list.map((x) => `${x.part.name}${x.copies > 1 ? ` ×${x.copies}` : ''}`).join('、')}</div>}
                      {accessories.length > 0 && <div><b>配件</b>{[...new Set(accessories.map((a) => ACCESSORIES.find((d) => d.kind === a.kind)?.name ?? a.kind))].map((n) => `${n} ×${accessories.filter((a) => (ACCESSORIES.find((d) => d.kind === a.kind)?.name ?? a.kind) === n).length}`).join('、')}</div>}
                    </div>
                  </div>
                )}
                {list.map(({ part: p, copies }) => <PartSection key={p.id} part={p} copies={copies} thumb={thumbs[p.id]} opts={opts} />)}
              </div>
            </div>
            {/* The text-only picture, drawn off screen. */}
            <div className="ps-offscreen" aria-hidden="true">
              <div className="ps" ref={textSheet}>
                <div className="ps-block"><h1 style={{ fontSize: 26 }}>{title}</h1></div>
                {list.map(({ part: p, copies }) => <PartSection key={p.id} part={p} copies={copies} opts={{ text: true, chart: false }} />)}
                <p className="ps-brand" style={{ marginTop: 16 }}>鉤織 3D 工作室</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
