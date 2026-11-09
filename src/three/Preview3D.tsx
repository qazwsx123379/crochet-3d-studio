import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { BuiltShape, Placement } from './geometry';

export type ViewName = 'front' | 'side' | 'top';

export interface Pick { roundNo: number; index: number }

interface Props {
  shape: BuiltShape | null;
  flip: boolean;
  texture: boolean;
  autoRotate: boolean;
  selected: Pick | null;
  accent: string;
  /** Changes whenever a view button is pressed. */
  view: { name: ViewName; n: number };
  /** Changes when the camera should re-frame the part (another part opened). */
  fitKey: string;
  onPick: (p: Pick) => void;
}

/* ---------- stitch shapes (unit size: 1 wide, 1 tall, facing +z) ---------- */

function legGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const g = new THREE.SphereGeometry(0.5, 10, 7);
    g.scale(0.44, 1.02, 0.46);
    g.rotateZ(side * -0.5);
    g.translate(side * 0.22, 0.02, 0);
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}
const LEG = legGeometry();
const BUMP = (() => { const g = new THREE.SphereGeometry(0.5, 12, 9); g.scale(0.95, 0.9, 0.9); return g; })();
const SMALL = (() => { const g = new THREE.SphereGeometry(0.5, 8, 6); g.scale(0.55, 0.4, 0.45); return g; })();

function placementMatrix(p: Placement, kind: 'leg' | 'bump' | 'small', m: THREE.Matrix4) {
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...p.tangent), new THREE.Vector3(...p.up), new THREE.Vector3(...p.normal));
  const depth = Math.min(p.width, p.height, 1);
  const s = kind === 'bump' ? new THREE.Vector3(p.width * 1.05, p.height * 0.95, depth) : new THREE.Vector3(p.width, p.height, depth);
  const lift = kind === 'bump' ? 0.32 : kind === 'small' ? 0.2 : 0.1;
  const offset = new THREE.Vector3(...p.normal).multiplyScalar(lift * depth);
  if (kind === 'small') offset.add(new THREE.Vector3(...p.up).multiplyScalar(p.height * 0.4));
  m.compose(new THREE.Vector3(...p.pos).add(offset), new THREE.Quaternion().setFromRotationMatrix(basis), s);
}

function Stitches({ placements, onPick }: { placements: Placement[]; onPick: (p: Pick) => void }) {
  const groups = useMemo(() => {
    const leg: Placement[] = [], bump: Placement[] = [], small: Placement[] = [];
    for (const p of placements) {
      if (p.shape === 'bump' || p.shape === 'loop') bump.push(p);
      else if (p.shape === 'picot' || p.shape === 'chain') small.push(p);
      else leg.push(p);
    }
    return [
      { kind: 'leg' as const, list: leg, geo: LEG },
      { kind: 'bump' as const, list: bump, geo: BUMP },
      { kind: 'small' as const, list: small, geo: SMALL },
    ];
  }, [placements]);
  return <>{groups.map((g) => g.list.length > 0 && <InstancedGroup key={g.kind + g.list.length} {...g} onPick={onPick} />)}</>;
}

function InstancedGroup({ kind, list, geo, onPick }: { kind: 'leg' | 'bump' | 'small'; list: Placement[]; geo: THREE.BufferGeometry; onPick: (p: Pick) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    list.forEach((p, i) => {
      placementMatrix(p, kind, m);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(p.hex));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [list, kind]);
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4 || e.instanceId === undefined) return;
    e.stopPropagation();
    const p = list[e.instanceId];
    onPick({ roundNo: p.roundNo, index: p.index });
  };
  return (
    <instancedMesh ref={ref} args={[geo, undefined, list.length]} onClick={click}>
      <meshStandardMaterial roughness={0.92} metalness={0} />
    </instancedMesh>
  );
}

/* ---------- base surface ---------- */

