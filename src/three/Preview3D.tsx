import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Line, OrbitControls } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Placement } from './geometry';
import type { RenderData } from './render';
import { yarnGeometries, yarnKind, yarnMaterial, yarnMatrix, type YarnKind } from './yarn';

export type ViewName = 'front' | 'side' | 'top';

export interface Pick { roundNo: number; index: number }

interface Props {
  data: RenderData | null;
  flip: boolean;
  /** Draw every stitch as yarn (off = the smooth, faster surface). */
  yarn: boolean;
  autoRotate: boolean;
  selected: Pick | null;
  accent: string;
  /** Changes whenever a view button is pressed. */
  view: { name: ViewName; n: number };
  /** Changes when the camera should re-frame the part (another part opened). */
  fitKey: string;
  onPick: (p: Pick) => void;
}

/* ---------- lighting: a soft studio environment, no downloads ---------- */

export function Studio() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.5;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
}

/* ---------- yarn ---------- */

export function Yarn({ placements, onPick }: { placements: Placement[]; onPick?: (p: Pick) => void }) {
  const groups = useMemo(() => {
    const by = new Map<YarnKind, Placement[]>();
    for (const p of placements) {
      const k = yarnKind(p.shape, p.height);
      by.set(k, [...(by.get(k) ?? []), p]);
    }
    return [...by.entries()];
  }, [placements]);
  const material = useMemo(() => yarnMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);
  return <>{groups.map(([kind, list]) => <YarnGroup key={kind + list.length} kind={kind} list={list} material={material} onPick={onPick} />)}</>;
}

function YarnGroup({ kind, list, material, onPick }: { kind: YarnKind; list: Placement[]; material: THREE.Material; onPick?: (p: Pick) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    list.forEach((p, i) => { yarnMatrix(p, m); mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.set(p.hex)); });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [list]);
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!onPick || e.delta > 4 || e.instanceId === undefined) return;
    e.stopPropagation();
    const p = list[e.instanceId];
    onPick({ roundNo: p.roundNo, index: p.index });
  };
  return <instancedMesh ref={ref} args={[yarnGeometries()[kind], material, list.length]} onClick={onPick ? click : undefined} />;
}

/* ---------- the fill surface ---------- */

export function Surface({ data, yarn, onPick }: { data: RenderData; yarn: boolean; onPick?: (p: Pick) => void }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    if (data.index) { g.setIndex(new THREE.BufferAttribute(data.index, 1)); g.computeVertexNormals(); }
    else if (data.normals) g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    g.computeBoundingSphere();
    return g;
  }, [data]);
  useEffect(() => () => geo.dispose(), [geo]);
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!onPick || e.delta > 4 || e.faceIndex == null) return;
    e.stopPropagation();
    onPick({ roundNo: data.faceRound[e.faceIndex], index: data.faceStitch[e.faceIndex] });
  };
  return (
    <mesh geometry={geo} onClick={onPick ? click : undefined}>
      {yarn
        ? <meshStandardMaterial vertexColors roughness={1} metalness={0} side={THREE.DoubleSide} />
        : <meshPhysicalMaterial vertexColors roughness={0.85} metalness={0} sheen={0.6} sheenRoughness={0.8} sheenColor="#ffffff" side={THREE.DoubleSide} />}
    </mesh>
  );
}

/* ---------- camera ---------- */

function CameraRig({ data, view, fitKey }: { data: RenderData | null; view: Props['view']; fitKey: string }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: OrbitControlsImpl | null };
  const fitDistance = (r: number) => {
    const v = THREE.MathUtils.degToRad(camera.fov) / 2;
    const h = Math.atan(Math.tan(v) * camera.aspect);
    return (r * 1.12) / Math.sin(Math.min(v, h));
  };
  const setRange = (d: number) => { camera.near = Math.max(0.01, d / 100); camera.far = d * 20; camera.updateProjectionMatrix(); };
  const place = (name: ViewName | 'start') => {
    if (!data || !controls) return;
    const [cx, cy, cz] = data.center;
    const d = fitDistance(data.radius);
    const dir = name === 'front' ? [0, 0.05, 1] : name === 'side' ? [1, 0.05, 0] : name === 'top' ? [0, 1, 0.001] : [0.55, 0.4, 1];
    const v = new THREE.Vector3(...dir).normalize().multiplyScalar(d);
    camera.position.set(cx + v.x, cy + v.y, cz + v.z);
    setRange(d);
    controls.target.set(cx, cy, cz);
    controls.update();
  };
  useEffect(() => { place('start'); }, [fitKey, controls]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (view.n > 0) place(view.name); }, [view.n]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the part centred while it grows, without resetting the angle.
  const lastR = useRef(0);
  useEffect(() => {
    if (!data || !controls) return;
    controls.target.set(...data.center);
    if (lastR.current === 0 || Math.abs(data.radius - lastR.current) / lastR.current > 0.35) {
      const d = fitDistance(data.radius);
      const off = camera.position.clone().sub(controls.target).setLength(d);
      camera.position.copy(controls.target).add(off);
      setRange(d);
    }
    lastR.current = data.radius;
    controls.update();
  }, [data, controls, camera]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function Preview3D({ data, flip, yarn, autoRotate, selected, accent, view, fitKey, onPick }: Props) {
  const ring = selected && data ? data.rings.get(selected.roundNo) : undefined;
  const marker = selected && data ? data.placements.find((p) => p.roundNo === selected.roundNo && p.index === selected.index) : undefined;
  const floor = data ? (flip ? 2 * data.center[1] - data.maxY : data.minY) - 0.02 : 0;
  const stitches = data?.placements.length ?? 0;
  return (
    <Canvas frameloop={autoRotate ? 'always' : 'demand'} camera={{ fov: 32, position: [6, 5, 10] }} gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.85 }} dpr={[1, 2]}>
      <Studio />
      <hemisphereLight args={['#ffffff', '#cfc8bd', 0.55]} />
      <directionalLight position={[5, 9, 7]} intensity={1.3} />
      <directionalLight position={[-7, 2, -5]} intensity={0.35} />
      <group rotation={flip ? [Math.PI, 0, 0] : [0, 0, 0]} position={flip && data ? [0, data.center[1] * 2, 0] : [0, 0, 0]}>
        {data && <Surface data={data} yarn={yarn} onPick={onPick} />}
        {data && yarn && <Yarn placements={data.placements} onPick={onPick} />}
        {ring && <Line points={ring} color={accent} lineWidth={3} depthTest={false} renderOrder={10} />}
        {marker && (
          <mesh position={new THREE.Vector3(...marker.pos).add(new THREE.Vector3(...marker.normal).multiplyScalar(0.45))} renderOrder={11}>
            <sphereGeometry args={[Math.min(0.22, marker.width * 0.3), 16, 12]} />
            <meshBasicMaterial color={accent} depthTest={false} />
          </mesh>
        )}
      </group>
      {data && stitches > 0 && (
        <ContactShadows position={[data.center[0], floor, data.center[2]]} scale={data.radius * 4} blur={2.6} far={data.radius * 2} opacity={0.42} resolution={512} frames={1} key={`${fitKey}-${stitches}-${flip}`} />
      )}
      <OrbitControls makeDefault autoRotate={autoRotate} autoRotateSpeed={1.6} enableDamping dampingFactor={0.12} />
      <CameraRig data={data} view={view} fitKey={fitKey} />
    </Canvas>
  );
}
