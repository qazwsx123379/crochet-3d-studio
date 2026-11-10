/**
 * Yarn-level stitch models. Each stitch is built from a few tubes following
 * the path real yarn takes (two legs and the loop on top, plus the wrap of a
 * tall stitch), in a unit box: x across the round (−0.5…0.5), y from the
 * stitch below to the top (−0.5…0.5), z out of the fabric. Instances are
 * scaled to each stitch's width and height. A procedural normal map gives the
 * tubes a twisted, plied look and the material has a soft fabric sheen.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StitchShape } from '../pattern/stitches';
import type { Placement } from './geometry';

const R = 0.215; // yarn radius relative to a stitch width (stitches touch, like real fabric)

function tube(points: [number, number, number][], radius = R, segments = 12, radial = 6): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  return new THREE.TubeGeometry(curve, segments, radius, radial, false);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  return g;
}

/** Single crochet and other short posts: two legs in a V and the loop across the top. */
function shortStitch(): THREE.BufferGeometry {
  return merge([
    tube([[-0.06, -0.52, 0.04], [-0.17, -0.15, 0.2], [-0.27, 0.18, 0.22], [-0.3, 0.36, 0.1]]),
    tube([[0.06, -0.52, 0.04], [0.17, -0.15, 0.2], [0.27, 0.18, 0.22], [0.3, 0.36, 0.1]]),
    tube([[-0.6, 0.36, 0.0], [-0.26, 0.46, 0.12], [0.26, 0.46, 0.12], [0.6, 0.36, 0.0]], R * 0.9),
  ]);
}

/** Double crochet and taller: longer legs, the diagonal wrap, the top loop. */
function tallStitch(): THREE.BufferGeometry {
  return merge([
    tube([[-0.05, -0.5, 0.06], [-0.18, -0.2, 0.18], [-0.26, 0.15, 0.2], [-0.34, 0.42, 0.1]], R * 0.85, 14),
    tube([[0.05, -0.5, 0.06], [0.18, -0.2, 0.18], [0.26, 0.15, 0.2], [0.34, 0.42, 0.1]], R * 0.85, 14),
    tube([[-0.34, -0.12, 0.12], [-0.05, -0.02, 0.3], [0.3, 0.1, 0.12]], R * 0.85, 10),
    tube([[-0.56, 0.4, 0.02], [-0.25, 0.48, 0.12], [0.25, 0.48, 0.12], [0.56, 0.4, 0.02]], R * 0.85),
  ]);
}

/** Bobble / popcorn / puff: several loops bulging out of the fabric. */
function bumpStitch(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.24, 0, 0.24]) parts.push(tube([[x * 0.4, -0.5, 0.05], [x * 1.4, -0.15, 0.42], [x * 1.4, 0.2, 0.46], [x * 0.5, 0.45, 0.12]], R * 0.95));
  parts.push(tube([[-0.5, 0.42, 0.02], [0, 0.52, 0.16], [0.5, 0.42, 0.02]], R * 0.9));
  return merge(parts);
}

/** Shell: five tall legs fanning out from one base. */
function fanStitch(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.44, -0.22, 0, 0.22, 0.44]) parts.push(tube([[0, -0.5, 0.05], [x * 0.5, -0.05, 0.16], [x, 0.4, 0.1]], R * 0.6, 10));
  return merge(parts);
}

/** A chain loop lying along the round. */
function chainStitch(): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(0.3, R * 0.9, 6, 16);
  g.scale(1.25, 0.75, 1);
  g.translate(0, 0.1, 0.1);
  return g;
}

/** Picot: a small upright ring. */
function picotStitch(): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(0.22, R * 0.8, 6, 14);
  g.translate(0, 0.45, 0.12);
  return g;
}

/** Slip stitch: a flat, low loop. */
function slipStitch(): THREE.BufferGeometry {
  return merge([tube([[-0.5, 0.0, 0.04], [-0.2, 0.12, 0.12], [0.2, 0.12, 0.12], [0.5, 0.0, 0.04]], R * 0.9)]);
}

/** Loop stitch: a loop hanging out of the fabric. */
function loopStitch(): THREE.BufferGeometry {
  const g = shortStitch();
  const loop = new THREE.TorusGeometry(0.3, R * 0.8, 6, 16);
  loop.rotateX(Math.PI / 2.5);
  loop.translate(0, -0.25, 0.42);
  return merge([g, loop]);
}

export type YarnKind = 'short' | 'tall' | 'bump' | 'fan' | 'chain' | 'picot' | 'slip' | 'loop';

export function yarnKind(shape: StitchShape, height: number): YarnKind {
  switch (shape) {
    case 'bump': return 'bump';
    case 'fan': return 'fan';
    case 'chain': return 'chain';
    case 'picot': return 'picot';
    case 'slip': return 'slip';
    case 'loop': return 'loop';
    default: return height > 1.6 ? 'tall' : 'short';
  }
}

let cache: Record<YarnKind, THREE.BufferGeometry> | null = null;
export function yarnGeometries(): Record<YarnKind, THREE.BufferGeometry> {
  cache ??= { short: shortStitch(), tall: tallStitch(), bump: bumpStitch(), fan: fanStitch(), chain: chainStitch(), picot: picotStitch(), slip: slipStitch(), loop: loopStitch() };
  return cache;
}

/** Normal map of twisted plies, tiled along each tube. */
let twist: THREE.Texture | null = null;
export function twistNormalMap(): THREE.Texture {
  if (twist) return twist;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // u = x along the tube, v = y around it; 3 plies twisted diagonally.
      const phase = ((x / size) * 4 + (y / size) * 3) * Math.PI * 2;
      const fibre = Math.sin(((x / size) * 40 + (y / size) * 31) * Math.PI * 2) * 0.12;
      const nx = Math.cos(phase) * 0.55 + fibre;
      const ny = Math.sin(phase) * 0.35;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  twist = new THREE.CanvasTexture(canvas);
  twist.wrapS = twist.wrapT = THREE.RepeatWrapping;
  twist.repeat.set(3, 1);
  twist.colorSpace = THREE.NoColorSpace;
  return twist;
}

export function yarnMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    roughness: 0.88,
    metalness: 0,
    sheen: 0.45,
    sheenRoughness: 0.9,
    sheenColor: new THREE.Color('#9a9a9a'),
    normalMap: twistNormalMap(),
    normalScale: new THREE.Vector2(0.9, 0.9),
  });
}

const tmpBasis = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
/** Instance matrix that fits a unit stitch model onto one stitch of the fabric. */
export function yarnMatrix(p: Placement, m: THREE.Matrix4) {
  tmpBasis.makeBasis(new THREE.Vector3(...p.tangent), new THREE.Vector3(...p.up), new THREE.Vector3(...p.normal));
  tmpQ.setFromRotationMatrix(tmpBasis);
  const w = Math.max(0.3, p.width);
  // Depth follows the width so the yarn keeps a round cross-section; a little
  // extra height lets each stitch tuck into the one below, as real fabric does.
  const pos = new THREE.Vector3(...p.pos).addScaledVector(new THREE.Vector3(...p.normal), 0.04 * w);
  m.compose(pos, tmpQ, new THREE.Vector3(w * 1.06, Math.max(0.3, p.height) * 1.22, w));
}
