import { Suspense, useEffect, type ComponentType } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { RepresentationId } from "./types";
import { ProjectSpecimen, RepresentationContinuum } from "./Specimens";

interface ResearchStageProps {
  mode: RepresentationId;
  ProjectScene: ComponentType;
  onReady?: () => void;
}

function ReadySignal({ onReady }: { onReady?: () => void }) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    invalidate();
    onReady?.();
  }, [invalidate, onReady]);

  return null;
}

function ResponsiveCamera() {
  const camera = useThree((state) => state.camera);
  const width = useThree((state) => state.size.width);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    camera.position.set(0, 0.36, width < 760 ? 14.2 : 10.2);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, width]);

  return null;
}

function StudioLighting() {
  return (
    <>
      <ambientLight intensity={0.72} color="#f7faf8" />
      <directionalLight position={[4, 7, 8]} intensity={2.1} color="#ffffff" />
      <directionalLight position={[-5, 2, -3]} intensity={0.58} color="#dbe6ff" />
      <directionalLight position={[2, -4, 4]} intensity={0.32} color="#ffded7" />
    </>
  );
}

function StageContent({ mode, ProjectScene, onReady }: ResearchStageProps) {
  return (
    <>
      <color attach="background" args={["#ffffff"]} />
      <ReadySignal onReady={onReady} />
      <ResponsiveCamera />
      <StudioLighting />
      <RepresentationContinuum mode={mode} />
      <Suspense fallback={null}>
        <ProjectSpecimen active={mode === "project"} Scene={ProjectScene} />
      </Suspense>
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI * 0.34}
        maxPolarAngle={Math.PI * 0.66}
        rotateSpeed={0.46}
        dampingFactor={0.075}
      />
    </>
  );
}

export function ResearchStage({ mode, ProjectScene, onReady }: ResearchStageProps) {
  return (
    <Canvas
      aria-label="Interactive representation studio"
      dpr={[1, 1.75]}
      frameloop="demand"
      onCreated={() => onReady?.()}
      camera={{ position: [0, 0.36, 9.4], fov: 31, near: 0.1, far: 80 }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        outputColorSpace: THREE.SRGBColorSpace,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.95,
      }}
    >
      <StageContent mode={mode} ProjectScene={ProjectScene} onReady={onReady} />
    </Canvas>
  );
}