function Surface({ shape, texture, onPick }: { shape: BuiltShape; texture: boolean; onPick: (p: Pick) => void }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(shape.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(shape.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(shape.colors, 3));
    g.computeBoundingSphere();
    return g;
  }, [shape]);
  useEffect(() => () => geo.dispose(), [geo]);
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4 || e.faceIndex == null) return;
    e.stopPropagation();
    onPick({ roundNo: shape.faceRound[e.faceIndex], index: shape.faceStitch[e.faceIndex] });
  };
  // Under the stitch texture the surface reads as the shadowed gaps between stitches.
  return (
    <mesh geometry={geo} onClick={click}>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} side={THREE.DoubleSide} color={texture ? '#b4b4b4' : '#ffffff'} />
    </mesh>
  );
}

/* ---------- camera ---------- */

function CameraRig({ shape, view, fitKey }: { shape: BuiltShape | null; view: Props['view']; fitKey: string }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: OrbitControlsImpl | null };
  const fitDistance = (r: number) => {
    const v = THREE.MathUtils.degToRad(camera.fov) / 2;
    const h = Math.atan(Math.tan(v) * camera.aspect);
    return (r * 1.12) / Math.sin(Math.min(v, h));
  };
  const place = (name: ViewName | 'start') => {
    if (!shape || !controls) return;
    const [cx, cy, cz] = shape.center;
    const d = fitDistance(shape.radius);
    const dir = name === 'front' ? [0, 0.05, 1] : name === 'side' ? [1, 0.05, 0] : name === 'top' ? [0, 1, 0.001] : [0.55, 0.45, 1];
    const v = new THREE.Vector3(...dir).normalize().multiplyScalar(d);
    camera.position.set(cx + v.x, cy + v.y, cz + v.z);
    camera.near = Math.max(0.01, d / 100);
    camera.far = d * 20;
    camera.updateProjectionMatrix();
    controls.target.set(cx, cy, cz);
    controls.update();
  };
  useEffect(() => { place('start'); }, [fitKey, controls]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (view.n > 0) place(view.name); }, [view.n]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the part centred while it grows, without resetting the angle.
  const lastR = useRef(0);
  useEffect(() => {
    if (!shape || !controls) return;
    controls.target.set(...shape.center);
    if (lastR.current === 0 || Math.abs(shape.radius - lastR.current) / lastR.current > 0.35) {
      const d = fitDistance(shape.radius);
      const off = camera.position.clone().sub(controls.target).setLength(d);
      camera.position.copy(controls.target).add(off);
      camera.near = Math.max(0.01, d / 100);
      camera.far = d * 20;
      camera.updateProjectionMatrix();
    }
    lastR.current = shape.radius;
    controls.update();
  }, [shape, controls, camera]);
  return null;
}

export default function Preview3D({ shape, flip, texture, autoRotate, selected, accent, view, fitKey, onPick }: Props) {
  const ring = selected && shape ? shape.rings.get(selected.roundNo) : undefined;
  const marker = selected && shape ? shape.placements.find((p) => p.roundNo === selected.roundNo && p.index === selected.index) : undefined;
  return (
    <Canvas camera={{ fov: 35, position: [6, 5, 10] }} gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }} dpr={[1, 2]}>
      <hemisphereLight args={['#ffffff', '#d9d3ca', 1.55]} />
      <directionalLight position={[6, 10, 8]} intensity={1.5} />
      <directionalLight position={[-8, 3, -6]} intensity={0.45} />
      <group rotation={flip ? [Math.PI, 0, 0] : [0, 0, 0]} position={flip && shape ? [0, shape.center[1] * 2, 0] : [0, 0, 0]}>
      {shape && <Surface shape={shape} texture={texture} onPick={onPick} />}
      {shape && texture && <Stitches placements={shape.placements} onPick={onPick} />}
      {ring && <Line points={ring} color={accent} lineWidth={3} depthTest={false} renderOrder={10} />}
      {marker && (
        <mesh position={new THREE.Vector3(...marker.pos).add(new THREE.Vector3(...marker.normal).multiplyScalar(0.45))} renderOrder={11}>
          <sphereGeometry args={[Math.min(0.22, marker.width * 0.3), 16, 12]} />
          <meshBasicMaterial color={accent} depthTest={false} />
        </mesh>
      )}
      </group>
      <OrbitControls makeDefault autoRotate={autoRotate} autoRotateSpeed={1.6} enableDamping dampingFactor={0.12} />
      <CameraRig shape={shape} view={view} fitKey={fitKey} />
    </Canvas>
  );
}
