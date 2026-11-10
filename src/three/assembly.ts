/**
 * The maths behind assembling a work: where each part copy sits, how to join
 * "part A round X" onto "part B round Y", and how to spread copies evenly
 * along a round (cherries around a collar, spikes around a hat).
 *
 * Every part is first moved into its own "part frame": centred on the y axis,
 * standing on y = 0, turned upside down when its settings say so. A work item
 * then places that frame with a position, rotation (degrees), uniform scale and
 * an optional left–right mirror.
 */
import * as THREE from 'three';
import type { Part, V3, Work, WorkItem } from '../types';
import { analyze } from '../pattern/analyze';
import { roundHexes } from '../pattern/colors';
import { prepareRender, type RenderData } from './render';
import { newId } from '../store/yarns';

/* ---------- render data per part, cached by edit time ---------- */

const cache = new Map<string, RenderData | null>();
export function partData(part: Part, yarn: boolean): RenderData | null {
  const key = `${part.id}@${part.updatedAt}@${yarn}@${JSON.stringify(part.settings)}@${part.rows.length}`;
  if (cache.has(key)) return cache.get(key)!;
  const a = analyze(part.rows, part.settings);
  const rounds = a.rounds.filter((r) => r.stitches.length && r.status !== 'syntax' && r.status !== 'empty').map((info) => ({ info, hexes: roundHexes(part, info) }));
  let data: RenderData | null = null;
  try { data = prepareRender(rounds, { method: part.settings.method, start: part.settings.start, stuffed: true, roll: !!part.settings.roll }, yarn); } catch (e) { console.error(e); }
  if (cache.size > 80) cache.clear();
  cache.set(key, data);
  return data;
}

/** Stitches a part draws, to decide whether a whole work can afford yarn. */
export function stitchCount(part: Part): number {
  return analyze(part.rows, part.settings).rounds.reduce((n, r) => n + r.stitches.length, 0);
}

/* ---------- frames ---------- */

/** Part data coordinates → part frame (centred, standing on y = 0, flipped if asked). */
export function baseMatrix(part: Part, data: RenderData): THREE.Matrix4 {
  const [cx, , cz] = data.center;
  if (part.settings.flip) {
    // Upside down about x: y → −y, z → −z, then stand it on the floor.
    return new THREE.Matrix4().makeTranslation(-cx, data.maxY, cz).multiply(new THREE.Matrix4().makeRotationX(Math.PI));
  }
  return new THREE.Matrix4().makeTranslation(-cx, -data.minY, -cz);
}

/** Part frame → world, for one work item. */
export function itemMatrix(item: WorkItem): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...item.rot.map(THREE.MathUtils.degToRad) as V3, 'XYZ'));
  const s = new THREE.Vector3(item.mirror ? -item.scale : item.scale, item.scale, item.scale);
  return new THREE.Matrix4().compose(new THREE.Vector3(...item.pos), q, s);
}

/** Part data coordinates → world. */
export function worldMatrix(part: Part, data: RenderData, item: WorkItem): THREE.Matrix4 {
  return itemMatrix(item).multiply(baseMatrix(part, data));
}

/** Height of the part frame (for laying parts out side by side). */
export function frameSize(data: RenderData): number {
  return data.radius * 2;
}

/* ---------- rounds ---------- */

export interface RoundFrame { center: THREE.Vector3; normal: THREE.Vector3; radius: number; points: THREE.Vector3[] }

/**
 * Centre, plane normal and size of one round, in data coordinates. The normal
 * points out of the part's opening: away from the rest of the part.
 */
export function roundFrame(data: RenderData, roundNo: number): RoundFrame | null {
  const ring = data.rings.get(roundNo);
  if (!ring || ring.length < 2) return null;
  const points = ring.map((p) => new THREE.Vector3(...p));
  const center = points.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / points.length);
  // Newell's method gives a robust plane normal for a closed loop.
  const normal = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    normal.x += (a.y - b.y) * (a.z + b.z);
    normal.y += (a.z - b.z) * (a.x + b.x);
    normal.z += (a.x - b.x) * (a.y + b.y);
  }
  if (normal.lengthSq() < 1e-9) normal.set(0, 1, 0);
  normal.normalize();
  const partCenter = new THREE.Vector3(...data.center);
  if (normal.dot(center.clone().sub(partCenter)) < 0) normal.negate();
  const radius = points.reduce((m, p) => Math.max(m, p.distanceTo(center)), 0);
  return { center, normal, radius, points };
}

/** Round numbers a part has (for the 「第幾圈」 pickers). */
export function roundNumbers(data: RenderData): number[] {
  return [...data.rings.keys()].sort((a, b) => a - b);
}

/**
 * Move and turn item A so its round `roundA` sits on round `roundB` of item B,
 * the two openings facing each other (a leg sewn to a body, a hat on a head).
 * `flip` makes them face the same way instead (a brim folded over).
 */
