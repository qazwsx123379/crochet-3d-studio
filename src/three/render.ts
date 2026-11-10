/**
 * Everything the 3D view (and the library thumbnails) need to draw a part:
 * the fill surface, one placement per stitch for the yarn, round outlines for
 * highlighting, and the bounds for framing.
 */
import { buildShape, type Placement, type ShapeOptions, type ShapeRound } from './geometry';
import { STITCH_BY_CODE } from '../pattern/stitches';
import { relaxShape } from './relax';

type V3 = [number, number, number];

export interface RenderData {
  positions: Float32Array;
  colors: Float32Array;
  /** Present for the relaxed (indexed) surface; normals are computed from it. */
  index?: Uint32Array;
  /** Present for the non-indexed surfaces. */
  normals?: Float32Array;
  faceRound: Int32Array;
  faceStitch: Int32Array;
  placements: Placement[];
  rings: Map<number, V3[]>;
  center: V3;
  radius: number;
  minY: number;
  maxY: number;
  /** Flat sheets are seen from both sides. */
  doubleSided: boolean;
}

const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];

function boundsY(p: Float32Array): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 1; i < p.length; i += 3) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); }
  return p.length ? [lo, hi] : [0, 0];
}

/**
 * An increase (V, FV) is two stitches standing in one stitch below: draw it as
 * two narrower stitches leaning apart, the way it looks in real fabric.
 */
function splitIncreases(list: Placement[], rounds: ShapeRound[]): Placement[] {
  const codes = new Map(rounds.map((r) => [r.info.no, r.info.stitches.map((s) => s.code)]));
  const out: Placement[] = [];
  for (const p of list) {
    const def = STITCH_BY_CODE[codes.get(p.roundNo)?.[p.index] ?? ''];
    if (!def || def.produces !== 2 || def.consumes !== 1 || p.shape !== 'post') { out.push(p); continue; }
    const w = p.width / 2;
    for (const side of [-1, 1]) {
      const lean: V3 = [p.up[0] + p.tangent[0] * side * 0.25, p.up[1] + p.tangent[1] * side * 0.25, p.up[2] + p.tangent[2] * side * 0.25];
      const l = Math.hypot(...lean);
      const up: V3 = [lean[0] / l, lean[1] / l, lean[2] / l];
      // tangent ⟂ up, in the fabric: t − (t·up)up
      const d = p.tangent[0] * up[0] + p.tangent[1] * up[1] + p.tangent[2] * up[2];
      const t: V3 = [p.tangent[0] - d * up[0], p.tangent[1] - d * up[1], p.tangent[2] - d * up[2]];
      const tl = Math.hypot(...t);
      out.push({ ...p, width: w * 1.05, up, tangent: [t[0] / tl, t[1] / tl, t[2] / tl], pos: [p.pos[0] + p.tangent[0] * side * w * 0.5, p.pos[1] + p.tangent[1] * side * w * 0.5, p.pos[2] + p.tangent[2] * side * w * 0.5] });
    }
  }
  return out;
}

/**
 * 「環起 3ch，四個未完成長針，1ch，拉緊」: a single puff pulled tight in a ring
 * is a little ball (a cherry, a berry), not a round of fabric.
 */
function bobbleBall(rounds: ShapeRound[], yarn: boolean): RenderData | null {
  if (rounds.length !== 1) return null;
  const r = rounds[0];
  const bumps = r.info.stitches.map((s, i) => ({ s, i })).filter(({ s }) => STITCH_BY_CODE[s.code]?.shape === 'bump');
  if (!bumps.length || r.info.produced > 8) return null;
  const R = 1.05;
  const hex = r.hexes[bumps[0].i] ?? r.hexes[0] ?? '#cc3333';
  // Fill: a slightly squashed sphere.
  const seg = 24, ring = 16;
  const pos: number[] = [], col: number[] = [], idx: number[] = [], fr: number[] = [], fs: number[] = [];
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => { const v = c / 255; return (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * (yarn ? 0.55 : 1); };
  for (let a = 0; a <= ring; a++) for (let b = 0; b <= seg; b++) {
    const th = (a / ring) * Math.PI, ph = (b / seg) * Math.PI * 2;
    pos.push(R * Math.sin(th) * Math.cos(ph), R * 0.92 * Math.cos(th) + R, R * Math.sin(th) * Math.sin(ph));
    col.push(lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255));
  }
  for (let a = 0; a < ring; a++) for (let b = 0; b < seg; b++) {
    const i = a * (seg + 1) + b, j = i + seg + 1;
    idx.push(i, j, i + 1, i + 1, j, j + 1);
    fr.push(1, 1); fs.push(bumps[0].i, bumps[0].i);
  }
  // Yarn: the puff's loops run from pole to pole like the segments of an orange.
  const loops = 6;
  const placements: Placement[] = [];
  for (let k = 0; k < loops; k++) {
    const ph = (k / loops) * Math.PI * 2;
    const normal: V3 = [Math.cos(ph), 0, Math.sin(ph)];
    placements.push({ pos: [normal[0] * R * 0.78, R, normal[2] * R * 0.78], tangent: [-Math.sin(ph), 0, Math.cos(ph)], up: [0, 1, 0], normal, width: 1.15, height: 1.75, hex, shape: 'bump', roundNo: 1, index: bumps[0].i });
  }
  const ringPts: V3[] = Array.from({ length: 25 }, (_, k) => [Math.cos((k / 24) * Math.PI * 2) * R, R, Math.sin((k / 24) * Math.PI * 2) * R]);
  return {
    positions: new Float32Array(pos), colors: new Float32Array(col), index: new Uint32Array(idx), faceRound: new Int32Array(fr), faceStitch: new Int32Array(fs),
    placements, rings: new Map([[1, ringPts]]), center: [0, R, 0], radius: R * 1.4, minY: 0.08 * R, maxY: R * 1.92, doubleSided: false,
  };
}

