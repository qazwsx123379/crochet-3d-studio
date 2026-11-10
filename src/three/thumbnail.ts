/**
 * Library thumbnails rendered with the same yarn and lighting as the 3D view,
 * on one shared off-screen renderer. Requests are queued and drawn one at a
 * time while the browser is idle, and cached by part and edit time.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Part } from '../types';
import { analyze } from '../pattern/analyze';
import { roundHexes } from '../pattern/colors';
import { prepareRender, type RenderData } from './render';
import { yarnGeometries, yarnKind, yarnMaterial, yarnMatrix, type YarnKind } from './yarn';
import type { Placement } from './geometry';

const SIZE = 360;
const cache = new Map<string, string>();
const queue: { key: string; part: Part; resolve: (url: string) => void }[] = [];
let running = false;

let ctx: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; material: THREE.Material; shadow: THREE.Mesh } | null = null;

function setup() {
  if (ctx) return ctx;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  scene.add(new THREE.HemisphereLight('#ffffff', '#cfc8bd', 0.55));
  const key = new THREE.DirectionalLight('#ffffff', 1.3);
  key.position.set(5, 9, 7);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#ffffff', 0.35);
  fill.position.set(-7, 2, -5);
  scene.add(fill);
  // A soft round shadow under the part.
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.30)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  ctx = { renderer, scene, camera: new THREE.PerspectiveCamera(30, 1, 0.1, 1000), material: yarnMaterial(), shadow };
  return ctx;
}

function buildGroup(data: RenderData, yarn: boolean, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  if (data.index) { geo.setIndex(new THREE.BufferAttribute(data.index, 1)); geo.computeVertexNormals(); }
  else if (data.normals) geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  const surfaceMat = yarn
    ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })
    : new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.85, sheen: 0.6, sheenRoughness: 0.8, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(geo, surfaceMat));
  if (yarn) {
    const by = new Map<YarnKind, Placement[]>();
    for (const p of data.placements) { const k = yarnKind(p.shape, p.height); by.set(k, [...(by.get(k) ?? []), p]); }
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    for (const [kind, list] of by) {
      const mesh = new THREE.InstancedMesh(yarnGeometries()[kind], material, list.length);
      list.forEach((p, i) => { yarnMatrix(p, m); mesh.setMatrixAt(i, m); mesh.setColorAt(i, col.set(p.hex)); });
      group.add(mesh);
    }
  }
  return group;
}

function render(part: Part): string {
  const c = setup();
  const a = analyze(part.rows, part.settings);
  const rounds = a.rounds.filter((r) => r.stitches.length && r.status !== 'syntax' && r.status !== 'empty').map((info) => ({ info, hexes: roundHexes(part, info) }));
  const total = rounds.reduce((n, r) => n + r.info.stitches.length, 0);
  const yarn = total <= 3000;
  const data = prepareRender(rounds, { method: part.settings.method, start: part.settings.start, stuffed: true, roll: !!part.settings.roll }, yarn);
  if (!data) return '';
  const group = buildGroup(data, yarn, c.material);
  if (part.settings.flip) { group.rotation.x = Math.PI; group.position.y = data.center[1] * 2; }
  c.scene.add(group);
  const [cx, cy, cz] = data.center;
  const floor = (part.settings.flip ? 2 * cy - data.maxY : data.minY) - 0.02;
  c.shadow.position.set(cx, floor, cz);
  c.shadow.scale.set(data.radius * 1.9, data.radius * 1.4, 1);
  const d = (data.radius * 1.02) / Math.sin(THREE.MathUtils.degToRad(c.camera.fov) / 2);
  const dir = new THREE.Vector3(0.55, 0.42, 1).normalize().multiplyScalar(d);
  c.camera.position.set(cx + dir.x, cy + dir.y, cz + dir.z);
  c.camera.near = d / 100;
  c.camera.far = d * 10;
  c.camera.updateProjectionMatrix();
  c.camera.lookAt(cx, cy, cz);
  c.renderer.render(c.scene, c.camera);
  const url = c.renderer.domElement.toDataURL('image/png');
  c.scene.remove(group);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    if (o instanceof THREE.InstancedMesh) o.dispose();
  });
  return url;
}

const idle = (fn: () => void) => ('requestIdleCallback' in window ? (window as Window & { requestIdleCallback: (f: () => void) => void }).requestIdleCallback(fn) : setTimeout(fn, 30));

function pump() {
  if (running) return;
  const job = queue.shift();
  if (!job) return;
  running = true;
  idle(() => {
    let url = '';
    try { url = cache.get(job.key) ?? render(job.part); } catch (e) { console.error(e); }
    if (url) cache.set(job.key, url);
    job.resolve(url);
    running = false;
    pump();
  });
}

/** PNG data URL of the part's 3D thumbnail ('' when there is nothing to draw or WebGL is unavailable). */
export function thumbnail(part: Part): Promise<string> {
  const key = `${part.id}@${part.updatedAt}@${JSON.stringify(part.settings)}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => { queue.push({ key, part, resolve }); pump(); });
}

export const cachedThumbnail = (part: Part) => cache.get(`${part.id}@${part.updatedAt}@${JSON.stringify(part.settings)}`);
