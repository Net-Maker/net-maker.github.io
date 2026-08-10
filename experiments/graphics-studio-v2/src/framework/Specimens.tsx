import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Group, InstancedMesh, Material, MeshPhysicalMaterial, PointsMaterial } from "three";
import type { ComponentType } from "react";
import type { RepresentationId } from "./types";

const ACTIVE_SCALE = 1.08;
const INACTIVE_SCALE = 0.9;
const TRANSITION_RATE = 6;
const ACTOR_ASSET = new URL(
  "../../../../static/assets/actor01-frame150.d3dg",
  import.meta.url,
).href;

class StudioCurve extends THREE.Curve<THREE.Vector3> {
  constructor() {
    super();
  }

  override getPoint(t: number, target = new THREE.Vector3()) {
    const p = 2;
    const q = 3;
    const angle = t * Math.PI * 2 * p;
    const phase = (q / p) * angle;
    const radius = 1.06 + 0.34 * Math.cos(phase);
    return target.set(
      radius * Math.cos(angle),
      radius * Math.sin(angle),
      0.44 * Math.sin(phase),
    );
  }
}

const curve = new StudioCurve();

function damp(current: number, target: number, delta: number) {
  return THREE.MathUtils.damp(current, target, TRANSITION_RATE, delta);
}

function setOpacity(object: THREE.Object3D, opacity: number) {
  object.traverse((child) => {
    const material = (child as THREE.Mesh).material as Material | Material[] | undefined;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((entry) => {
      if ("opacity" in entry) {
        entry.transparent = true;
        entry.opacity = opacity;
      }
    });
  });
}

function useRepresentationMotion(
  group: React.RefObject<Group | null>,
  active: boolean,
  visible: boolean,
) {
  const invalidate = useThree((state) => state.invalidate);

  useFrame((_, delta) => {
    const object = group.current;
    if (!object) return;
    const targetScale = active ? ACTIVE_SCALE : INACTIVE_SCALE;
    const targetOpacity = visible ? (active ? 1 : 0.2) : 0;
    if (object.userData.opacity === undefined) {
      object.scale.setScalar(targetScale);
      object.userData.opacity = targetOpacity;
      setOpacity(object, targetOpacity);
      return;
    }
    const nextScale = damp(object.scale.x, targetScale, delta);
    const nextOpacity = damp(object.userData.opacity, targetOpacity, delta);
    object.scale.setScalar(nextScale);
    object.userData.opacity = nextOpacity;
    setOpacity(object, nextOpacity);
    if (
      Math.abs(nextScale - targetScale) > 0.001 ||
      Math.abs(nextOpacity - targetOpacity) > 0.001
    ) {
      invalidate();
    }
  });
}

