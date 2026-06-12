/**
 * Orchestration publish helpers — shared by the Workflows surface (client)
 * and POST /api/workspace/workflow/publish (server-authoritative publish).
 *
 * These were previously private functions inside app/workflows/WorkflowSurface.jsx.
 * They are extracted so the *server* owns publish computation (version bump,
 * delta records, draft → live promotion) and the client only renders state.
 * Pure functions; the only dependency is the orchestration-graph parser.
 */

import { parseOrchestrationGraph } from "@/lib/orchestration-graph";

function nodeSandboxRecordRef(objectId, rowName, nodeId) {
  return {
    objectId: String(objectId || "").trim(),
    rowName: String(rowName || "").trim(),
    nodeId: String(nodeId || "").trim()
  };
}

function withGraphSandboxRecordRefs(graph, objectId, rowName) {
  const parsed = parseOrchestrationGraph(graph) || graph;
  if (!parsed || typeof parsed !== "object") return parsed;
  return {
    ...parsed,
    nodes: (Array.isArray(parsed.nodes) ? parsed.nodes : []).map((node) => ({
      ...node,
      config: {
        ...(node?.config || {}),
        sandboxRecordRef: nodeSandboxRecordRef(objectId, rowName, node?.id)
      }
    }))
  };
}

function patchSandboxRowInConfig(workspaceConfig, objectId, rowIndex, fields) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return {
    ...workspaceConfig,
    dataModel: {
      ...workspaceConfig.dataModel,
      objects: objects.map((object) => {
        if (object?.id !== objectId) return object;
        const rows = Array.isArray(object.rows) ? object.rows : [];
        return {
          ...object,
          rows: rows.map((row, index) => (index === rowIndex ? { ...row, ...fields } : row)),
        };
      }),
    },
  };
}

function normalizeDeltaTags(tags) {
  return Array.from(new Set((Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .filter(Boolean)));
}

function inferDeltaTagsForWorkflowNode(node, config) {
  const tags = [];
  const type = String(node?.type || "").trim();
  const action = String(config?.action || node?.id || "").trim();
  if (type === "thinAdapter") tags.push("model", "prompt", "routing");
  if (type === "ai-agent") tags.push("model", "prompt", "output");
  if (type === "data-action" || type === "data-trigger") tags.push("input", "output");
  if (type === "flow-control") tags.push("routing");
  if (type === "core-action") tags.push("runtime");
  if (type === "human-input") tags.push("input");
  if (action.includes("search") || action.includes("filter")) tags.push("evaluation", "guardrail");
  if (action.includes("delete") || config?.confirmationRequired) tags.push("guardrail");
  if (action.includes("http") || config?.url || config?.method) tags.push("routing", "input", "output");
  if (action.includes("email")) tags.push("input", "output");
  if (action.includes("delay") || config?.duration || config?.unit) tags.push("runtime");
  if (config?.objectId || config?.fieldMap || config?.filters) tags.push("input", "output");
  if (config?.model || config?.prompt) tags.push("model", "prompt");
  return normalizeDeltaTags(tags);
}

function getNodeDeltaRecords(previousGraph, nextGraph) {
  const previousNodes = new Map(
    (Array.isArray(previousGraph?.nodes) ? previousGraph.nodes : [])
      .map((node) => [String(node?.id || ""), node])
      .filter(([id]) => id)
  );

  return (Array.isArray(nextGraph?.nodes) ? nextGraph.nodes : [])
    .map((node) => {
      const nodeId = String(node?.id || "").trim();
      if (!nodeId) return null;
      const previous = previousNodes.get(nodeId);
      const config = node?.config && typeof node.config === "object" && !Array.isArray(node.config) ? node.config : {};
      const previousConfig = previous?.config && typeof previous.config === "object" && !Array.isArray(previous.config)
        ? previous.config
        : {};
      const currentComparable = JSON.stringify({
        type: node?.type || "",
        sandbox: node?.sandbox || "",
        label: node?.label || "",
        subtitle: node?.subtitle || "",
        config
      });
      const previousComparable = JSON.stringify({
        type: previous?.type || "",
        sandbox: previous?.sandbox || "",
        label: previous?.label || "",
        subtitle: previous?.subtitle || "",
        config: previousConfig
      });
      const explicitTags = normalizeDeltaTags(config.deltaTags);
      const deltaTags = explicitTags.length > 0 ? explicitTags : inferDeltaTagsForWorkflowNode(node, config);
      const changeReason = String(config.changeReason || "").trim();
      const changed = currentComparable !== previousComparable;
      if (!changed && !changeReason && deltaTags.length === 0) return null;
      return {
        nodeId,
        nodeType: String(node?.type || ""),
        label: String(node?.label || node?.sandbox || nodeId),
        sandboxRecordRef: config.sandboxRecordRef || null,
        changeReason,
        deltaTags,
        requiresRetest: config.requiresRetest !== false,
        previous: previous ? {
          type: String(previous.type || ""),
          sandbox: String(previous.sandbox || ""),
          label: String(previous.label || "")
        } : null,
        next: {
          type: String(node.type || ""),
          sandbox: String(node.sandbox || ""),
          label: String(node.label || "")
        }
      };
    })
    .filter(Boolean);
}

/**
 * Resolve which live field this row publishes into and which draft field
 * feeds it — same precedence the Workflows surface uses.
 */
function resolveWorkflowFieldNames(row) {
  const hasGraphValue = (value) => Boolean(String(value ?? "").trim());
  const liveField = hasGraphValue(row?.orchestrationConfig)
    ? "orchestrationConfig"
    : hasGraphValue(row?.orchestrationGraph)
      ? "orchestrationGraph"
      : "orchestrationConfig";
  const draftField = liveField === "orchestrationConfig" ? "orchestrationDraftConfig" : "orchestrationDraftGraph";
  return { liveField, draftField };
}

export {
  getNodeDeltaRecords,
  inferDeltaTagsForWorkflowNode,
  nodeSandboxRecordRef,
  normalizeDeltaTags,
  patchSandboxRowInConfig,
  resolveWorkflowFieldNames,
  withGraphSandboxRecordRefs
};
