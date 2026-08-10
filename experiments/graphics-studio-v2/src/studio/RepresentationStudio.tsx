import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type {
  ProjectId,
  RepresentationDefinition,
  RepresentationId,
} from "../framework/types";
import { SceneRegistry } from "../framework/types";
import { GaussiAnimateSignature } from "./GaussiAnimateSignature";

const ResearchStage = lazy(() =>
  import("../framework/ResearchStage").then((module) => ({
    default: module.ResearchStage,
  })),
);
const GaussianimateScene = lazy(() =>
  import("../framework/Specimens").then((module) => ({
    default: module.GaussianimateScene,
  })),
);
const GGAvatarScene = lazy(() =>
  import("../framework/Specimens").then((module) => ({
    default: module.GGAvatarScene,
  })),
);
const HashRFScene = lazy(() =>
  import("../framework/Specimens").then((module) => ({
    default: module.HashRFScene,
  })),
);

const representations: RepresentationDefinition[] = [
  {
    id: "form",
    label: "Surface",
    title: "Continuous surface",
    description: "A smooth geometry reveals silhouette and topology.",
  },
  {
    id: "field",
    label: "Field",
    title: "Sampled representation",
    description: "A parameter becomes color only when it carries information.",
  },
  {
    id: "rig",
    label: "Rig",
    title: "Structure for motion",
    description: "Sparse curves and joints expose what can actually be controlled.",
  },
  {
    id: "project",
    label: "Projects",
    title: "Project scenes",
    description: "Each project brings its own representation into the same viewing stage.",
  },
];

const projectScenes = new SceneRegistry()
  .register({ id: "gaussianimate", label: "GaussiAnimate", Scene: GaussianimateScene })
  .register({ id: "ggavatar", label: "GGAvatar", Scene: GGAvatarScene })
  .register({ id: "hashrf", label: "HashRF", Scene: HashRFScene });

const projectCopy: Array<{
  id: ProjectId;
  label: string;
  year: string;
  description: string;
}> = [
  {
    id: "gaussianimate",
    label: "GaussiAnimate",
    year: "2026",
    description: "Dynamic Gaussians → inner rig → outer controls",
  },
  {
    id: "ggavatar",
    label: "GGAvatar",
    year: "2024",
    description: "Geometry-guided Gaussian avatar representation",
  },
  {
    id: "hashrf",
    label: "HashRF",
    year: "2024",
    description: "Compact multi-resolution radiance field",
  },
];

function FullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    </svg>
  );
}

export function RepresentationStudio() {
  const [mode, setMode] = useState<RepresentationId>("form");
  const [project, setProject] = useState<ProjectId>("gaussianimate");
  const [ready, setReady] = useState(false);
  const activeDefinition = useMemo(
    () => representations.find((entry) => entry.id === mode)!,
    [mode],
  );
  const ProjectScene = projectScenes.get(project)!.Scene;

  const selectMode = useCallback((id: RepresentationId) => {
    setMode(id);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        return;
      }
      event.preventDefault();
      const direction = ["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1;
      const index = representations.findIndex((entry) => entry.id === mode);
      const next = (index + direction + representations.length) % representations.length;
      selectMode(representations[next].id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, selectMode]);

  useEffect(() => {
    const fallback = window.setTimeout(() => setReady(true), 900);
    return () => window.clearTimeout(fallback);
  }, []);

  const requestFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  };

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <a href="/" className="studio-mark" aria-label="Return to Jiaxin Wang homepage">
          JX / R3D
        </a>
        <nav aria-label="Studio navigation">
          <a href="#studio">Studio</a>
          <a href="#motion">Motion</a>
          <a href="/">Portfolio</a>
        </nav>
        <div className="studio-scene-count">
          <span>Scene</span>
          <b>0{representations.findIndex((entry) => entry.id === mode) + 1} / 04</b>
          <button type="button" onClick={requestFullscreen} aria-label="Toggle fullscreen">
            <FullscreenIcon />
          </button>
        </div>
      </header>

      <section className="studio-main" id="studio" aria-label="Representation studio">
        <aside className="studio-index">
          <div className="representation-list" role="tablist" aria-label="Representation">
            {representations.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={mode === entry.id}
                onClick={() => selectMode(entry.id)}
              >
                <span>{entry.label}</span>
                <i />
              </button>
            ))}
          </div>

          <div className="project-list" aria-label="Project adapters">
            {projectCopy.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={mode === "project" && project === entry.id}
                onClick={() => {
                  setProject(entry.id);
                  setMode("project");
                }}
              >
                <span>{entry.label}</span>
                <small>{entry.year}</small>
              </button>
            ))}
          </div>
        </aside>

        <div className="studio-viewport">
          <div className={`stage-loading${ready ? " is-ready" : ""}`} aria-hidden="true">
            <span />
          </div>
          <div className="studio-purpose">
            <h1>Representation Studio</h1>
            <p>Surface, samples, and structure of one geometry.</p>
          </div>
          <Suspense fallback={null}>
            <ResearchStage
              mode={mode}
              ProjectScene={ProjectScene}
              onReady={() => setReady(true)}
            />
          </Suspense>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${mode}-${mode === "project" ? project : ""}`}
              className="studio-caption"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              <span>{activeDefinition.title}</span>
              <p>
                {mode === "project"
                  ? projectCopy.find((entry) => entry.id === project)?.description
                  : activeDefinition.description}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="studio-orbit-hint" aria-hidden="true">
            <span />
            Drag to orbit
          </div>
        </div>
      </section>

      <div id="motion">
        <GaussiAnimateSignature />
      </div>
    </main>
  );
}
