import { Suspense, useEffect, type ComponentType } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
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

function StudioLighting() {
  return (
    <>
      <ambientLight intensity={1.7} color="#f9fbff" />
      <directionalLight position={[4, 7, 8]} intensity={3.4} color="#ffffff" />
      <directionalLight position={[-5, 2, -3]} intensity={1.2} color="#dbe6ff" />
      <directionalLight position={[2, -4, 4]} intensity={0.7} color="#ffded7" />
    </>
  );
}

function StageContent({ mode, ProjectScene, onReady }: ResearchStageProps) {
  return (
    <>
      <ReadySignal onReady={onReady} />
      <StudioLighting />
      <RepresentationContinuum mode={mode} />
      <ProjectSpecimen active={mode === "project"} Scene={ProjectScene} />
      <ContactShadows
        position={[0, -2.28, 0]}
        opacity={0.14}
        scale={12}
        blur={2.8}
        far={7}
        frames={Infinity}
        color="#8190a0"
      />
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
      camera={{ position: [0, 0.45, 12], fov: 31, near: 0.1, far: 80 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        outputColorSpace: THREE.SRGBColorSpace,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
    >
      <Suspense fallback={null}>
        <StageContent mode={mode} ProjectScene={ProjectScene} onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