/**
 * Roll a flat strip into a coil around the vertical axis, starting from the
 * end where the first row began: rows stay upright, the strip winds outwards
 * in an Archimedean spiral about one stitch thick per turn.
 */
function rollUp(d: RenderData): RenderData {
  let minX = Infinity;
  for (let i = 0; i < d.positions.length; i += 3) minX = Math.min(minX, d.positions[i]);
  const R0 = 1.4, b = 1.3 / (Math.PI * 2);
  const theta = (s: number) => (-R0 + Math.sqrt(R0 * R0 + 2 * b * Math.max(0, s))) / b;
  const pt = (x: number, y: number, z: number): V3 => {
    const t = theta(x - minX);
    const r = R0 + b * t + z;
    return [r * Math.cos(t), y, r * Math.sin(t)];
  };
  const vec = (x: number, v: V3): V3 => {
    const t = theta(x - minX), c = Math.cos(t), sn = Math.sin(t);
    return [-sn * v[0] + c * v[2], v[1], c * v[0] + sn * v[2]];
  };
  const positions = new Float32Array(d.positions.length);
  for (let i = 0; i < d.positions.length; i += 3) {
    const p = pt(d.positions[i], d.positions[i + 1], d.positions[i + 2]);
    positions[i] = p[0]; positions[i + 1] = p[1]; positions[i + 2] = p[2];
  }
  const placements = d.placements.map((p) => ({ ...p, pos: pt(...p.pos), tangent: vec(p.pos[0], p.tangent), up: vec(p.pos[0], p.up), normal: vec(p.pos[0], p.normal) }));
  const rings = new Map([...d.rings].map(([k, pts]) => [k, pts.map((q) => pt(...q))]));
  let min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }
  const center: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.max(1, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
  return { ...d, positions, normals: undefined, placements, rings, center, radius, minY: min[1], maxY: max[1], doubleSided: true };
}

/**
 * 「環起鉤 5(3CH, 倒2鉤2X, SL)」: one round of chains with stitches worked back
 * along them makes little leaves around the ring (a strawberry's calyx, a
 * star), not a round of fabric.
 */
