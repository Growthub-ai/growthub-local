/**
 * growthub.config.mjs — Agency Portal Starter Kit canvas
 *
 * Declarative canvas assembly for the agency-portal worker kit. Edit
 * this file to shape the operator's default workspace, then render
 * with:
 *
 *   $ growthub compose preview  ./growthub.config.mjs
 *   $ growthub compose validate ./growthub.config.mjs
 *   $ growthub compose deploy   ./growthub.config.mjs -o ./dist/envelope.json
 *
 * This file is intentionally additive: the kit still works without it.
 * Remove it any time to fall back to the kit's default layout.
 */
import {
  defineComposition,
  defineWidget,
} from "@growthub/api-contract";

export const composition = defineComposition({
  id: "agency-portal-canvas",
  title: "Agency Portal",
  subtitle: "Operator canvas for client delivery and launch QA.",
  canvas: { columns: 12, rowHeight: 80 },
  capabilities: [],
  pipelines: [],
  artifacts: [],
  widgets: [
    defineWidget({
      id: "overview",
      kind: "markdown",
      title: "Overview",
      subtitle: "Edit this widget in growthub.config.mjs.",
      layout: { x: 0, y: 0, w: 12, h: 2 },
      config: {
        body:
          "Welcome to the Agency Portal canvas. Swap widgets below to point at " +
          "your own saved workflows, artifacts, and chat threads.",
      },
    }),
    defineWidget({
      id: "client-pipeline",
      kind: "workflow-runner",
      title: "Client Launch Pipeline",
      layout: { x: 0, y: 2, w: 7, h: 5 },
      bindings: {
        // pipelineId: "<saved-hosted-workflow-id>",
      },
      tags: ["launch", "delivery"],
    }),
    defineWidget({
      id: "ops-chat",
      kind: "chat-session",
      title: "Ops Room",
      layout: { x: 7, y: 2, w: 5, h: 5 },
      bindings: {
        // threadId: "thread_xxx",
      },
      tags: ["ops"],
    }),
    defineWidget({
      id: "latest-report",
      kind: "artifact-viewer",
      title: "Latest Client Report",
      layout: { x: 0, y: 7, w: 6, h: 4 },
      bindings: {
        // artifactId: "art_xxx",
      },
    }),
    defineWidget({
      id: "launch-metrics",
      kind: "chart",
      title: "Launch Metrics",
      layout: { x: 6, y: 7, w: 6, h: 4 },
      config: {
        series: ["traffic", "conversions", "retention"],
      },
    }),
  ],
});

export default composition;
