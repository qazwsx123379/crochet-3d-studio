import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, OrbitControls, TransformControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Accessory, AccessoryKind, Part, V3, WorkItem } from '../types';
import type { RenderData } from './render';
import { Studio, Surface, Yarn } from './Preview3D';
import { baseMatrix, itemMatrix } from './assembly';

export type Selection = { kind: 'item' | 'acc'; id: string } | null;
export type GizmoMode = 'translate' | 'rotate' | 'scale';

interface Props {
  items: WorkItem[];
  accessories: Accessory[];
  parts: Record<string, Part>;
  dataOf: (part: Part) => RenderData | null;
  yarn: boolean;
  selected: Selection;
  mode: GizmoMode;
  /** An accessory waiting to be placed with the next click on a part. */
  placing: AccessoryKind | null;
  view: { name: 'front' | 'side' | 'top'; n: number };
  /** Changes when the camera should re-frame everything. */
  fitKey: string;
  onSelect: (s: Selection) => void;
  onItemMove: (id: string, patch: Pick<WorkItem, 'pos' | 'rot' | 'scale'>) => void;
  onAccMove: (id: string, patch: Pick<Accessory, 'pos'>) => void;
  onPlace: (pos: V3, normal: V3) => void;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Exact bounds of a part's surface, cached per render data. */
const boxes = new WeakMap<RenderData, THREE.Box3>();
function dataBox(d: RenderData): THREE.Box3 {
  let b = boxes.get(d);
  if (!b) {
    b = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < d.positions.length; i += 3) b.expandByPoint(v.set(d.positions[i], d.positions[i + 1], d.positions[i + 2]));
    boxes.set(d, b);
  }
  return b;
}

/* ---------- accessories ---------- */

const accQuat = (a: Accessory) => {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...a.normal).normalize());
  return q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(a.spin)));
};

export function AccessoryMesh({ a }: { a: Accessory }) {
  const s = a.size;
  const mouth = useMemo(() => {
    if (a.kind !== 'mouth') return null;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.6, 0.15, 0), new THREE.Vector3(0, -0.45, 0.05), new THREE.Vector3(0.6, 0.15, 0));
    return new THREE.TubeGeometry(curve, 24, 0.07, 8, false);
  }, [a.kind]);
  useEffect(() => () => mouth?.dispose(), [mouth]);
  switch (a.kind) {
    case 'eye':
      return (
        <group scale={s}>
          <mesh scale={[0.5, 0.5, 0.32]}><sphereGeometry args={[1, 24, 16]} /><meshPhysicalMaterial color={a.color} roughness={0.08} clearcoat={1} clearcoatRoughness={0.05} /></mesh>
          <mesh position={[0.16, 0.17, 0.29]} scale={[0.1, 0.1, 0.04]}><sphereGeometry args={[1, 12, 8]} /><meshBasicMaterial color="#ffffff" /></mesh>
        </group>
      );
    case 'nose':
      return (
        <group scale={s}>
          <mesh rotation={[Math.PI / 2, 0, Math.PI]} scale={[0.45, 0.3, 0.32]} position={[0, 0, 0.12]}><coneGeometry args={[1, 1, 3, 1]} /><meshPhysicalMaterial color={a.color} roughness={0.25} clearcoat={0.6} /></mesh>
        </group>
      );
    case 'mouth':
      return <mesh scale={s} geometry={mouth!}><meshStandardMaterial color={a.color} roughness={0.9} /></mesh>;
    case 'blush':
      return <mesh scale={[s * 0.55, s * 0.35, 1]} position={[0, 0, 0.04]}><circleGeometry args={[1, 24]} /><meshBasicMaterial color={a.color} transparent opacity={0.55} depthWrite={false} /></mesh>;
    case 'bow':
      return (
        <group scale={s}>
          {[-1, 1].map((d) => <mesh key={d} position={[d * 0.42, 0, 0.1]} rotation={[0, 0, (d * Math.PI) / 2]} scale={[0.36, 0.5, 0.16]}><coneGeometry args={[1, 1, 16]} /><meshStandardMaterial color={a.color} roughness={0.7} /></mesh>)}
          <mesh position={[0, 0, 0.14]} scale={[0.17, 0.17, 0.12]}><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color={a.color} roughness={0.7} /></mesh>
        </group>
      );
    case 'button':
      return (
        <group scale={s}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.06]} scale={[0.45, 0.12, 0.45]}><cylinderGeometry args={[1, 1, 1, 24]} /><meshPhysicalMaterial color={a.color} roughness={0.3} clearcoat={0.5} /></mesh>
          {[-1, 1].map((d) => <mesh key={d} position={[d * 0.12, 0, 0.125]}><circleGeometry args={[0.06, 10]} /><meshBasicMaterial color="#222" /></mesh>)}
        </group>
      );
  }
}