export function alignItems(a: { part: Part; data: RenderData; item: WorkItem }, roundA: number, b: { part: Part; data: RenderData; item: WorkItem }, roundB: number, flip = false): WorkItem | null {
  const fa = roundFrame(a.data, roundA);
  const fb = roundFrame(b.data, roundB);
  if (!fa || !fb) return null;
  // A's round in A's own frame, before its position/rotation (but with mirror and scale).
  const local = new THREE.Matrix4().makeScale(a.item.mirror ? -a.item.scale : a.item.scale, a.item.scale, a.item.scale).multiply(baseMatrix(a.part, a.data));
  const ca = fa.center.clone().applyMatrix4(local);
  const na = fa.normal.clone().transformDirection(local);
  const wb = worldMatrix(b.part, b.data, b.item);
  const cb = fb.center.clone().applyMatrix4(wb);
  const nb = fb.normal.clone().transformDirection(wb);
  const target = flip ? nb : nb.clone().negate();
  const q = new THREE.Quaternion().setFromUnitVectors(na, target);
  const pos = cb.clone().sub(ca.clone().applyQuaternion(q));
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return { ...a.item, pos: round3([pos.x, pos.y, pos.z]), rot: round3([e.x, e.y, e.z].map(THREE.MathUtils.radToDeg) as V3) };
}

/**
 * `count` copies of a part spread evenly along round `roundB` of item B,
 * standing on the fabric (their bottom on the stitches, facing outwards).
 */
export function spreadAlong(part: Part, data: RenderData, scale: number, b: { part: Part; data: RenderData; item: WorkItem }, roundB: number, count: number): WorkItem[] {
  const ring = b.data.rings.get(roundB);
  if (!ring || ring.length < 2 || count < 1) return [];
  const wb = worldMatrix(b.part, b.data, b.item);
  const pts = ring.map((p) => new THREE.Vector3(...p));
  const closed = pts[0].distanceTo(pts[pts.length - 1]) < 1e-6;
  // Arc-length positions along the round.
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const L = acc[acc.length - 1];
  const nearest = (p: THREE.Vector3) => {
    let best = b.data.placements[0], d = Infinity;
    for (const pl of b.data.placements) {
      if (pl.roundNo !== roundB) continue;
      const dd = p.distanceToSquared(new THREE.Vector3(...pl.pos));
      if (dd < d) { d = dd; best = pl; }
    }
    return best;
  };
  const out: WorkItem[] = [];
  for (let k = 0; k < count; k++) {
    const t = closed ? (k / count) * L : count === 1 ? L / 2 : (k / (count - 1)) * L * 0.96 + L * 0.02;
    let i = 1;
    while (i < acc.length - 1 && acc[i] < t) i++;
    const f = (t - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1]);
    const p = pts[i - 1].clone().lerp(pts[i], f);
    const pl = nearest(p);
    const up = new THREE.Vector3(...pl.normal);
    // Faces outward from the work the way the stitch faces; flat pieces face the viewer.
    if (b.data.doubleSided && up.z < 0) up.negate();
    const wp = p.applyMatrix4(wb);
    const wn = up.transformDirection(wb);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), wn);
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    void data;
    out.push({ id: newId('item'), partId: part.id, pos: round3([wp.x, wp.y, wp.z]), rot: round3([e.x, e.y, e.z].map(THREE.MathUtils.radToDeg) as V3), scale });
  }
  return out;
}

const round3 = (v: V3): V3 => v.map((x) => Math.round(x * 1000) / 1000) as V3;

/* ---------- default layout ---------- */

/**
 * Items for a work that has never been arranged: the parts side by side, or a
 * designed arrangement for the built-in examples.
 */
export function defaultItems(work: Work, parts: Record<string, Part>, yarn: boolean): WorkItem[] {
  const list = work.partIds.map((id) => parts[id]).filter(Boolean);
  const item = (partId: string, pos: V3, rot: V3 = [0, 0, 0], scale = 1, mirror = false): WorkItem => ({ id: newId('item'), partId, pos, rot, scale, ...(mirror ? { mirror } : {}) });
  const preset = PRESETS[work.id]?.(parts, yarn, item);
  if (preset) return preset;
  let x = 0;
  const sizes = list.map((p) => { const d = partData(p, yarn); return d ? frameSize(d) : 6; });
  const total = sizes.reduce((a, b) => a + b, 0) + (list.length - 1) * 2;
  x = -total / 2;
  return list.map((p, i) => {
    const it = item(p.id, [x + sizes[i] / 2, 0, 0]);
    x += sizes[i] + 2;
    return it;
  });
}

