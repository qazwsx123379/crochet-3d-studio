/**
 * Stitch-level relaxation for rounds (amigurumi). The lathe shape from
 * geometry.ts is only the starting guess; here every stitch becomes a point
 * tied to its neighbours in the round (one stitch width apart) and to the
 * stitch(es) it was worked into (one stitch height apart). Letting those ties
 * settle gives the faceted increase lines and soft bulges real pieces have,
 * which a perfect surface of revolution cannot show. With stuffing, a gentle
 * outward pressure fills the shape out.
 */
import { STITCH_BY_CODE, consumesOf } from '../pattern/stitches';
import type { BuiltShape, Placement, ShapeOptions, ShapeRound } from './geometry';

type V3 = [number, number, number];

export interface RelaxedShape {
  placements: Placement[];
  /** Indexed fill surface between stitches (the yarn sits on top of it). */
  fill: { positions: Float32Array; colors: Float32Array; index: Uint32Array; faceRound: Int32Array; faceStitch: Int32Array };
  rings: Map<number, V3[]>;
  center: V3;
  radius: number;
}

interface Node { p: V3; round: number; roundNo: number; index: number; parents: number[]; hex: string; height: number; produces: number; placement?: Placement }

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function hexDarken(hex: string, k: number): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return [lin((n >> 16) & 255) * k, lin((n >> 8) & 255) * k, lin(n & 255) * k];
}