/* ---------- camera ---------- */

function CameraRig({ bounds, view, fitKey }: { bounds: THREE.Sphere; view: Props['view']; fitKey: string }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: OrbitControlsImpl | null };
  const place = (name: Props['view']['name'] | 'start') => {
    if (!controls) return;
    const v = THREE.MathUtils.degToRad(camera.fov) / 2;
    const h = Math.atan(Math.tan(v) * camera.aspect);
    const d = (Math.max(1, bounds.radius) * 0.95) / Math.sin(Math.min(v, h));
    const dir = name === 'front' ? [0, 0.05, 1] : name === 'side' ? [1, 0.05, 0] : name === 'top' ? [0, 1, 0.001] : [0.5, 0.45, 1];
    const off = new THREE.Vector3(...dir).normalize().multiplyScalar(d);
    camera.position.copy(bounds.center).add(off);
    camera.near = Math.max(0.01, d / 100);
    camera.far = d * 20;
    camera.updateProjectionMatrix();
    controls.target.copy(bounds.center);
    controls.update();
  };
  useEffect(() => { place('start'); }, [fitKey, controls]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (view.n > 0) place(view.name); }, [view.n]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/* ---------- scene ---------- */

function PartNode({ item, part, data, yarn, register, onClick }: { item: WorkItem; part: Part; data: RenderData; yarn: boolean; register: (o: THREE.Object3D | null) => void; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const base = useMemo(() => baseMatrix(part, data), [part, data]);
  return (
    <group ref={register} position={item.pos} rotation={item.rot.map(THREE.MathUtils.degToRad) as V3} scale={item.scale} onClick={onClick}>
      <group scale={[item.mirror ? -1 : 1, 1, 1]}>
        <group matrixAutoUpdate={false} matrix={base}>
          <Surface data={data} yarn={yarn} />
          {yarn && <Yarn placements={data.placements} />}
        </group>
      </group>
    </group>
  );
}

export default function AssemblyScene(p: Props) {
  const objects = useRef(new Map<string, THREE.Object3D>());
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  const dragging = useRef(false);

  // Bounds of everything, for framing and the floor shadow.
  const bounds = useMemo(() => {
    const box = new THREE.Box3();
    for (const it of p.items) {
      const part = p.parts[it.partId];
      const data = part && p.dataOf(part);
      if (!part || !data) continue;
      const m = itemMatrix(it).multiply(baseMatrix(part, data));
      box.union(dataBox(data).clone().applyMatrix4(m));
    }
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(10, 10, 10));
    return { sphere: box.getBoundingSphere(new THREE.Sphere()), minY: box.min.y };
  }, [p.items, p.parts, p.dataOf]);

  const selKey = p.selected ? `${p.selected.kind}:${p.selected.id}` : '';
  useEffect(() => { setTarget(selKey ? objects.current.get(selKey) ?? null : null); }, [selKey, p.items, p.accessories]);

  const clickPart = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4 || dragging.current) return;
    e.stopPropagation();
    if (p.placing && e.face) {
      // Surface normal in world space (instanced yarn adds its own instance matrix).
      const n = e.face.normal.clone();
      const m = new THREE.Matrix4();
      if (e.instanceId !== undefined && (e.object as THREE.InstancedMesh).isInstancedMesh) (e.object as THREE.InstancedMesh).getMatrixAt(e.instanceId, m);
      const world = e.object.matrixWorld.clone().multiply(m);
      n.transformDirection(world);
      // Face towards the camera side so accessories sit on the outside.
      if (n.dot(e.ray.direction) > 0) n.negate();
      p.onPlace([r3(e.point.x), r3(e.point.y), r3(e.point.z)], [r3(n.x), r3(n.y), r3(n.z)]);
      return;
    }
    p.onSelect({ kind: 'item', id });
  };

  const commit = () => {
    const o = target;
    if (!o || !p.selected) return;
    if (p.selected.kind === 'item') {
      const it = p.items.find((x) => x.id === p.selected!.id);
      if (!it) return;
      // Keep scale uniform: take the axis that moved the most.
      const sc = [o.scale.x, o.scale.y, o.scale.z];
      const s = sc.reduce((best, v) => (Math.abs(v - it.scale) > Math.abs(best - it.scale) ? v : best), it.scale);
      o.scale.setScalar(Math.abs(s));
      p.onItemMove(it.id, {
        pos: [r3(o.position.x), r3(o.position.y), r3(o.position.z)],
        rot: [o.rotation.x, o.rotation.y, o.rotation.z].map((v) => r3(THREE.MathUtils.radToDeg(v))) as V3,
        scale: r3(Math.max(0.05, Math.abs(s))),
      });
    } else p.onAccMove(p.selected.id, { pos: [r3(o.position.x), r3(o.position.y), r3(o.position.z)] });
  };

  return (
    <Canvas frameloop="demand" camera={{ fov: 32, position: [10, 8, 18] }} gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.85 }} dpr={[1, 2]}
      onPointerMissed={(e) => { if (e.type === 'click' && !dragging.current && !p.placing) p.onSelect(null); }}
      style={{ cursor: p.placing ? 'crosshair' : 'default' }}>
      <Studio />
      <hemisphereLight args={['#ffffff', '#cfc8bd', 0.55]} />
      <directionalLight position={[5, 9, 7]} intensity={1.3} />
      <directionalLight position={[-7, 2, -5]} intensity={0.35} />
      {p.items.map((it) => {
        const part = p.parts[it.partId];
        const data = part && p.dataOf(part);
        if (!part || !data) return null;
        return <PartNode key={it.id} item={it} part={part} data={data} yarn={p.yarn} onClick={clickPart(it.id)}
          register={(o) => { if (o) objects.current.set(`item:${it.id}`, o); else objects.current.delete(`item:${it.id}`); }} />;
      })}
      {p.accessories.map((a) => (
        <group key={a.id} position={a.pos} quaternion={accQuat(a)}
          ref={(o) => { if (o) objects.current.set(`acc:${a.id}`, o); else objects.current.delete(`acc:${a.id}`); }}
          onClick={(e) => { if (e.delta > 4 || p.placing) return; e.stopPropagation(); p.onSelect({ kind: 'acc', id: a.id }); }}>
          <AccessoryMesh a={a} />
        </group>
      ))}
      {target && (
        <TransformControls object={target} mode={p.selected?.kind === 'acc' ? 'translate' : p.mode} size={0.75}
          onMouseDown={() => { dragging.current = true; }}
          onMouseUp={() => { commit(); setTimeout(() => { dragging.current = false; }, 0); }} />
      )}
      <ContactShadows position={[bounds.sphere.center.x, bounds.minY - 0.05, bounds.sphere.center.z]} scale={bounds.sphere.radius * 3} blur={2.6} far={bounds.sphere.radius * 2} opacity={0.4} resolution={512} frames={1} key={`${p.fitKey}-${bounds.minY.toFixed(2)}-${p.items.length}`} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} />
      <CameraRig bounds={bounds.sphere} view={p.view} fitKey={p.fitKey} />
    </Canvas>
  );
}
