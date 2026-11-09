import type { Analysis } from '../pattern/analyze';
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
    const maxN = Math.max(...rounds.map((r) => r.stitches.length));
    const W = maxN * CELL + 80, H = rounds.length * CELL + 40;
    return (
      <div className="chart">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} role="img" aria-label="片織符號圖">
          {rounds.map((r, ri) => {
            const y = H - 20 - (ri + 1) * CELL;
            const hexes = roundHexes(part, r);
            const n = r.stitches.length;
            const x0 = 60 + ((maxN - n) * CELL) / 2;
            const reverse = ri % 2 === 1;
            return (
              <g key={r.no}>
                <text x={reverse ? x0 + n * CELL + 8 : 8} y={y + CELL * 0.65} fontSize={11} fill="var(--muted)" fontFamily="var(--f-mono)">{reverse ? `${r.no} ←` : `→ ${r.no}`}</text>
                {r.stitches.map((s, k) => {
                  const idx = reverse ? n - 1 - k : k;
                  const st = r.stitches[idx];
                  const sel = selected?.roundNo === r.no && selected.index === idx;
                  return (
                    <g key={k} transform={`translate(${x0 + k * CELL},${y})`} onClick={() => onPick({ roundNo: r.no, index: idx })} style={{ cursor: 'pointer' }}>
                      <rect width={CELL} height={CELL} fill={mode === 'cell' ? hexes[idx] : 'transparent'} stroke="var(--divider)" />
                      {sel && <rect width={CELL} height={CELL} fill="none" stroke="var(--accent)" strokeWidth={3} />}
                      <g transform={`translate(${CELL / 2},${CELL / 2}) scale(${CELL * 0.82})`}><StitchSymbol code={st.code} mod={st.mod} color={mode === 'cell' ? ink : lineColor(hexes[idx])} /></g>
                      <title>{`R${r.no} 第 ${idx + 1} 針 ${s.code}`}</title>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  // Rounds: concentric rings (stadiums for chain starts), stitches facing outwards.
  const oval = part.settings.start === 'chain' && rounds[0].foundation;
  const straight = oval ? Math.max(0, rounds[0].foundation! - 1) * CELL * 0.9 : 0;
  const ringR = (i: number) => CELL * 0.9 + i * CELL * 1.05;
  const outer = ringR(rounds.length) + straight / 2 + CELL;
  const size = outer * 2;
  return (
    <div className="chart">
      <svg viewBox={`${-outer} ${-outer} ${size} ${size}`} width={Math.min(size, 900)} role="img" aria-label="繞圈符號圖">
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
                  const t = (k + 0.5) / n;
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
      </svg>
    </div>
  );
}
