/**
 * Builds the 3D shape of a part from its stitch counts. No rendering here, so
 * the maths can be unit-tested.
 *
 * Rounds (spiral or joined): every round's top edge is a ring whose length is
 * its stitch count × stitch width. Consecutive rings are one stitch-height
 * apart. When the ring grows by about a stitch height per round the fabric
 * lies flat (a disc); when the count stays the same it goes straight up; when
 * it shrinks it curves back in. That is exactly how amigurumi take shape, so
 * the silhouette comes from the pattern itself rather than from a template.
 *
 * Chain starts (ovals): the ring is a stadium, two straight sides as long as
 * the foundation chain joined by half circles.
 *
 * Flat pieces: rows stacked into a sheet, one stitch width per stitch.
 */
import { STITCH_BY_CODE, type StitchShape } from '../pattern/stitches';
import type { Method, RoundInfo, StartKind } from '../pattern/analyze';

export interface ShapeRound {
  info: RoundInfo;
  hexes: string[];
}

export interface ShapeOptions {
  method: Method;
  start: StartKind;
  stuffed: boolean;
}

export interface ProfilePoint {
  r: number;
  y: number;
  /** Index into the rounds array; -1 for the centre / foundation. */
  round: number;
  corner: boolean;
}

export interface Placement {
  pos: [number, number, number];
  /** Unit vectors: along the round, up the fabric, out of the fabric. */
  tangent: [number, number, number];
  up: [number, number, number];
  normal: [number, number, number];
  width: number;
  height: number;
  hex: string;
  shape: StitchShape;
  roundNo: number;
  index: number;
}

export interface BuiltShape {
  kind: 'lathe' | 'flat';
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  /** Per triangle: 1-based round number and stitch index, for picking. */
  faceRound: Int32Array;
  faceStitch: Int32Array;
  placements: Placement[];
  center: [number, number, number];
  radius: number;
  /** Ring outline of each round, for highlighting a round. Keyed by round number. */
  rings: Map<number, [number, number, number][]>;
  profile: ProfilePoint[];
}

export const STITCH_W = 1;
const TAU = Math.PI * 2;

function roundHeight(info: RoundInfo): number {
  const hs = info.stitches.map((s) => STITCH_BY_CODE[s.code]).filter((d) => d && d.produces > 0 && d.shape !== 'chain').map((d) => d.height);
  if (!hs.length) return info.foundation ? 0.5 : 1;
  return Math.max(0.4, hs.reduce((a, b) => a + b, 0) / hs.length);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  // Convert sRGB to linear so three.js shows the colour as picked.
  const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}

/** Point and outward normal on a stadium of cap radius r and straight length s, at fraction t of its perimeter. */
export function stadium(t: number, r: number, s: number): { x: number; z: number; nx: number; nz: number } {
  const total = 2 * s + TAU * r;
  if (total <= 0) return { x: 0, z: 0, nx: 1, nz: 0 };
  let d = (((t % 1) + 1) % 1) * total;
  const half = Math.PI * r;
  // right cap, from bottom (-z) to top (+z)
  if (d < half) { const a = -Math.PI / 2 + (r > 0 ? d / r : 0); return { x: s / 2 + r * Math.cos(a), z: r * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a) }; }
  d -= half;
  if (d < s) return { x: s / 2 - d, z: r, nx: 0, nz: 1 };
  d -= s;
  if (d < half) { const a = Math.PI / 2 + (r > 0 ? d / r : 0); return { x: -s / 2 + r * Math.cos(a), z: r * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a) }; }
  d -= half;
  return { x: -s / 2 + d, z: -r, nx: 0, nz: -1 };
}

/** The silhouette (radius, height) of a rounds-based part. Exported for tests. */
export function buildProfile(rounds: ShapeRound[], opts: ShapeOptions): { profile: ProfilePoint[]; straight: number } {
  const profile: ProfilePoint[] = [{ r: 0, y: 0, round: -1, corner: false }];
  let straight = 0;
  let start = 0;
  if (opts.start === 'chain' && rounds[0]?.info.foundation) {
    straight = Math.max(0, (rounds[0].info.foundation - 1) * STITCH_W);
    start = 1;
  }
  for (let i = start; i < rounds.length; i++) {
    const info = rounds[i].info;
    const perimeter = Math.max(0, info.produced) * STITCH_W;
    const r = Math.max(0.12, (perimeter - 2 * straight) / TAU);
    const h = roundHeight(info);
    const prev = profile[profile.length - 1];
    const dr = r - prev.r;
    const dy = Math.sqrt(Math.max(0, h * h - dr * dr));
    profile.push({ r, y: prev.y + dy, round: i, corner: false });
    // A back/front-loop-only round folds the fabric: keep that edge sharp when smoothing.
    if (info.loopOnly) prev.corner = true;
  }
  // A round that ends with very few stitches is pulled shut by the yarn.
  const last = profile[profile.length - 1];
  const maxR = Math.max(...profile.map((p) => p.r));
  if (profile.length > 3 && last.r < maxR * 0.35 && last.round >= 0) {
    profile.push({ r: 0, y: last.y + Math.max(0.15, last.r * 0.35), round: last.round, corner: false });
  }
  if (opts.stuffed && isClosed(profile)) stuff(profile);
  return { profile, straight };
}

