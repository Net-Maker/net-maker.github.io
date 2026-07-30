import type { ComponentType } from "react";

export type RepresentationId = "form" | "field" | "rig" | "project";

export type ProjectId = "gaussianimate" | "ggavatar" | "hashrf";

export interface RepresentationDefinition {
  id: RepresentationId;
  label: string;
  title: string;
  description: string;
}

export interface ProjectDefinition {
  id: ProjectId;
  label: string;
  year: string;
  description: string;
  Scene: ComponentType;
}

export interface ScenePlugin {
  id: string;
  label: string;
  Scene: ComponentType;
}

export class SceneRegistry {
  readonly #plugins = new Map<string, ScenePlugin>();

  register(plugin: ScenePlugin) {
    if (this.#plugins.has(plugin.id)) {
      throw new Error(`Scene plugin "${plugin.id}" is already registered.`);
    }
    this.#plugins.set(plugin.id, plugin);
    return this;
  }

  get(id: string) {
    return this.#plugins.get(id);
  }

  list() {
    return [...this.#plugins.values()];
  }
}
