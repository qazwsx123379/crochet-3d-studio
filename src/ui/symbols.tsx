/**
 * Japanese-style (JIS) crochet chart symbols, drawn in a unit box centred on
 * the origin with "up" (towards the next round) as −y. Callers scale and
 * rotate them.
 */

interface Props { code: string; color: string; mod?: 'BLO' | 'FLO' }

const W = 0.075; // stroke width in unit box

function Post({ bars, color, top = true }: { bars: number; color: string; top?: boolean }) {
  return (
    <g stroke={color} strokeWidth={W} strokeLinecap="round" fill="none">
      <line x1={0} y1={0.45} x2={0} y2={-0.4} />
      {top && <line x1={-0.25} y1={-0.4} x2={0.25} y2={-0.4} />}
      {Array.from({ length: bars }, (_, i) => <line key={i} x1={-0.16} y1={-0.05 + i * 0.2 - (bars - 1) * 0.1} x2={0.16} y2={-0.17 + i * 0.2 - (bars - 1) * 0.1} />)}
    </g>
  );
}

function Cross({ color, cx = 0, cy = 0, s = 0.26 }: { color: string; cx?: number; cy?: number; s?: number }) {
  return (
    <g stroke={color} strokeWidth={W} strokeLinecap="round">
      <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} />
      <line x1={cx + s} y1={cy - s} x2={cx - s} y2={cy + s} />
    </g>
  );
}

export function StitchSymbol({ code, color, mod }: Props) {
  let body: JSX.Element;
  switch (code) {
    case 'ch': body = <ellipse rx={0.3} ry={0.17} stroke={color} strokeWidth={W} fill="none" />; break;
    case 'sl': body = <ellipse rx={0.13} ry={0.13} fill={color} />; break;
    case 'X': body = <Cross color={color} />; break;
    case 'T': body = <Post bars={0} color={color} />; break;
    case 'F': case 'FP': case 'BP': body = (
      <g>
        <Post bars={1} color={color} />
        {code !== 'F' && <path d={code === 'FP' ? 'M0 0.45 q0.2 -0.05 0.2 0.12' : 'M0 0.45 q-0.2 -0.05 -0.2 0.12'} stroke={color} strokeWidth={W} fill="none" />}
      </g>
    ); break;
    case 'E': body = <Post bars={2} color={color} />; break;
    case 'V': body = (
      <g stroke={color} strokeWidth={W} strokeLinecap="round" fill="none">
        <path d="M-0.3 -0.42 L0 0.42 L0.3 -0.42" />
        <line x1={-0.32} y1={-0.18} x2={-0.06} y2={-0.06} /><line x1={0.32} y1={-0.18} x2={0.06} y2={-0.06} />
      </g>
    ); break;
    case 'A': body = (
      <g stroke={color} strokeWidth={W} strokeLinecap="round" fill="none">
        <path d="M-0.3 0.42 L0 -0.42 L0.3 0.42" />
        <line x1={-0.32} y1={0.18} x2={-0.06} y2={0.06} /><line x1={0.32} y1={0.18} x2={0.06} y2={0.06} />
      </g>
    ); break;
    case 'FV': body = (
      <g stroke={color} strokeWidth={W} strokeLinecap="round" fill="none">
        <path d="M-0.3 -0.42 L0 0.45 L0.3 -0.42" />
        <line x1={-0.36} y1={-0.42} x2={-0.22} y2={-0.42} /><line x1={0.22} y1={-0.42} x2={0.36} y2={-0.42} />
        <line x1={-0.26} y1={-0.08} x2={-0.06} y2={-0.18} /><line x1={0.06} y1={-0.18} x2={0.26} y2={-0.08} />
      </g>
    ); break;
    case 'FA': body = (
      <g stroke={color} strokeWidth={W} strokeLinecap="round" fill="none">
        <path d="M-0.3 0.45 L0 -0.4 L0.3 0.45" />
        <line x1={-0.18} y1={-0.4} x2={0.18} y2={-0.4} />
        <line x1={-0.26} y1={0.12} x2={-0.06} y2={0.02} /><line x1={0.06} y1={0.02} x2={0.26} y2={0.12} />
      </g>
    ); break;
    case 'Q': body = (
      <g stroke={color} strokeWidth={W} strokeLinecap="round" fill="none">
        <path d="M-0.22 0.42 L0 -0.4 M0 0.42 L0 -0.4 M0.22 0.42 L0 -0.4" />
        <line x1={-0.22} y1={-0.4} x2={0.22} y2={-0.4} />
      </g>
    ); break;
    case 'P': body = (
      <g stroke={color} strokeWidth={W} fill="none">
        <ellipse cy={0} rx={0.26} ry={0.34} />
        <line x1={-0.12} y1={0.3} x2={0} y2={-0.3} /><line x1={0.12} y1={0.3} x2={0} y2={-0.3} />
      </g>
    ); break;
    case 'B': body = <ellipse rx={0.24} ry={0.36} fill={color} />; break;
    case 'S': body = (
      <g stroke={color} strokeWidth={W} strokeLinecap="round" fill="none">
        {[-0.44, -0.22, 0, 0.22, 0.44].map((x) => <line key={x} x1={0} y1={0.45} x2={x} y2={-0.38} />)}
      </g>
    ); break;
    case 'pc': body = (
      <g stroke={color} strokeWidth={W} fill="none"><circle cy={-0.12} r={0.16} /><line x1={0} y1={0.04} x2={0} y2={0.35} /></g>
    ); break;
    case 'CF': body = (
      <g stroke={color} strokeWidth={W} strokeLinecap="round" fill="none">
        <line x1={-0.3} y1={0.45} x2={0.3} y2={-0.4} /><line x1={0.3} y1={0.45} x2={-0.3} y2={-0.4} />
        <line x1={0.2} y1={-0.4} x2={0.4} y2={-0.4} /><line x1={-0.4} y1={-0.4} x2={-0.2} y2={-0.4} />
      </g>
    ); break;
    case 'L': body = (
      <g stroke={color} strokeWidth={W} fill="none"><Cross color={color} s={0.2} /><path d="M0 -0.2 c0.4 -0.4 -0.4 -0.4 0 0" /></g>
    ); break;
    case 'sk': body = <g />; break;
    default: body = <circle r={0.2} fill={color} />;
  }
  return (
    <g>
      {body}
      {mod && <path d={mod === 'BLO' ? 'M-0.3 0.5 q0.3 0.14 0.6 0' : 'M-0.3 0.56 q0.3 -0.14 0.6 0'} stroke={color} strokeWidth={W * 0.8} fill="none" />}
    </g>
  );
}