type ItemFn = (partId: string, pos: V3, rot?: V3, scale?: number, mirror?: boolean) => WorkItem;
const PRESETS: Record<string, (parts: Record<string, Part>, yarn: boolean, item: ItemFn) => WorkItem[] | null> = {
  'sample-work-pumpkin': (parts, yarn, item) => {
    const head = parts['sample-head'], hat = parts['sample-hat'], stem = parts['sample-stem'];
    if (!head || !hat || !stem) return null;
    const hd = partData(head, yarn), sd = partData(stem, yarn), td = partData(hat, yarn);
    if (!hd || !sd || !td) return null;
    const h = item(head.id, [0, 0, 0]);
    const top = hd.maxY - hd.minY;
    const s = item(stem.id, [0, top - 0.6, 0]);
    // The hat sits tilted on top, its opening on the head.
    const t = item(hat.id, [0.8, top - 1.6, 0], [0, 0, -12]);
    return [h, s, t];
  },
  'sample-work-cake': (parts, yarn, item) => {
    const cake = parts['sample-cake'], cherry = parts['sample-cherry'];
    if (!cake || !cherry) return null;
    const cd = partData(cake, yarn), rd = partData(cherry, yarn);
    if (!cd || !rd) return null;
    // Lay the collar flat, then a cherry on every cream peak (round 5).
    const base = item(cake.id, [0, 0, 0], [-90, 0, 0]);
    const cherries = spreadAlong(cherry, rd, 0.9, { part: cake, data: cd, item: base }, 5, 16);
    return [base, ...cherries];
  },
  'sample-work-tart': (parts, yarn, item) => {
    const ids = ['sample-tart-crust', 'sample-tart-top', 'sample-tart-small', 'sample-tart-matcha', 'sample-tart-big', 'sample-tart-calyx'] as const;
    if (ids.some((id) => !parts[id])) return null;
    const [crust, top, small, matcha, big, calyx] = ids.map((id) => parts[id]);
    const [cd, td, sd, md, bd, kd] = [crust, top, small, matcha, big, calyx].map((p) => partData(p, yarn));
    if (!cd || !td || !sd || !md || !bd || !kd) return null;
    const h = (d: RenderData) => d.maxY - d.minY;
    // The crust is the cup; the white top is sewn to its R8, a little below the rim.
    const out: WorkItem[] = [item(crust.id, [0, 0, 0])];
    const r8 = roundFrame(cd, 8);
    const r9 = roundFrame(cd, 9);
    // The cream fills the cup up to about the rim (R9), as in the photo.
    const seam = r9 ? r9.center.y - cd.minY - 0.6 : r8 ? r8.center.y - cd.minY : h(cd) * 0.7;
    // Sewn inside the wall, so a touch smaller than the round it is sewn to.
    const topScale = r8 ? Math.min(1, (r8.radius * 0.9) / Math.max(1, roundFrame(td, Math.max(...td.rings.keys()))?.radius ?? r8.radius)) : 0.9;
    const topItem = item(top.id, [0, seam + 0.3, 0], [0, 0, 0], topScale);
    out.push(topItem);
    // Five small strawberries in a ring on the cream, opening down.
    // Inside the ring of cream puffs, so the puffs show around them as in the photo.
    const ringR = r8 ? r8.radius * 0.4 : 3.5;
    const disc = seam + 0.8;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3;
      out.push(item(small.id, [Math.cos(a) * ringR, disc + h(sd) * 0.8 * 0.95, Math.sin(a) * ringR], [180, 0, 0], 0.8));
    }
    // The matcha cream rolled up in the middle, the big strawberry and its calyx on top.
    // Rolled matcha cream sits on the small strawberries, smaller than the ring they make.
    const mScale = Math.min(1, ((r8 ? r8.radius : 6) * 0.62) / Math.max(1, md.radius));
    out.push(item(matcha.id, [0, disc + h(sd) * 0.55, 0], [0, 0, 0], mScale));
    const mTop = disc + h(sd) * 0.55 + h(md) * mScale;
    out.push(item(big.id, [0, mTop - 0.8, 0]));
    out.push(item(calyx.id, [0, mTop - 0.8 + h(bd) - 0.15, 0], [0, 0, 0], 0.9));
    return out;
  },
  'sample-work-burger': (parts, yarn, item) => {
    const ids = ['sample-burger-base', 'sample-burger-ketchup', 'sample-burger-lettuce', 'sample-burger-cheese', 'sample-burger-tomato', 'sample-burger-tie'];
    if (ids.some((id) => !parts[id])) return null;
    const bd = partData(parts['sample-burger-base'], yarn);
    if (!bd) return null;
    // The base stands up; each edging lies on the row whose front loops it was worked into.
    const out: WorkItem[] = [item(ids[0], [0, 0, 0])];
    const rowY = (no: number) => {
      const f = roundFrame(bd, no);
      return f ? f.center.y - bd.minY : no * 2;
    };
    out.push(item(ids[1], [0, rowY(2) - 0.6, 0.9], [0, 0, 0], 0.72));
    out.push(item(ids[2], [0, rowY(3) - 0.4, 1.3], [0, 0, 0], 0.74));
    out.push(item(ids[3], [0, rowY(4) - 0.6, 1.0], [0, 0, 0], 0.76));
    // Two tomato slices hang from the tie at the front.
    out.push(item(ids[4], [-4.2, -9.5, 2.4], [90, 0, 0]));
    out.push(item(ids[4], [4.2, -9.5, 2.4], [90, 0, 0]));
    out.push(item(ids[5], [0, -0.6, 0.6], [0, 0, 0], 0.62));
    return out;
  },
};
