import { useMemo } from 'react';
import type { Part } from '../types';
import { analyze } from '../pattern/analyze';
import { roundHexes } from '../pattern/colors';
import { buildProfile } from '../three/geometry';

/** Most common colour of a round. */
function main(hexes: string[]): string {
  const n = new Map<string, number>();
  for (const h of hexes) n.set(h, (n.get(h) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#ccc';
}

/** A flat side-view silhouette of a part, cheap enough for every library card. */
export default function Thumb({ part, size = 140 }: { part: Part; size?: number }) {
  const bands = useMemo(() => {
    const a = analyze(part.rows, part.settings);
    const rounds = a.rounds.filter((r) => r.stitches.length && r.status !== 'syntax').map((info) => ({ info, hexes: roundHexes(part, info) }));
    if (!rounds.length) return null;
    if (part.settings.method === 'flat') {
      return { flat: true as const, rows: rounds.map((r) => ({ w: r.info.foundation ?? r.info.produced, color: main(r.hexes) })) };
    }
    const { profile, straight } = buildProfile(rounds, { method: part.settings.method, start: part.settings.start, stuffed: true });
    return { flat: false as const, profile, straight, colors: rounds.map((r) => main(r.hexes)) };
  }, [part]);

  if (!bands) return <svg width={size} height={size} aria-hidden="true" />;
  if (bands.flat) {
    const maxW = Math.max(...bands.rows.map((r) => r.w), 1);
    const h = bands.rows.length;
    const scale = (size * 0.8) / Math.max(maxW, h * 0.9);
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {bands.rows.map((r, i) => (
          <rect key={i} x={(size - r.w * scale) / 2} y={size / 2 + (h * scale * 0.9) / 2 - (i + 1) * scale * 0.9} width={r.w * scale} height={scale * 0.9 + 0.5} fill={r.color} />
        ))}
      </svg>
    );
  }
  const { profile, straight, colors } = bands;
  const half = straight / 2;
  const maxR = Math.max(...profile.map((p) => p.r)) + half;
  const maxY = Math.max(...profile.map((p) => p.y), 0.01);
  const scale = (size * 0.8) / Math.max(maxR * 2, maxY);
  const ox = size / 2, oy = size / 2 + (maxY * scale) / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {profile.slice(1).map((p, i) => {
        const a = profile[i];
        const ra = (a.r + half) * scale, rb = (p.r + half) * scale;
        const pts = `${ox - ra},${oy - a.y * scale} ${ox + ra},${oy - a.y * scale} ${ox + rb},${oy - p.y * scale} ${ox - rb},${oy - p.y * scale}`;
        return <polygon key={i} points={pts} fill={colors[p.round] ?? '#ccc'} stroke={colors[p.round] ?? '#ccc'} strokeWidth={0.6} />;
      })}
    </svg>
  );
}
