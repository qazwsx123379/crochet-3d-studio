import { useEffect, useRef, useState } from 'react';
import type { Analysis } from '../pattern/analyze';
import { stitchParents } from '../pattern/links';
import type { Part } from '../types';
import { roundHexes } from '../pattern/colors';
import { stadium } from '../three/geometry';
import { StitchSymbol } from './symbols';
import type { Pick } from '../three/Preview3D';

interface Props {
  part: Part;
  analysis: Analysis;
  mode: 'symbol' | 'cell';
  selected: Pick | null;
  onPick: (p: Pick) => void;
}

const CELL = 26;

/** Darken a yarn colour so very pale yarns still read as lines on white. */
function lineColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum > 170) { const k = 170 / lum; r *= k; g *= k; b *= k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export default function SymbolChart({ part, analysis, mode, selected, onPick }: Props) {
  const rounds = analysis.rounds.filter((r) => r.stitches.length && r.status !== 'syntax');
  if (!rounds.length) return <div className="chart"><p className="muted">寫下第一圈後，這裡會畫出符號圖。</p></div>;
  const ink = 'var(--ink)';

  if (part.settings.method === 'flat') {
    // Each stitch sits over the stitch it is worked into; stitches sharing a base
    // (an increase) fan out, so a row that grows spreads wider and leans outwards.
    const links = stitchParents(rounds, 'flat');
    const ROWH = CELL * 1.15;
    // 1) Along each row, where each stitch wants to be (u) relative to its base.
    const us: number[][] = [];
    rounds.forEach((r, ri) => {
      const parents = links.get(r.no) ?? [];
      const prev = us[ri - 1];
      const want: number[] = [];
      const base: (number | undefined)[] = [];
      r.stitches.forEach((_, k) => {
        const p0 = (parents[k] ?? []).filter((q) => prev && prev[q] !== undefined);
        if (p0.length && prev) { base[k] = p0.reduce((sum, q) => sum + prev[q], 0) / p0.length; want[k] = base[k]!; }
        else want[k] = k > 0 ? want[k - 1] + (ri % 2 ? -CELL : CELL) * 0.9 : 0;
      });
      // Stitches sharing one base (an increase) spread around it.
      for (let k = 0; k < want.length;) {
        let j = k;
        while (j + 1 < want.length && base[j + 1] !== undefined && base[j + 1] === base[k]) j++;
        const m = j - k + 1;
        const dir = ri % 2 ? -1 : 1;
        for (let q = k; q <= j; q++) want[q] += (q - k - (m - 1) / 2) * CELL * 0.9 * dir;
        k = j + 1;
      }
      // Keep about a cell apart, then re-centre on where they wanted to be.
      const order = want.map((x, k) => ({ x, k })).sort((p1, p2) => p1.x - p2.x);
      const xs = order.map((o) => o.x);
      for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + CELL * 0.92);
      const shift = want.reduce((t, x) => t + x, 0) / want.length - xs.reduce((t, x) => t + x, 0) / xs.length;
      const u: number[] = [];
      order.forEach((o, i) => { u[o.k] = xs[i] + shift; });
      us.push(u);
    });
    // 2) Bend the piece as one fan. Rows that get longer row after row make a
    //    sector: row r sits on an arc of radius R0 + r·h around one shared centre,
    //    so rows never cross. The fan angle comes from how fast rows grow (a line
    //    fitted through the row lengths); length a row can't fit on its arc
    //    becomes a gentle wave, the way real fabric ruffles.
    const lens = us.map((u) => Math.max(...u) - Math.min(...u) + CELL * 0.92);
    const n = lens.length;
    const meanR = (n - 1) / 2, meanL = lens.reduce((t, x) => t + x, 0) / n;
    let sxy = 0, sxx = 0;
    lens.forEach((L, r) => { sxy += (r - meanR) * (L - meanL); sxx += (r - meanR) ** 2; });
    const slope = sxx ? sxy / sxx : 0; // extra length per row
    const theta = Math.min(Math.PI * 1.9, Math.max(0, slope / ROWH));
    const bent = n > 1 && slope > CELL * 0.4 && theta > 0.05;
    const R0 = bent ? Math.max(ROWH, (meanL - slope * meanR) / theta) : 0;
    const rows: { x: number; y: number; ang: number }[][] = us.map((u, r) => {
      const lo = Math.min(...u), hi = Math.max(...u), mid = (lo + hi) / 2;
      if (!bent) return u.map((uk) => ({ x: uk - mid, y: -r * ROWH, ang: 0 }));
      const R = R0 + r * ROWH;
      const room = theta * R;
      const span = Math.min(lens[r], room);
      const squeeze = span / lens[r];
      const extra = lens[r] / room - 1;
      const wave = extra > 0 ? Math.min(ROWH * 0.45, (CELL * 3 / Math.PI) * Math.sqrt(extra) * 0.5) : 0;
      return u.map((uk) => {
        const sArc = (uk - mid) * squeeze;
        const rr = R + wave * Math.sin((sArc / (CELL * 3)) * Math.PI * 2);
        const phi = sArc / R;
        return { x: rr * Math.sin(phi), y: R0 - rr * Math.cos(phi), ang: phi };
      });
    });
    const allX = rows.flat().map((p) => p.x), allY = rows.flat().map((p) => p.y);
    const minX = Math.min(...allX) - CELL * 2.5, maxX = Math.max(...allX) + CELL * 2.5;
    const minY = Math.min(...allY) - CELL * 1.2, maxY = Math.max(...allY) + CELL * 1.2;
    const W = maxX - minX, H = maxY - minY;
    return (
      <ChartFrame naturalWidth={W} label="片織符號圖" viewBox={`${minX} ${minY} ${W} ${H}`} height={H}>
        {rounds.map((r, ri) => {
          const hexes = roundHexes(part, r);
          const row = rows[ri];
          const towardsLeft = ri % 2 === 1;
          const firstP = row[0];
          return (
            <g key={r.no}>
              <text x={firstP.x + (towardsLeft ? CELL * 0.9 : -CELL * 0.9)} y={firstP.y + 4} fontSize={11} textAnchor={towardsLeft ? 'start' : 'end'} fill="var(--muted)" fontFamily="var(--f-mono)">{towardsLeft ? `← ${r.no}` : `${r.no} →`}</text>
              {r.stitches.map((st, k) => {
                const p = row[k];
                const sel = selected?.roundNo === r.no && selected.index === k;
                return (
                  <g key={k} transform={`translate(${p.x},${p.y}) rotate(${(p.ang * 180) / Math.PI})`} onClick={() => onPick({ roundNo: r.no, index: k })} style={{ cursor: 'pointer' }}>
                    {mode === 'cell' && <rect x={-CELL * 0.46} y={-CELL / 2} width={CELL * 0.92} height={CELL} fill={hexes[k]} opacity={0.85} />}
                    <rect x={-CELL * 0.46} y={-CELL / 2} width={CELL * 0.92} height={CELL} fill="transparent" />
                    {sel && <circle r={CELL * 0.5} fill="none" stroke="var(--accent)" strokeWidth={3} />}
                    <g transform={`scale(${CELL * 0.82})`}><StitchSymbol code={st.code} mod={st.mod} color={mode === 'cell' ? ink : lineColor(hexes[k])} /></g>
                    <title>{`R${r.no} 第 ${k + 1} 針 ${st.code}`}</title>
                  </g>
                );
              })}
            </g>
          );
        })}
      </ChartFrame>
    );
  }

  // Rounds: concentric rings (stadiums for chain starts), stitches facing outwards.
  const oval = part.settings.start === 'chain' && rounds[0].foundation;
  const straight = oval ? Math.max(0, rounds[0].foundation! - 1) * CELL * 0.9 : 0;
  const ringR = (i: number) => CELL * 0.9 + i * CELL * 1.05;
  const outer = ringR(rounds.length) + straight / 2 + CELL;
  const size = outer * 2;
  // Rounds that begin part-way round the one below are turned by that much.
  const shifts: number[] = [];
  {
    let shift = 0;
    rounds.forEach((r, i) => {
      if (r.startAt && i > 0) shift += (r.startAt - 1) / Math.max(1, rounds[i - 1].produced);
      shifts.push(shift);
    });
  }
  return (
    <ChartFrame naturalWidth={size} label="繞圈符號圖" viewBox={`${-outer} ${-outer} ${size} ${size}`} height={size}>
        {rounds.map((r, ri) => {
          const R = oval && ri === 0 ? 0 : ringR(ri);
          const hexes = roundHexes(part, r);
          const n = r.stitches.length;
          return (
            <g key={r.no}>
              {R > 0 && (() => { const p = stadium(0.75, R + CELL * 0.52, straight); return <text x={p.x} y={-Math.abs(p.z) - 2} fontSize={10} textAnchor="middle" fill="var(--muted)" fontFamily="var(--f-mono)">{r.no}</text>; })()}
              {r.stitches.map((st, k) => {
                let x: number, y: number, ang: number;
                if (oval && ri === 0) { x = -straight / 2 + (k / Math.max(1, n - 1)) * straight; y = 0; ang = -90; }
                else {
                  const t = (k + 0.5) / n + shifts[ri];
                  const p = stadium(t, R, straight);
                  x = p.x; y = -p.z; ang = (Math.atan2(-p.nz, p.nx) * 180) / Math.PI;
                }
                const sel = selected?.roundNo === r.no && selected.index === k;
                const scale = Math.min(CELL * 0.82, ((2 * Math.PI * Math.max(R, CELL) + 2 * straight) / n) * 1.1);
                return (
                  <g key={k} transform={`translate(${x},${y}) rotate(${ang + 90})`} onClick={() => onPick({ roundNo: r.no, index: k })} style={{ cursor: 'pointer' }}>
                    {mode === 'cell' && <rect x={-scale / 2} y={-CELL / 2} width={scale} height={CELL} fill={hexes[k]} opacity={0.85} />}
                    {sel && <circle r={CELL * 0.48} fill="none" stroke="var(--accent)" strokeWidth={3} />}
                    <g transform={`scale(${scale})`}><StitchSymbol code={st.code} mod={st.mod} color={mode === 'cell' ? ink : lineColor(hexes[k])} /></g>
                    <title>{`R${r.no} 第 ${k + 1} 針 ${st.code}`}</title>
                  </g>
                );
              })}
            </g>
          );
        })}
        {!oval && <circle r={CELL * 0.35} fill="none" stroke="var(--dashed)" strokeDasharray="3 3" />}
    </ChartFrame>
  );
}