export function relaxShape(base: BuiltShape, rounds: ShapeRound[], opts: ShapeOptions & { fillShade: number }): RelaxedShape | null {
  if (!base.placements.length) return null;
  // Flat pieces (rows worked back and forth) relax too: a row with many more
  // stitches than the one below has to curve or ruffle, just like real fabric.
  const flat = base.kind === 'flat';

  // ---- nodes: the top of every stitch, starting from the lathe guess ----
  const nodes: Node[] = [];
  const byRound = new Map<number, number[]>();
  const placementIndex = new Map<string, Placement>();
  // Flat sheets carry a front and a back copy of every stitch; start from the front.
  for (const p of base.placements) if (!flat || p.normal[2] > 0) placementIndex.set(`${p.roundNo}:${p.index}`, p);
  const usable = rounds.filter((r) => r.info.stitches.length > 0);
  const roundIdx = new Map(usable.map((r, i) => [r.info.no, i]));

  // A centre point for magic-ring starts (round 1 is worked into it).
  const firstNo = base.placements[0].roundNo;
  const ringStart = opts.start === 'ring' && !flat;
  let centerId = -1;
  if (ringStart) {
    const first = base.placements.filter((p) => p.roundNo === firstNo);
    const c = mul(first.reduce<V3>((s, p) => add(s, sub(p.pos, mul(p.up, p.height * 0.5))), [0, 0, 0]), 1 / first.length);
    centerId = nodes.push({ p: c, round: -1, roundNo: 0, index: 0, parents: [], hex: first[0].hex, height: 0, produces: 0 }) - 1;
  }

  let prevSlots: number[] = [];
  for (const r of usable) {
    const ids: number[] = [];
    const slots: number[] = [];
    // Begin where the pattern says, counted from where the work arrives.
    let ptr = Math.max(0, (r.info.startAt ?? 1) - 1);
    let lastGroup: number | undefined;
    let groupParents: number[] = [];
    // A flat row turns and works back along the row below, from its far end.
    const below = flat ? [...prevSlots].reverse() : prevSlots;
    const take = (n: number): number[] => {
      if (!below.length) return ringStart && centerId >= 0 && !byRound.size ? [centerId] : [];
      const out: number[] = [];
      for (let k = 0; k < n; k++) out.push(below[flat ? Math.min(ptr + k, below.length - 1) : (ptr + k) % below.length]);
      ptr += n;
      return [...new Set(out)];
    };
    r.info.stitches.forEach((st, k) => {
      const def = STITCH_BY_CODE[st.code];
      if (!def) return;
      let parents: number[];
      if (st.group !== undefined && st.group === lastGroup) parents = groupParents;
      else if (st.group !== undefined) {
        // [ … ] uses one stitch of the round below for the whole group.
        const groupConsumes = r.info.stitches.some((s) => s.group === st.group && consumesOf(s)) ? 1 : 0;
        parents = take(groupConsumes);
        groupParents = parents;
      } else parents = take(consumesOf(st));
      lastGroup = st.group;
      const pl = placementIndex.get(`${r.info.no}:${k}`);
      if (!pl) return; // a skipped stitch leaves no stitch of its own
      const top = add(pl.pos, mul(pl.up, pl.height * 0.45));
      // A tiny, fixed wobble lets a flat sheet buckle out of its plane where it must.
      if (flat) top[2] += Math.sin(k * 1.7 + r.info.no * 2.3) * 0.2;
      const id = nodes.push({ p: top, round: roundIdx.get(r.info.no)!, roundNo: r.info.no, index: k, parents: parents.length ? parents : (prevSlots.length ? [] : ringStart ? [centerId] : []), hex: pl.hex, height: Math.max(0.4, def.height), produces: def.produces, placement: pl }) - 1;
      ids.push(id);
      for (let q = 0; q < def.produces; q++) slots.push(id);
    });
    if (ids.length) byRound.set(r.info.no, ids);
    if (slots.length) prevSlots = slots;
  }
  if (!byRound.size) return null;

  // Flat pieces: the starting guess stretches every row to the widest one, so
  // restart from rows at their true width, stacked at their true heights.
  if (flat) {
    const rowsIds = [...byRound.values()];
    const widthsOf = (ids: number[]) => ids.map((i) => (nodes[i].parents.length || ids.every((j) => !nodes[j].parents.length) ? Math.max(0.5, nodes[i].produces) : 0.5));
    const totals = rowsIds.map((ids) => widthsOf(ids).reduce((a, b) => a + b, 0));
    const heights = rowsIds.map((ids) => ids.reduce((m, i) => Math.max(m, nodes[i].height), 0.5));
    const ys: number[] = [];
    heights.reduce((y, h) => { ys.push(y + h); return y + h; }, 0);
    // How fast rows get longer as the piece grows. Growth that keeps going row
    // after row bends the piece into a fan or ring (a collar); a single row
    // that suddenly doubles ruffles instead, so a median ignores it.
    const slopes = totals.slice(1).map((t, r) => (t - totals[r]) / heights[r + 1]).sort((a, b) => a - b);
    // One growing row (an edging) ruffles; it takes at least two to bend the piece.
    const slope = slopes.length < 2 ? 0 : slopes.length >= 4
      ? (slopes[(slopes.length - 1) >> 1] + slopes[slopes.length >> 1]) / 2
      : slopes.reduce((a, b) => a + b, 0) / slopes.length;
    const theta = Math.min(Math.PI * 1.9, Math.max(0, slope));
    const R0 = theta > 0.05 ? totals[0] / theta - ys[0] : 0;
    let prevSpan = 0;
    rowsIds.forEach((ids, r) => {
      const widths = widthsOf(ids);
      const total = totals[r];
      const y = ys[r];
      // Room this row has: its arc in the fan, or about the row below. Anything
      // longer starts as a wave so it ruffles instead of stretching the piece.
      const room = theta > 0.05 ? theta * (R0 + y) : prevSpan ? prevSpan * 1.15 : total;
      const span = Math.min(total, Math.max(room, prevSpan * 0.6));
      const squeeze = span / total;
      const amp = total > span * 1.05 ? Math.min(3, (4 * Math.sqrt(total / span - 1)) / Math.PI) : 0;
      const first = nodes[ids[0]].p, last = nodes[ids[ids.length - 1]].p;
      const dir = last[0] >= first[0] ? 1 : -1;
      let x = -total / 2;
      ids.forEach((i, k) => {
        x += widths[k] / 2;
        const z = amp ? amp * Math.sin((x / 4) * Math.PI * 2) : nodes[i].p[2];
        const u = dir * x * squeeze;
        if (theta > 0.05) {
          const R = R0 + y, phi = u / R;
          nodes[i].p = [R * Math.sin(phi), R * Math.cos(phi) - R0, z];
        } else nodes[i].p = [u, y, z];
        x += widths[k] / 2;
      });
      prevSpan = span;
    });
  }

  // ---- constraints ----
  type Link = [number, number, number, number]; // a, b, rest length, stiffness
  const links: Link[] = [];
  const roundLists = [...byRound.values()];
  for (const ids of roundLists) {
    const n = ids.length;
    // The starting chain has nothing below it; its chains are full stitch widths.
    const anchored = ids.some((i) => nodes[i].parents.length > 0);
    for (let k = 0; k < n; k++) {
      if (n < 2) break;
      const a = ids[k], b = ids[(k + 1) % n];
      if (k === n - 1 && (n < 3 || flat)) break;
      // A chain is a short link of yarn: a run of chains between two stitches
      // bulges out as an arch instead of stretching the whole row.
      if (anchored && (!nodes[a].parents.length || !nodes[b].parents.length)) {
        links.push([a, b, nodes[a].placement!.shape === 'chain' && nodes[b].placement!.shape === 'chain' ? 0.5 : 0.62, 0.7]);
        continue;
      }
      // An increase makes two stitches on top, so it is two stitch widths wide.
      const widths = (Math.max(0.5, nodes[a].produces) + Math.max(0.5, nodes[b].produces)) / 2;
      const w = flat ? widths : (len(sub(nodes[a].placement!.pos, nodes[b].placement!.pos)) + widths) / 2; // between the guess and the true width
      links.push([a, b, w, 0.7]);
    }
  }
  // Chains aren't worked into the round below; tie them loosely to their nearest
  // anchored neighbour's base so chain arches stay close to the fabric.
  for (const ids of roundLists) {
    ids.forEach((id, k) => {
      if (nodes[id].parents.length) return;
      for (let d = 1; d < ids.length; d++) {
        const nb = nodes[ids[(k - d + ids.length) % ids.length]].parents.length ? ids[(k - d + ids.length) % ids.length] : nodes[ids[(k + d) % ids.length]].parents.length ? ids[(k + d) % ids.length] : -1;
        if (nb < 0) continue;
        // Rest length: about as far as the chain can reach along the arch, never the
        // (possibly huge) distance in the starting guess.
        const reach = nodes[nb].height + 0.45 * d;
        for (const par of nodes[nb].parents) links.push([id, par, Math.min(len(sub(nodes[id].p, nodes[par].p)), reach), 0.2]);
        break;
      }
    });
  }
  // Ties to the stitch below: halfway between the guess and the true stitch height, and softer,
  // so increases show their facets without the fabric buckling.
  for (let i = 0; i < nodes.length; i++) for (const par of nodes[i].parents) {
    const guess = len(sub(nodes[i].p, nodes[par].p));
    // Flat rows start as a plain stack, so their guess says nothing; use the true height.
    links.push(flat ? [i, par, nodes[i].height, 0.5] : [i, par, guess * 0.5 + nodes[i].height * 0.5, 0.45]);
  }

  // ---- settle ----
  const P = nodes.map((n) => [...n.p] as V3);
  const closed = opts.stuffed && roundLists.length > 3 && roundLists[roundLists.length - 1].length <= Math.max(8, roundLists.reduce((m, l) => Math.max(m, l.length), 0) * 0.5);
  const iterations = flat ? Math.min(220, Math.max(80, Math.round(200000 / Math.max(1, links.length)))) : Math.min(90, Math.max(30, Math.round(120000 / Math.max(1, links.length))));
  // A flat piece stays flat where its rows don't grow much; only rows much
  // longer than the row below ruffle out of the plane.
  const flatPull: number[] = [];
  if (flat) roundLists.forEach((ids, r) => {
    const ratio = r > 0 ? ids.length / Math.max(1, roundLists[r - 1].length) : 1;
    const k = ratio <= 1.2 ? 0.08 : ratio <= 1.6 ? 0.03 : 0.004;
    for (const i of ids) flatPull[i] = k;
  });
  for (let it = 0; it < iterations; it++) {
    if (flat) for (let i = 0; i < P.length; i++) if (flatPull[i]) P[i][2] -= P[i][2] * flatPull[i];
    // Keep rounds smooth so the fabric doesn't crumple.
    for (const ids of roundLists) {
      const n = ids.length;
      if (n < 3) continue;
      for (let k = 0; k < n; k++) {
        if (flat && (k === 0 || k === n - 1)) continue;
        const a = P[ids[(k + n - 1) % n]], b = P[ids[(k + 1) % n]], c = P[ids[k]];
        for (let d = 0; d < 3; d++) c[d] += ((a[d] + b[d]) / 2 - c[d]) * 0.04;
      }
    }
    // The magic ring stays in the middle of the first round.
    if (centerId >= 0 && roundLists[0]) {
      const r1 = roundLists[0];
      P[centerId] = mul(r1.reduce<V3>((s, i) => add(s, P[i]), [0, 0, 0]), 1 / r1.length);
    }
    if (closed) {
      const C = mul(P.reduce<V3>((s, p) => add(s, p), [0, 0, 0]), 1 / P.length);
      for (const p of P) { const d = norm(sub(p, C)); for (let k = 0; k < 3; k++) p[k] += d[k] * 0.025; }
    }
    for (const [a, b, rest, stiff] of links) {
      const pa = P[a], pb = P[b];
      const d = sub(pb, pa);
      const l = len(d) || 1e-6;
      const corr = ((l - rest) / l) * 0.5 * stiff;
      for (let k = 0; k < 3; k++) { pa[k] += d[k] * corr; pb[k] -= d[k] * corr; }
    }
  }

  // ---- rebuild placements from the settled points ----
  const C = mul(P.reduce<V3>((s, p) => add(s, p), [0, 0, 0]), 1 / P.length);
  const placements: Placement[] = [];
  const rings = new Map<number, V3[]>();
  for (const ids of roundLists) {
    const n = ids.length;
    rings.set(nodes[ids[0]].roundNo, flat ? ids.map((i) => P[i]) : [...ids.map((i) => P[i]), P[ids[0]]]);
    ids.forEach((id, k) => {
      const node = nodes[id];
      const pl = node.placement!;
      const top = P[id];
      const bottom = node.parents.length ? mul(node.parents.reduce<V3>((s, q) => add(s, P[q]), [0, 0, 0]), 1 / node.parents.length) : sub(top, mul(pl.up, pl.height * 0.9));
      const upVec = sub(top, bottom);
      const height = Math.max(0.3, len(upVec));
      const up = norm(upVec);
      const prev = P[ids[flat ? Math.max(0, k - 1) : (k + n - 1) % n]], next = P[ids[flat ? Math.min(n - 1, k + 1) : (k + 1) % n]];
      let tangent = n > 1 ? norm(sub(next, prev)) : pl.tangent;
      const pos = add(bottom, mul(upVec, 0.5));
      let normal = norm(cross(tangent, up));
      if (flat ? dot(normal, [0, 0, 1]) < 0 : dot(normal, sub(pos, C)) < 0 && dot(pl.normal, normal) < 0) normal = mul(normal, -1);
      tangent = norm(cross(up, normal));
      const width = n > 1 ? Math.max(0.35, (len(sub(next, top)) + len(sub(top, prev))) / 2) : pl.width;
      placements.push({ ...pl, pos, up, normal, tangent, width, height });
    });
  }

  // ---- fill surface: each stitch's top to the stitch(es) below ----
  const pos: number[] = [], col: number[] = [], idx: number[] = [], fr: number[] = [], fs: number[] = [];
  const vert = new Map<number, number>();
  const v = (id: number) => {
    let i = vert.get(id);
    if (i === undefined) {
      i = pos.length / 3;
      pos.push(...P[id]);
      col.push(...hexDarken(nodes[id].hex, opts.fillShade));
      vert.set(id, i);
    }
    return i;
  };
  const tri = (a: number, b: number, c: number, owner: number) => { idx.push(v(a), v(b), v(c)); fr.push(nodes[owner].roundNo); fs.push(nodes[owner].index); };
  const prevOrder = new Map<number, number>(); // node id → position in its round
  for (const ids of roundLists) ids.forEach((id, k) => prevOrder.set(id, k));
  for (let r = 0; r < roundLists.length; r++) {
    const ids = roundLists[r];
    const n = ids.length;
    const below = r > 0 ? roundLists[r - 1] : null;
    for (let k = 0; k < n; k++) {
      const a = ids[k], b = ids[(k + 1) % n];
      if (k === n - 1 && (n < 3 || flat)) break;
      const pa = nodes[a].parents[0], pb = nodes[b].parents[0];
      if (pa === undefined || pb === undefined) continue;
      tri(a, b, pa, b);
      if (pa === pb) continue;
      if (below && prevOrder.has(pa) && prevOrder.has(pb) && pa !== centerId) {
        // Walk the round below from pa to pb so decreases leave no holes.
        const m = below.length;
        let i = prevOrder.get(pa)!;
        const end = prevOrder.get(pb)!;
        // Rounds run the same way as the round below; flat rows run back the other way.
        const step = flat ? (end > i ? 1 : -1) : 1;
        let guard = 0;
        while (i !== end && guard++ < m) { const j = (i + step + m) % m; tri(b, below[j], below[i], b); i = j; }
      } else tri(b, pb, pa, b);
    }
  }
  // Close a top that was decreased shut.
  const last = roundLists[roundLists.length - 1];
  if (!flat && roundLists.length > 3 && last.length <= 8) {
    const apexP = mul(last.reduce<V3>((s, i) => add(s, P[i]), [0, 0, 0]), 1 / last.length);
    const apex = nodes.push({ p: apexP, round: -2, roundNo: nodes[last[0]].roundNo, index: 0, parents: [], hex: nodes[last[0]].hex, height: 0, produces: 0 }) - 1;
    P.push(apexP);
    for (let k = 0; k < last.length; k++) tri(apex, last[(k + 1) % last.length], last[k], last[k]);
  }
  // Make the fill face outwards.
  let score = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = pos.slice(idx[t] * 3, idx[t] * 3 + 3) as V3, b = pos.slice(idx[t + 1] * 3, idx[t + 1] * 3 + 3) as V3, c = pos.slice(idx[t + 2] * 3, idx[t + 2] * 3 + 3) as V3;
    score += dot(cross(sub(b, a), sub(c, a)), sub(a, C));
  }
  if (!flat && score < 0) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }

  let min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of P) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  const center: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  return {
    placements, rings, center, radius: Math.max(1, len(sub(max, min)) / 2),
    fill: { positions: new Float32Array(pos), colors: new Float32Array(col), index: new Uint32Array(idx), faceRound: new Int32Array(fr), faceStitch: new Int32Array(fs) },
  };
}
