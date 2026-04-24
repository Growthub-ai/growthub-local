/**
 * @growthub/api-contract — Widget primitives (CMS SDK v1 additive)
 *
 * Widgets are declarative canvas/dashboard cells. They bind existing
 * Growthub primitives (chat sessions, workflows, artifacts, metrics, and
 * custom renderers) without introducing a new execution transport.
 */

import type { ExecutionArtifactRef } from "./execution.js";

export type WidgetType =
  | "chart"
  | "chat-session"
  | "workflow-runner"
  | "artifact-viewer"
  | "custom-react";

export type WidgetMetricSource =
  | "capability"
  | "workflow"
  | "artifact"
  | "trace"
  | "hosted-profile"
  | "custom";

export interface WidgetMediaPreview {
  kind: "image" | "video" | "audio" | "document" | "text";
  url?: string;
  dataUrl?: string;
  alt?: string;
  mimeType?: string;
  artifact?: ExecutionArtifactRef;
}

export interface WidgetBinding {
  /**
   * Semantic binding key, e.g. `threadId`, `workflowId`, `pipelineId`, or
   * a provider-specific input consumed by a custom renderer.
   */
  key: string;
  value?: unknown;
  source?: WidgetMetricSource;
  required?: boolean;
}

export interface WidgetMetricHook {
  id: string;
  label?: string;
  source: WidgetMetricSource;
  path?: string;
  refreshMs?: number;
}

export interface WidgetDefinition {
  slug: string;
  type: WidgetType;
  title: string;
  description?: string;
  icon?: string;
  capabilitySlug?: string;
  workflowId?: string;
  pipelineId?: string;
  artifactTypes?: string[];
  bindings?: WidgetBinding[];
  metrics?: WidgetMetricHook[];
  mediaPreview?: WidgetMediaPreview;
  renderer?: {
    module?: string;
    exportName?: string;
    props?: Record<string, unknown>;
  };
  navigation?: {
    openChatThreadId?: string;
    openWorkflowId?: string;
    openArtifactId?: string;
    href?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface GridLayoutItem {
  widgetSlug: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface GridLayout {
  columns: number;
  rowHeight: number;
  gap?: number;
  items: GridLayoutItem[];
  responsive?: Record<string, {
    columns: number;
    items?: GridLayoutItem[];
  }>;
}

export function defineWidget<const T extends WidgetDefinition>(widget: T): T {
  return widget;
}
