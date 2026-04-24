/**
 * growthub.config.mjs — Custom Workspace Starter canvas
 *
 * Declarative canvas assembly for the greenfield "discovery starter"
 * worker kit. Ships with the same composability primitives as every
 * other Growthub kit so local harnesses and the hosted UI render the
 * same manifest identically.
 *
 *   $ growthub compose preview  ./growthub.config.mjs
 *   $ growthub compose validate ./growthub.config.mjs
 *   $ growthub compose deploy   ./growthub.config.mjs -o ./dist/envelope.json
 */
import {
  defineComposition,
  defineWidget,
} from "@growthub/api-contract";

export const composition = defineComposition({
  id: "discovery-starter-canvas",
  title: "Discovery Starter",
  subtitle: "Greenfield baseline canvas for a brand-new Growthub workspace.",
  canvas: { columns: 12, rowHeight: 80 },
  capabilities: [],
  pipelines: [],
  artifacts: [],
  widgets: [
    defineWidget({
      id: "welcome",
      kind: "markdown",
      title: "Welcome",
      layout: { x: 0, y: 0, w: 12, h: 2 },
      config: {
        body:
          "This is your discovery starter canvas. Wire widgets below to your " +
          "own workflows, artifacts, and chat threads.",
      },
    }),
    defineWidget({
      id: "primary-workflow",
      kind: "workflow-runner",
      title: "Primary Workflow",
      layout: { x: 0, y: 2, w: 6, h: 4 },
      bindings: {
        // pipelineId: "<saved-hosted-workflow-id>",
      },
    }),
    defineWidget({
      id: "discovery-chat",
      kind: "chat-session",
      title: "Discovery Chat",
      layout: { x: 6, y: 2, w: 6, h: 4 },
      bindings: {
        // threadId: "thread_xxx",
      },
    }),
    defineWidget({
      id: "latest-artifact",
      kind: "artifact-viewer",
      title: "Latest Artifact",
      layout: { x: 0, y: 6, w: 12, h: 4 },
      bindings: {
        // artifactId: "art_xxx",
      },
    }),
  ],
});

export default composition;
