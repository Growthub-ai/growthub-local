import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_NATIVE_SCHEDULER_PROFILE,
  inputModePatchForSelection,
  inputModeSelectionValue,
  makeAgentNativeSchedulerMethod,
} from "./agent-native-scheduler.js";
import { buildWorkspaceMetadataGraph } from "./workspace-metadata-graph.js";
import { deriveWorkspaceWorkflowMetadataItems } from "./workspace-metadata-store.js";

test("Agent Native Scheduler stays on the canonical API-request lane", () => {
  const patch = inputModePatchForSelection(AGENT_NATIVE_SCHEDULER_PROFILE);
  assert.equal(patch.inputMode, "api-request");
  assert.equal(patch.agentSchedulerAdapter, "codex-task");
  assert.equal(inputModeSelectionValue(patch), AGENT_NATIVE_SCHEDULER_PROFILE);
});

test("only the validated Codex adapter is executable", () => {
  const method = makeAgentNativeSchedulerMethod({ productId: "growthub-api-trigger", triggerKind: "api-request" });
  assert.deepEqual(method.adapters.filter((item) => item.enabled).map((item) => item.value), ["codex-task"]);
  const attemptedFutureAdapter = inputModePatchForSelection(AGENT_NATIVE_SCHEDULER_PROFILE, { agentSchedulerAdapter: "gemini-agent" });
  assert.equal(attemptedFutureAdapter.agentSchedulerAdapter, "codex-task");
});

test("starter metadata graph projects only non-secret scheduler read-back", () => {
  const workflowConfig = {
    dataModel: { objects: [{
      id: "sandbox-environments",
      objectType: "sandbox-environment",
      rows: [{
        Name: "weekly-loop",
        orchestrationGraph: { nodes: [{ id: "input", type: "input", config: {
          ...inputModePatchForSelection(AGENT_NATIVE_SCHEDULER_PROFILE),
          agentSchedulerTaskRef: "task-019f",
          agentSchedulerTimezone: "America/New_York",
        } }], edges: [] },
      }],
    }] },
  };
  const projection = deriveWorkspaceWorkflowMetadataItems(workflowConfig, [{ id: "sandbox-environments" }]);
  const graph = buildWorkspaceMetadataGraph({ workflows: projection.workflows, workflowNodes: projection.nodes });
  const workflow = graph.nodes.find((node) => node.type === "workflow");
  assert.equal(workflow.summary.inputProfile, "agent-native-scheduler");
  assert.equal(workflow.summary.agentSchedulerAdapter, "codex-task");
  assert.equal(JSON.stringify(graph).includes("GROWTHUB_API_INVOKE_TOKEN"), false);
});
