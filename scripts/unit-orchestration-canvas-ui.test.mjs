import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const canvasPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/data-model/components/OrchestrationGraphCanvas.jsx";
const workflowSurfacePath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/workflows/WorkflowSurface.jsx";
const swarmPanelPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/data-model/components/AgentSwarmPanel.jsx";
const nodePanelPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/data-model/components/OrchestrationNodeConfigPanel.jsx";
const cssPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/globals.css";

const canvasSource = readFileSync(canvasPath, "utf8");
const workflowSurfaceSource = readFileSync(workflowSurfacePath, "utf8");
const swarmPanelSource = readFileSync(swarmPanelPath, "utf8");
const nodePanelSource = readFileSync(nodePanelPath, "utf8");
const cssSource = readFileSync(cssPath, "utf8");

test("workflow canvas supports mouse pan, wheel zoom, and fit view without graph data writes", () => {
  assert.match(canvasSource, /const \[pan, setPan\] = useState\(\{ x: 0, y: 0 \}\)/);
  assert.match(canvasSource, /onWheel=\{handleWheel\}/);
  assert.match(canvasSource, /onPointerDown=\{handlePointerDown\}/);
  assert.match(canvasSource, /onPointerMove=\{handlePointerMove\}/);
  assert.match(canvasSource, /title="Fit view"/);
  assert.match(canvasSource, /translate3d\(\$\{pan\.x\}px, \$\{pan\.y\}px, 0\) scale\(\$\{zoom\}\)/);
  assert.doesNotMatch(canvasSource, /PATCH|fetch\(|localStorage|sessionStorage/);
});

test("workflow canvas keeps tall vertical graphs padded and draggable", () => {
  assert.match(cssSource, /\.dm-workflow-orchestration \.dm-orchestration-canvas \{[\s\S]*padding: 96px 24px;/);
  assert.match(cssSource, /\.dm-workflow-orchestration \.dm-orchestration-canvas \{[\s\S]*cursor: grab;/);
  assert.match(cssSource, /\.dm-workflow-orchestration \.dm-orchestration-canvas \{[\s\S]*touch-action: none;/);
  assert.match(cssSource, /\.dm-orchestration-canvas__viewport \{[\s\S]*padding: 96px 0;/);
  assert.match(cssSource, /\.dm-orchestration-canvas__viewport \{[\s\S]*transform-origin: center center;/);
});

test("workflow node edits carry deterministic sandbox record references", () => {
  assert.match(workflowSurfaceSource, /function nodeSandboxRecordRef\(objectId, rowName, nodeId\)/);
  assert.match(workflowSurfaceSource, /function withGraphSandboxRecordRefs\(graph, objectId, rowName\)/);
  assert.match(workflowSurfaceSource, /sandboxRecordRef: recordRef/);
  assert.match(workflowSurfaceSource, /serializeOrchestrationGraph\(withGraphSandboxRecordRefs\(orchestrationGraph, objectId, rowId\)\)/);
  assert.match(workflowSurfaceSource, /sandboxRecordRef: config\.sandboxRecordRef \|\| null/);
  assert.match(workflowSurfaceSource, /<AgentSwarmPanel[\s\S]*objectId=\{objectId\}[\s\S]*rowName=\{rowId\}/);
  assert.match(swarmPanelSource, /sandboxRecordRef: nodeSandboxRecordRef\(objectId, rowName, nodeId\)/);
});

test("workflow config controls use lucide checkboxes and suppress native number spinners", () => {
  assert.match(swarmPanelSource, /import \{ Check, Plus, Trash2 \} from "lucide-react"/);
  assert.match(nodePanelSource, /import \{ Check \} from "lucide-react"/);
  assert.match(cssSource, /input\[type="number"\]::-webkit-inner-spin-button/);
  assert.match(cssSource, /\.dm-workflow-check__box/);
});