function SurfaceSpecimen({ active, visible }: { active: boolean; visible: boolean }) {
  const group = useRef<Group>(null);
  useRepresentationMotion(group, active, visible);

  return (
    <group ref={group} visible={visible} rotation={[0.55, 0.2, -0.4]}>
      <mesh>
        <torusKnotGeometry args={[1.1, 0.38, 320, 28, 2, 3]} />
        <meshPhysicalMaterial
          color="#c9d8d1"
          roughness={0.62}
          metalness={0}
          transmission={0}
          clearcoat={0.16}
          clearcoatRoughness={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function FieldSpecimen({ active, visible }: { active: boolean; visible: boolean }) {
  const group = useRef<Group>(null);
  const material = useRef<PointsMaterial>(null);
  useRepresentationMotion(group, active, visible);

  const geometry = useMemo(() => {
    const source = new THREE.TorusKnotGeometry(1.1, 0.38, 420, 34, 2, 3);
    const positions = source.attributes.position.array as Float32Array;
    const colors = new Float32Array(positions.length);
    const cobalt = new THREE.Color("#2457ff");
    const vermilion = new THREE.Color("#ff3b24");
    const color = new THREE.Color();
    const count = positions.length / 3;

    for (let index = 0; index < count; index += 1) {
      const x = positions[index * 3];
      const weight = THREE.MathUtils.clamp((x + 1.7) / 3.4, 0, 1);
      color.copy(cobalt).lerp(vermilion, weight);
      colors.set([color.r, color.g, color.b], index * 3);
    }

    source.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return source;
  }, []);

  return (
    <group ref={group} visible={visible} rotation={[0.55, 0.2, -0.4]}>
      <points geometry={geometry}>
        <pointsMaterial
          ref={material}
          size={0.03}
          sizeAttenuation
          vertexColors
          depthWrite={false}
          transparent
        />
      </points>
    </group>
  );
}

function RigSpecimen({ active, visible }: { active: boolean; visible: boolean }) {
  const group = useRef<Group>(null);
  useRepresentationMotion(group, active, visible);

  const jointPositions = useMemo(() => {
    const points = curve.getSpacedPoints(42);
    return points.filter((_, index) => index % 4 === 0);
  }, []);

  const joints = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = joints.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    jointPositions.forEach((position, index) => {
      matrix.makeTranslation(position.x, position.y, position.z);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [jointPositions]);

  return (
    <group ref={group} visible={visible} rotation={[0.55, 0.2, -0.4]}>
      <mesh>
        <tubeGeometry args={[curve, 160, 0.018, 8, true]} />
        <meshBasicMaterial color="#77837e" transparent />
      </mesh>
      <instancedMesh ref={joints} args={[undefined, undefined, jointPositions.length]}>
        <sphereGeometry args={[0.06, 14, 10]} />
        <meshStandardMaterial color="#ff3b30" roughness={0.32} transparent />
      </instancedMesh>
    </group>
  );
}

function FrameSpecimen({ active, visible }: { active: boolean; visible: boolean }) {
  const group = useRef<Group>(null);
  useRepresentationMotion(group, active, visible);

  const { origins, lines } = useMemo(() => {
    const count = 16;
    const frames = curve.computeFrenetFrames(count, true);
    const points = curve.getSpacedPoints(count);
    const vertices: number[] = [];
    const colors: number[] = [];
    const axisColors = [
      new THREE.Color("#ff3b30"),
      new THREE.Color("#20a05a"),
      new THREE.Color("#2f6fff"),
    ];

    points.slice(0, -1).forEach((point, index) => {
      const axes = [
        frames.normals[index],
        frames.binormals[index],
        frames.tangents[index],
      ];
      axes.forEach((axis, axisIndex) => {
        vertices.push(...point.toArray(), ...point.clone().addScaledVector(axis, 0.23).toArray());
        const color = axisColors[axisIndex];
        colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      });
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return { origins: points.slice(0, -1), lines: geometry };
  }, []);

  const nodes = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = nodes.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    origins.forEach((position, index) => {
      matrix.makeTranslation(position.x, position.y, position.z);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [origins]);

  return (
    <group ref={group} visible={visible} rotation={[0.55, 0.2, -0.4]}>
      <lineSegments geometry={lines}>
        <lineBasicMaterial vertexColors transparent />
      </lineSegments>
      <instancedMesh ref={nodes} args={[undefined, undefined, origins.length]}>
        <sphereGeometry args={[0.046, 12, 8]} />
        <meshStandardMaterial color="#b9edc9" roughness={0.24} transparent />
      </instancedMesh>
    </group>
  );
}

export function RepresentationContinuum({ mode }: { mode: RepresentationId }) {
  return (
    <group position={[0, -0.08, 0]} scale={1.12}>
      <SurfaceSpecimen active={mode === "form"} visible={mode === "form"} />
      <FieldSpecimen active={mode === "field"} visible={mode === "field"} />
      <RigSpecimen active={mode === "rig"} visible={mode === "rig"} />
      <FrameSpecimen active={mode === "rig"} visible={mode === "rig"} />
    </group>
  );
}

interface D3DGAsset {
  positions: Float32Array;
  colors: Uint8Array;
  joints: Float32Array;
  edges: Uint16Array;
  axesPositions: Float32Array;
  axesRotations: Float32Array;
}

function parseD3DG(buffer: ArrayBuffer): D3DGAsset {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  const version = view.getUint32(4, true);
  if (magic !== "D3DG" || ![1, 2].includes(version)) {
    throw new Error("Unsupported D3DG asset");
  }
  const pointCount = view.getUint32(8, true);
  const jointCount = view.getUint32(12, true);
  const edgeCount = view.getUint32(16, true);
  const axesCount = version >= 2 ? view.getUint32(20, true) : 0;
  let offset = version >= 2 ? 24 : 20;
  const positions = new Float32Array(buffer, offset, pointCount * 3);
  offset += positions.byteLength;
  const colors = new Uint8Array(buffer, offset, pointCount * 3);
  offset = (offset + colors.byteLength + 3) & ~3;
  const joints = new Float32Array(buffer, offset, jointCount * 3);
  offset += joints.byteLength;
  const edges = new Uint16Array(buffer, offset, edgeCount * 2);
  offset += edges.byteLength;
  const axesPositions = new Float32Array(buffer, offset, axesCount * 3);
  offset += axesPositions.byteLength;
  const axesRotations = new Float32Array(buffer, offset, axesCount * 9);
  return { positions, colors, joints, edges, axesPositions, axesRotations };
}

class D3DGLoader extends THREE.Loader<D3DGAsset> {
  override load(
    url: string,
    onLoad: (data: D3DGAsset) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ) {
    const loader = new THREE.FileLoader(this.manager);
    loader.setResponseType("arraybuffer");
    loader.load(
      url,
      (data) => onLoad(parseD3DG(data as ArrayBuffer)),
      onProgress,
      onError,
    );
  }
}

export function GaussianimateScene() {
  const asset = useLoader(D3DGLoader, ACTOR_ASSET);
  const group = useRef<Group>(null);
  const joints = useRef<InstancedMesh>(null);

  const { cloudGeometry, skeletonGeometry, center, scale, jointList } = useMemo(() => {
    const cloud = new THREE.BufferGeometry();
    cloud.setAttribute("position", new THREE.BufferAttribute(asset.positions, 3));
    cloud.setAttribute("color", new THREE.BufferAttribute(asset.colors, 3, true));
    cloud.computeBoundingBox();
    const box = cloud.boundingBox!;
    const size = box.getSize(new THREE.Vector3());
    const pivot = box.getCenter(new THREE.Vector3());
    const linePositions: number[] = [];
    for (let index = 0; index < asset.edges.length; index += 2) {
      const first = asset.edges[index] * 3;
      const second = asset.edges[index + 1] * 3;
      linePositions.push(
        asset.joints[first],
        asset.joints[first + 1],
        asset.joints[first + 2],
        asset.joints[second],
        asset.joints[second + 1],
        asset.joints[second + 2],
      );
    }
    const skeleton = new THREE.BufferGeometry();
    skeleton.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
    const list = Array.from({ length: asset.joints.length / 3 }, (_, index) =>
      new THREE.Vector3().fromArray(asset.joints, index * 3),
    );
    return {
      cloudGeometry: cloud,
      skeletonGeometry: skeleton,
      center: pivot,
      scale: 4.6 / Math.max(size.y, 0.001),
      jointList: list,
    };
  }, [asset]);

  useLayoutEffect(() => {
    const mesh = joints.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    jointList.forEach((position, index) => {
      matrix.makeTranslation(position.x, position.y, position.z);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [jointList]);

  return (
    <group
      ref={group}
      scale={scale}
      position={center.clone().multiplyScalar(-scale)}
      rotation={[0, -0.24, 0]}
    >
      <points geometry={cloudGeometry}>
        <pointsMaterial
          size={0.022}
          vertexColors
          transparent
          opacity={0.7}
          depthWrite={false}
        />
      </points>
      <lineSegments geometry={skeletonGeometry} renderOrder={2}>
        <lineBasicMaterial color="#f8fafc" transparent opacity={0.9} depthTest={false} />
      </lineSegments>
      <instancedMesh
        ref={joints}
        args={[undefined, undefined, jointList.length]}
        renderOrder={3}
      >
        <sphereGeometry args={[0.022, 10, 8]} />
        <meshBasicMaterial color="#ff3b30" depthTest={false} />
      </instancedMesh>
    </group>
  );
}

export function GGAvatarScene() {
  return (
    <group rotation={[0.08, -0.35, 0]}>
      <mesh>
        <icosahedronGeometry args={[1.72, 12]} />
        <meshPhysicalMaterial
          color="#f2f5ff"
          roughness={0.18}
          transmission={0.72}
          thickness={0.8}
          ior={1.18}
          clearcoat={1}
        />
      </mesh>
      <points>
        <icosahedronGeometry args={[1.78, 7]} />
        <pointsMaterial color="#315cff" size={0.018} transparent opacity={0.36} />
      </points>
    </group>
  );
}

export function HashRFScene() {
  const points = useMemo(() => {
    const positions: number[] = [];
    for (let z = -7; z <= 7; z += 1) {
      for (let y = -7; y <= 7; y += 1) {
        for (let x = -7; x <= 7; x += 1) {
          const radius = Math.hypot(x, y, z);
          if (radius > 4.6 && radius < 7.2 && (x + y * 2 + z * 3) % 5 === 0) {
            positions.push(x * 0.22, y * 0.22, z * 0.22);
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }, []);

  return (
    <group rotation={[0.35, -0.55, 0.18]}>
      <points geometry={points}>
        <pointsMaterial color="#ff4a2f" size={0.055} transparent opacity={0.82} />
      </points>
      <mesh>
        <boxGeometry args={[3.4, 3.4, 3.4]} />
        <meshBasicMaterial color="#93a1ad" wireframe transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

export function ProjectSpecimen({
  active,
  Scene,
}: {
  active: boolean;
  Scene: ComponentType;
}) {
  const group = useRef<Group>(null);
  useRepresentationMotion(group, active, active);

  return (
    <group ref={group} visible={active} position={[0, -0.05, 0]} scale={0.001}>
      {active ? <Scene /> : null}
    </group>
  );
}

useLoader.preload(D3DGLoader, ACTOR_ASSET);
