/**
 * @growthub/api-contract — Compositions (CMS SDK v1 additive surface)
 *
 * Compositions are manifest-first assemblies that bind widgets, pipelines,
 * capabilities, and artifacts into a governed workspace canvas. The helpers
 * below intentionally return plain objects so generated manifests remain
 * portable JSON/TypeScript without a runtime dependency.
 */

import type { ExecutionArtifactRef, ExecuteWorkflowInput } from "./execution.js";
import type { CapabilityManifest } from "./manifests.js";
import type { GridLayout, WidgetDefinition } from "./widgets.js";

export type CompositionBindingKind =
  | "chat-to-canvas"
  | "workflow-outputs-to-artifacts"
  | "artifact-to-widget"
  | "widget-to-workflow"
  | "context-thread"
  | "custom";

export interface CompositionBinding {
  kind: CompositionBindingKind;
  from: string;
  to: string;
  event?: string;
  metadata?: Record<string, unknown>;
}

export type CompositionNavigationTarget =
  | "chat"
  | "canvas"
  | "workflow"
  | "artifact"
  | "url";

export interface CompositionNavigationAction {
  id: string;
  label: string;
  target: CompositionNavigationTarget;
  ref: string;
  context?: Record<string, unknown>;
}

export interface PipelineDefinition {
  slug: string;
  name: string;
  description?: string;
  workflow: ExecuteWorkflowInput;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ArtifactDefinition {
  slug: string;
  name: string;
  artifactType: string;
  description?: string;
  preview?: {
    mediaType?: string;
    url?: string;
    dataUrl?: string;
  };
  source?: Pick<ExecutionArtifactRef, "artifactId" | "nodeId" | "storagePath" | "url">;
  metadata?: Record<string, unknown>;
}

export interface Composition {
  slug: string;
  name: string;
  description?: string;
  canvas?: {
    layout: GridLayout;
    widgets: WidgetDefinition[];
  };
  widgets: WidgetDefinition[];
  pipelines?: PipelineDefinition[];
  artifacts?: ArtifactDefinition[];
  capabilities?: CapabilityManifest[];
  bindings?: CompositionBinding[];
  navigation?: CompositionNavigationAction[];
  metadata?: Record<string, unknown>;
}

export interface CompositionManifestEnvelope {
  version: 1;
  host?: string;
  source: "hosted" | "local-extension" | "derived";
  composedAt: string;
  compositions: Composition[];
  metadata?: Record<string, unknown>;
}

export function defineCapability<T extends CapabilityManifest>(definition: T): T {
  return definition;
}

export function definePipeline<T extends PipelineDefinition>(definition: T): T {
  return definition;
}

export function defineArtifact<T extends ArtifactDefinition>(definition: T): T {
  return definition;
}

export function defineComposition<T extends Composition>(definition: T): T {
  return definition;
}