/** Scrollable chart with zoom: starts at a readable size; 符合寬度 shows it all. */
function ChartFrame({ naturalWidth, height, viewBox, label, children }: { naturalWidth: number; height: number; viewBox: string; label: string; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number | 'fit'>(1);
  const [fitScale, setFitScale] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setFitScale(Math.max(0.1, (el.clientWidth - 32) / naturalWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [naturalWidth]);
  const scale = zoom === 'fit' ? fitScale : zoom;
  const step = (k: number) => setZoom((z) => Math.max(0.25, Math.min(4, Math.round(((z === 'fit' ? fitScale : z) * k) * 100) / 100)));
  return (
    <div className="chart-wrap">
      <div className="chart-tools">
        <button className="btn icon sm" aria-label="縮小符號圖" onClick={() => step(1 / 1.25)}>－</button>
        <span className="muted" style={{ fontSize: 12, minWidth: 44, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button className="btn icon sm" aria-label="放大符號圖" onClick={() => step(1.25)}>＋</button>
        <button className="btn sm" aria-pressed={zoom === 'fit'} onClick={() => setZoom(zoom === 'fit' ? 1 : 'fit')}>{zoom === 'fit' ? '原始大小' : '符合寬度'}</button>
      </div>
      <div className="chart" ref={box}>
        <svg viewBox={viewBox} width={naturalWidth * scale} height={height * scale} role="img" aria-label={label} style={{ maxWidth: 'none', flex: 'none' }}>
          {children}
        </svg>
      </div>
    </div>
  );
}