function leafStar(rounds: ShapeRound[], yarn: boolean): RenderData | null {
  if (rounds.length !== 1) return null;
  const r = rounds[0];
  const st = r.info.stitches;
  if (!st.some((x) => x.free)) return null;
  // A leaf ends at each slip stitch (or wherever the next chain run starts).
  const leaves: number[][] = [];
  let cur: number[] = [];
  st.forEach((x, i) => {
    if (x.code === 'ch' && cur.length && st[i - 1]?.code !== 'ch') { leaves.push(cur); cur = []; }
    cur.push(i);
    if (x.code === 'sl') { leaves.push(cur); cur = []; }
  });
  if (cur.length) leaves.push(cur);
  const K = leaves.length;
  if (K < 2) return null;
  const placements: Placement[] = [];
  const pos: number[] = [], col: number[] = [], idx: number[] = [], fr: number[] = [], fs: number[] = [];
  const hexOf = (i: number) => r.hexes[i] ?? r.hexes[0] ?? '#5a8a3a';
  const lin = (hex: string) => { const n = parseInt(hex.slice(1), 16); const f = (c: number) => { const v = c / 255; return (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * (yarn ? 0.55 : 1); }; return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)]; };
  const R0 = 0.55;
  // Centre of the ring.
  pos.push(0, 0.05, 0); col.push(...lin(hexOf(0)));
  leaves.forEach((leaf, k) => {
    const a = (k / K) * Math.PI * 2;
    const out: V3 = [Math.cos(a), 0, Math.sin(a)], side: V3 = [-Math.sin(a), 0, Math.cos(a)];
    const chains = leaf.filter((i) => st[i].code === 'ch').length || 1;
    const len = 0.6 * chains + 0.3;
    leaf.forEach((i, q) => {
      const s = st[i];
      // Chains run out along the leaf; the stitches worked back come in beside them.
      const along = s.code === 'ch' ? R0 + (q + 0.5) * (len / chains) : s.free ? R0 + len * (1 - (q - chains + 0.5) / Math.max(1, leaf.length - chains)) : R0;
      const off = s.free ? 0.22 : s.code === 'ch' ? -0.12 : 0;
      placements.push({
        pos: [out[0] * along + side[0] * off, 0.12, out[2] * along + side[2] * off], tangent: side, up: out, normal: [0, 1, 0],
        width: s.code === 'ch' ? 0.55 : 0.75, height: s.code === 'ch' ? 0.55 : 0.8, hex: hexOf(i), shape: s.code === 'ch' ? 'chain' : s.code === 'sl' ? 'slip' : 'post', roundNo: r.info.no, index: i,
      });
    });
    // Fill: a pointed leaf from the ring out to the tip.
    const base = pos.length / 3;
    const tip = R0 + len + 0.15, w = 0.42;
    const pts: V3[] = [[out[0] * R0 - side[0] * w, 0.04, out[2] * R0 - side[2] * w], [out[0] * tip, 0.08, out[2] * tip], [out[0] * R0 + side[0] * w, 0.04, out[2] * R0 + side[2] * w], [out[0] * (R0 + len * 0.5) + side[0] * w * 0.8, 0.07, out[2] * (R0 + len * 0.5) + side[2] * w * 0.8], [out[0] * (R0 + len * 0.5) - side[0] * w * 0.8, 0.07, out[2] * (R0 + len * 0.5) - side[2] * w * 0.8]];
    for (const p of pts) { pos.push(...p); col.push(...lin(hexOf(leaf[0]))); }
    // centre fan + leaf body
    idx.push(0, base + 2, base, base, base + 4, base + 1, base + 4, base + 3, base + 1, base + 2, base + 3, base + 4, base + 4, base, base + 2);
    for (let t = 0; t < 5; t++) { fr.push(r.info.no); fs.push(leaf[0]); }
  });
  const ringPts: V3[] = Array.from({ length: K + 1 }, (_, k) => [Math.cos((k / K) * Math.PI * 2) * R0, 0.1, Math.sin((k / K) * Math.PI * 2) * R0]);
  const ext = R0 + 0.6 * 3 + 0.5;
  return {
    positions: new Float32Array(pos), colors: new Float32Array(col), index: new Uint32Array(idx), faceRound: new Int32Array(fr), faceStitch: new Int32Array(fs),
    placements: [...placements, ...placements.map((p) => ({ ...p, normal: neg(p.normal), tangent: neg(p.tangent) }))],
    rings: new Map([[r.info.no, ringPts]]), center: [0, 0.1, 0], radius: ext, minY: 0, maxY: 0.3, doubleSided: true,
  };
}

/** `yarn` darkens the fill so it reads as the shadow between stitches. */
export function prepareRender(rounds: ShapeRound[], opts: ShapeOptions, yarn: boolean): RenderData | null {
  const d = prepareFlatOrRound(rounds, opts, yarn);
  return d && opts.roll && opts.method === 'flat' && d.index ? rollUp(d) : d;
}

function prepareFlatOrRound(rounds: ShapeRound[], opts: ShapeOptions, yarn: boolean): RenderData | null {
  if (opts.start === 'ring' && opts.method !== 'flat') {
    const ball = bobbleBall(rounds, yarn) ?? leafStar(rounds, yarn);
    if (ball) return ball;
  }
  const base = buildShape(rounds, opts);
  if (!base) return null;
  const relaxed = relaxShape(base, rounds, { ...opts, fillShade: yarn ? 0.55 : 1 });
  if (relaxed) {
    const [minY, maxY] = boundsY(relaxed.fill.positions);
    // A piece that lies flat (a coaster) is seen from both sides: put yarn on both.
    const flatish = base.kind === 'flat' || maxY - minY < relaxed.radius * 0.35;
    const front = splitIncreases(relaxed.placements, rounds);
    const placements = flatish ? [...front, ...front.map((p) => ({ ...p, normal: neg(p.normal), tangent: neg(p.tangent) }))] : front;
    return {
      positions: relaxed.fill.positions, colors: relaxed.fill.colors, index: relaxed.fill.index,
      faceRound: relaxed.fill.faceRound, faceStitch: relaxed.fill.faceStitch,
      placements, rings: relaxed.rings, center: relaxed.center, radius: relaxed.radius,
      minY, maxY, doubleSided: flatish,
    };
  }
  const colors = base.colors;
  if (yarn) for (let i = 0; i < colors.length; i++) colors[i] *= 0.55;
  const [minY, maxY] = boundsY(base.positions);
  return {
    positions: base.positions, normals: base.normals, colors, faceRound: base.faceRound, faceStitch: base.faceStitch,
    placements: splitIncreases(base.placements, rounds), rings: base.rings, center: base.center, radius: base.radius, minY, maxY, doubleSided: base.kind === 'flat',
  };
}