function isClosed(p: ProfilePoint[]): boolean {
  const maxR = Math.max(...p.map((x) => x.r));
  return p.length > 4 && p[p.length - 1].r < maxR * 0.5;
}

/** Stuffing stretches the fabric a little and rounds off its corners. */
function stuff(p: ProfilePoint[]) {
  const n = p.length;
  for (let i = 1; i < n - 1; i++) {
    const t = i / (n - 1);
    p[i].r *= 1 + 0.14 * Math.sin(Math.PI * t);
  }
  for (let it = 0; it < 4; it++) {
    const r = p.map((x) => x.r), y = p.map((x) => x.y);
    for (let i = 1; i < n - 1; i++) {
      if (p[i].corner) continue;
      p[i].r = r[i] * 0.5 + (r[i - 1] + r[i + 1]) * 0.25;
      p[i].y = y[i] * 0.5 + (y[i - 1] + y[i + 1]) * 0.25;
    }
  }
}

function sub(a: number[], b: number[]) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function norm(v: number[]): [number, number, number] { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a: number[], b: number[]): [number, number, number] { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

class MeshWriter {
  pos: number[] = []; nor: number[] = []; col: number[] = []; fr: number[] = []; fs: number[] = [];
  quad(v: number[][], n: number[][], rgb: number[], round: number, stitch: number) {
    // v: [a, b, c, d] around the quad
    for (const k of [0, 1, 2, 0, 2, 3]) { this.pos.push(...v[k]); this.nor.push(...n[k]); this.col.push(...rgb); }
    this.fr.push(round, round); this.fs.push(stitch, stitch);
  }
}

function finish(w: MeshWriter, kind: BuiltShape['kind'], placements: Placement[], rings: BuiltShape['rings'], profile: ProfilePoint[]): BuiltShape {
  const positions = new Float32Array(w.pos);
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }
  if (!positions.length) { min = [0, 0, 0]; max = [0, 0, 0]; }
  const center: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.max(1, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
  return {
    kind, positions, normals: new Float32Array(w.nor), colors: new Float32Array(w.col),
    faceRound: new Int32Array(w.fr), faceStitch: new Int32Array(w.fs), placements, center, radius, rings, profile,
  };
}

function buildLathe(rounds: ShapeRound[], opts: ShapeOptions): BuiltShape {
  const { profile, straight } = buildProfile(rounds, opts);
  const maxN = Math.max(12, ...rounds.map((r) => r.info.stitches.length));
  const M = Math.min(240, Math.max(72, maxN * 2));
  // Profile normals (in the r–y plane), averaged from neighbouring segments.
  const pn = profile.map((_, i) => {
    const a = profile[Math.max(0, i - 1)], b = profile[Math.min(profile.length - 1, i + 1)];
    const dr = b.r - a.r, dy = b.y - a.y;
    const l = Math.hypot(dr, dy) || 1;
    return [dy / l, -dr / l];
  });
  const ringPoint = (i: number, t: number) => {
    const p = profile[i];
    const s = stadium(t, p.r, straight);
    return {
      v: [s.x, p.y, s.z],
      n: [s.nx * pn[i][0], pn[i][1], s.nz * pn[i][0]],
    };
  };
  const w = new MeshWriter();
  const rings: BuiltShape['rings'] = new Map();
  const placements: Placement[] = [];
  for (let i = 1; i < profile.length; i++) {
    const ri = profile[i].round;
    const round = rounds[ri];
    const count = round.info.stitches.length || 1;
    for (let j = 0; j < M; j++) {
      const t0 = j / M, t1 = (j + 1) / M;
      const k = Math.min(count - 1, Math.floor(((j + 0.5) / M) * count));
      const rgb = hexToRgb(round.hexes[k] ?? '#cccccc');
      const a = ringPoint(i - 1, t0), b = ringPoint(i - 1, t1), c = ringPoint(i, t1), d = ringPoint(i, t0);
      w.quad([a.v, b.v, c.v, d.v], [a.n, b.n, c.n, d.n], rgb, round.info.no, k);
    }
    if (!rings.has(round.info.no)) rings.set(round.info.no, Array.from({ length: 97 }, (_, j) => ringPoint(i, j / 96).v as [number, number, number]));
    // One placement per stitch, in the middle of this round's band.
    if (profile[i - 1].round !== ri) {
      const spiral = opts.method === 'spiral' ? 0.5 / count : 0;
      round.info.stitches.forEach((st, k) => {
        const def = STITCH_BY_CODE[st.code];
        if (!def || def.shape === 'skip') return;
        const t = (k + 0.5) / count + spiral * (ri % 2);
        const lo = ringPoint(i - 1, t), hi = ringPoint(i, t);
        const mid = [lo.v[0] * 0.45 + hi.v[0] * 0.55, lo.v[1] * 0.45 + hi.v[1] * 0.55, lo.v[2] * 0.45 + hi.v[2] * 0.55];
        const ahead = ringPoint(i, t + 0.5 / count).v, behind = ringPoint(i, t - 0.5 / count).v;
        const tangent = norm(sub(ahead, behind));
        let up = norm(sub(hi.v, lo.v));
        let normal = norm(cross(tangent, up));
        const outward = norm([hi.n[0] + lo.n[0], hi.n[1] + lo.n[1], hi.n[2] + lo.n[2]]);
        if (normal[0] * outward[0] + normal[1] * outward[1] + normal[2] * outward[2] < 0) normal = [-normal[0], -normal[1], -normal[2]];
        up = norm(cross(normal, tangent));
        const perim = 2 * straight + TAU * ((profile[i - 1].r + profile[i].r) / 2);
        placements.push({
          pos: mid as [number, number, number], tangent, up, normal,
          width: Math.max(0.35, perim / count), height: Math.hypot(...sub(hi.v, lo.v)) || 0.5,
          hex: round.hexes[k] ?? '#cccccc', shape: def.shape, roundNo: round.info.no, index: k,
        });
      });
    }
  }
  return finish(w, 'lathe', placements, rings, profile);
}

function buildFlat(rounds: ShapeRound[]): BuiltShape {
  const w = new MeshWriter();
  const rings: BuiltShape['rings'] = new Map();
  const placements: Placement[] = [];
  let y = 0;
  const T = 0.18; // half thickness
  rounds.forEach((round, ri) => {
    const info = round.info;
    const h = roundHeight(info);
    const count = info.stitches.length || 1;
    const width = Math.max(1, (info.foundation ?? info.stitches.filter((s) => STITCH_BY_CODE[s.code]?.produces > 0).length) * STITCH_W);
    const x0 = -width / 2;
    const reverse = ri % 2 === 1; // every row is worked back the other way
    for (let k = 0; k < count; k++) {
      const idx = reverse ? count - 1 - k : k;
      const xa = x0 + (k / count) * width, xb = x0 + ((k + 1) / count) * width;
      const rgb = hexToRgb(round.hexes[idx] ?? '#cccccc');
      w.quad([[xa, y, T], [xb, y, T], [xb, y + h, T], [xa, y + h, T]], [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]], rgb, info.no, idx);
      w.quad([[xb, y, -T], [xa, y, -T], [xa, y + h, -T], [xb, y + h, -T]], [[0, 0, -1], [0, 0, -1], [0, 0, -1], [0, 0, -1]], rgb, info.no, idx);
      const def = STITCH_BY_CODE[info.stitches[idx].code];
      if (def && def.shape !== 'skip') {
        placements.push({ pos: [(xa + xb) / 2, y + h * 0.5, T], tangent: [1, 0, 0], up: [0, 1, 0], normal: [0, 0, 1], width: xb - xa, height: h, hex: round.hexes[idx] ?? '#cccccc', shape: def.shape, roundNo: info.no, index: idx });
        placements.push({ pos: [(xa + xb) / 2, y + h * 0.5, -T], tangent: [-1, 0, 0], up: [0, 1, 0], normal: [0, 0, -1], width: xb - xa, height: h, hex: round.hexes[idx] ?? '#cccccc', shape: def.shape, roundNo: info.no, index: idx });
      }
    }
    // Side edges so the sheet has some body.
    const rgbL = hexToRgb(round.hexes[reverse ? count - 1 : 0] ?? '#cccccc');
    const rgbR = hexToRgb(round.hexes[reverse ? 0 : count - 1] ?? '#cccccc');
    w.quad([[x0, y, -T], [x0, y, T], [x0, y + h, T], [x0, y + h, -T]], [[-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0]], rgbL, info.no, 0);
    w.quad([[-x0, y, T], [-x0, y, -T], [-x0, y + h, -T], [-x0, y + h, T]], [[1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0]], rgbR, info.no, count - 1);
    rings.set(info.no, [[x0, y + h, T + 0.02], [-x0, y + h, T + 0.02], [-x0, y + h, -T - 0.02], [x0, y + h, -T - 0.02], [x0, y + h, T + 0.02]]);
    y += h;
  });
  return finish(w, 'flat', placements, rings, []);
}

/** Build the part's shape. `rounds` must only contain rounds that parsed. */
export function buildShape(rounds: ShapeRound[], opts: ShapeOptions): BuiltShape | null {
  const usable = rounds.filter((r) => r.info.stitches.length > 0);
  if (!usable.length) return null;
  return opts.method === 'flat' ? buildFlat(usable) : buildLathe(usable, opts);
}
