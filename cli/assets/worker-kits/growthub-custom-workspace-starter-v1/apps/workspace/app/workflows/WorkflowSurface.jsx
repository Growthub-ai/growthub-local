"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Code,
  Filter,
  FormInput,
  GitBranch,
  Globe2,
  History,
  MailPlus,
  Pause,
  PencilLine,
  Play,
  Plus,
  Power,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  X
} from "lucide-react";
import { WorkspaceRail } from "../workspace-rail.jsx";
import { findSandboxRowByWorkflowRef } from "@/lib/nav-workflows";
import {
  addCanonicalNodeToGraph,
  buildBlankOrchestrationGraphShell,
  buildDefaultAgentSwarmGraph,
  buildDefaultOrchestrationGraphFromRegistry,
  getNextCanonicalNodeId,
  getOrchestrationGraphUiState,
  isAgentSwarmGraph,
  parseOrchestrationGraph,
  redactSecretsFromText,
  serializeOrchestrationGraph,
  updateGraphNode,
  validateOrchestrationGraph
} from "@/lib/orchestration-graph";
import { resolveConnectorAction } from "@/lib/orchestration-sidecar-routing";
import { OrchestrationGraphCanvas } from "../data-model/components/OrchestrationGraphCanvas.jsx";
import { OrchestrationGraphEmptyCanvas } from "../data-model/components/OrchestrationGraphEmptyCanvas.jsx";
import { OrchestrationNodeConfigPanel } from "../data-model/components/OrchestrationNodeConfigPanel.jsx";
import { OrchestrationRunTracePanel } from "../data-model/components/OrchestrationRunTracePanel.jsx";
import { OrchestrationDeltaHistoryPanel } from "./OrchestrationDeltaHistoryPanel.jsx";
import { AgentSwarmPanel } from "../data-model/components/AgentSwarmPanel.jsx";
import { RunSetupPanel } from "./RunSetupPanel.jsx";
import { describeRunInputMetadataItems, discoverRunInputSchema } from "@/lib/orchestration-run-inputs";
import { selectWorkflowNodeInputSchema } from "@/lib/workspace-metadata-selectors";
import { deriveProvenance, hasConnectionId } from "@/lib/workspace-activation";

// Workspace Metadata Graph V1 — read-only dependency metadata for workflow
// sidecars. The runtime path (sandbox-run, publish, draft/live) is
// unchanged; this only exposes typed dependency descriptors so the sidecar
// can render "this node requires N inputs from M source nodes".
const WORKFLOW_METADATA_SELECTORS = Object.freeze({
  describeRunInputMetadataItems,
  selectWorkflowNodeInputSchema
});

function resolveRegistryRowForSandbox(workspaceConfig, sandboxRow) {
  const graph = parseOrchestrationGraph(sandboxRow?.orchestrationConfig || sandboxRow?.orchestrationGraph);
  const apiNode = graph?.nodes?.find((n) => n?.type === "api-registry-call");
  const registryId = String(
    apiNode?.config?.registryId || apiNode?.config?.integrationId || sandboxRow?.schedulerRegistryId || ""
  ).trim();
  if (!registryId || !workspaceConfig) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const objectItem of objects) {
    if (objectItem?.objectType !== "api-registry") continue;
    const rows = Array.isArray(objectItem.rows) ? objectItem.rows : [];
    const match = rows.find((r) => String(r?.integrationId || "").trim() === registryId);
    if (match) return match;
  }
  return null;
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

const WORKFLOW_ACTION_GROUPS = [
  {
    label: "Data",
    items: [
      { id: "create-record", label: "Create Record", type: "data-action", Icon: Plus, destructive: false },
      { id: "update-record", label: "Update Record", type: "data-action", Icon: RefreshCw, destructive: false },
      { id: "delete-record", label: "Delete Record", type: "data-action", Icon: Trash2, destructive: true },
      { id: "search-records", label: "Search Records", type: "data-action", Icon: Search, destructive: false },
      { id: "upsert-record", label: "Create or Update Record", type: "data-action", Icon: PencilLine, destructive: false },
    ],
  },
  { label: "AI", items: [{ id: "ai-agent", label: "AI Agent", type: "ai-agent", Icon: Bot, destructive: false }] },
  {
    label: "Flow",
    items: [
      { id: "iterator", label: "Iterator", type: "flow-control", Icon: RefreshCw, destructive: false },
      { id: "filter", label: "Filter", type: "flow-control", Icon: Filter, destructive: false },
      { id: "if-else", label: "If/else", type: "flow-control", Icon: GitBranch, destructive: false },
      { id: "delay", label: "Delay", type: "flow-control", Icon: Pause, destructive: false },
    ],
  },
  {
    label: "Core",
    items: [
      { id: "send-email", label: "Send Email", type: "core-action", Icon: Send, destructive: false },
      { id: "draft-email", label: "Draft Email", type: "core-action", Icon: MailPlus, destructive: false },
      { id: "code-function", label: "Code - Logic Function", type: "core-action", Icon: Code, destructive: false },
      { id: "http-request", label: "HTTP Request", type: "core-action", Icon: Globe2, destructive: false },
    ],
  },
  { label: "Human Input", items: [{ id: "form", label: "Form", type: "human-input", Icon: FormInput, destructive: false }] },
];

function getWorkspaceObjectOptions(workspaceConfig) {
  return (Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [])
    .filter((object) => object?.id && object?.objectType !== "sandbox-environment" && object?.objectType !== "api-registry")
    .map((object) => ({
      id: String(object.id),
      label: String(object.name || object.label || object.id),
      objectType: String(object.objectType || "custom")
    }));
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

function makeWorkflowNode(action, workspaceConfig, graph) {
  const baseId = String(action.id || action.type || "step").replace(/[^a-zA-Z0-9_-]+/g, "-");
  const existingIds = new Set((Array.isArray(graph?.nodes) ? graph.nodes : []).map((node) => String(node.id)));
  let id = baseId;
  let index = 2;
  while (existingIds.has(id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }
  const isData = action.type === "data-action" || action.type === "data-trigger";
  return {
    id,
    type: action.type,
    label: action.label,
    subtitle: isData ? "Select workspace object" : action.type,
    config: {
      action: action.id,
      destructive: Boolean(action.destructive),
      objectId: "",
      objectType: "",
      objectName: "",
      confirmationRequired: Boolean(action.destructive),
      mode: "draft"
    }
  };
}

function insertWorkflowNode(graph, node, target = {}) {
  const parsed = parseOrchestrationGraph(graph) || graph || buildBlankOrchestrationGraphShell();
  const nodes = Array.isArray(parsed.nodes) ? [...parsed.nodes, node] : [node];
  const edges = Array.isArray(parsed.edges) ? [...parsed.edges] : [];
  const from = String(target.from || "").trim();
  const to = String(target.to || "").trim();
  const filteredEdges = from && to ? edges.filter((edge) => !(String(edge.from) === from && String(edge.to) === to)) : edges;
  if (from) filteredEdges.push({ from, to: node.id, passes: "workflow-delta" });
  if (to) filteredEdges.push({ from: node.id, to, passes: "workflow-delta" });
  return { ...parsed, nodes, edges: filteredEdges };
}

function removeWorkflowNode(graph, nodeId) {
  const parsed = parseOrchestrationGraph(graph) || graph || buildBlankOrchestrationGraphShell();
  const id = String(nodeId || "").trim();
  if (!id) return parsed;
  return {
    ...parsed,
    nodes: (Array.isArray(parsed.nodes) ? parsed.nodes : []).filter((node) => String(node.id) !== id),
    edges: (Array.isArray(parsed.edges) ? parsed.edges : []).filter(
      (edge) => String(edge.from) !== id && String(edge.to) !== id
    )
  };
}

function getRunHttpStatus(responseText) {
  try {
    const parsed = typeof responseText === "string" ? JSON.parse(responseText) : responseText;
    const status = parsed?.adapterMeta?.httpStatus ?? parsed?.response?.adapterMeta?.httpStatus ?? parsed?.httpStatus;
    const number = Number(status);
    return Number.isFinite(number) ? number : null;
  } catch {
    return null;
  }
}

function isPassingRun(payload) {
  const httpStatus = getRunHttpStatus(payload?.response);
  if (httpStatus != null) return payload?.ok === true && httpStatus === 200;
  return payload?.ok === true && Number(payload?.exitCode ?? payload?.response?.exitCode) === 0;
}

function graphHasNodes(graph) {
  return Array.isArray(graph?.nodes) && graph.nodes.length > 0;
}

function WorkflowAddStepPanel({ target, onSelect }) {
  return (
    <div className="dm-workflow-add-panel">
      <div className="dm-workflow-add-panel__context">
        <span>Insert step</span>
        <strong>{target?.from ? `After ${target.from}` : "At end of workflow"}</strong>
        {target?.to && <em>Before {target.to}</em>}
      </div>
      {WORKFLOW_ACTION_GROUPS.map((group) => (
        <div key={group.label} className="dm-workflow-action-group">
          <span className="dm-workflow-action-group__label">{group.label}</span>
          {group.items.map((item) => {
            const Icon = item.Icon;
            return (
              <button key={item.id} type="button" className="dm-workflow-action-option" onClick={() => onSelect(item)}>
                <span aria-hidden="true"><Icon size={16} /></span>
                <strong>{item.label}</strong>
                {item.destructive && <small>Requires confirmation at run time</small>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function WorkflowSurface() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const objectId = String(searchParams.get("object") || "").trim();
  const rowId = String(searchParams.get("row") || "").trim();
  const fieldName = String(searchParams.get("field") || "orchestrationConfig").trim();
  const runId = String(searchParams.get("run") || "").trim();

  const [workspaceConfig, setWorkspaceConfig] = useState(null);
  const [authority, setAuthority] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  const [sidecarMode, setSidecarMode] = useState(runId ? "trace" : "graph");

  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [addTarget, setAddTarget] = useState(null);
  const [configTab, setConfigTab] = useState("node");
  const [graphError, setGraphError] = useState("");
  const [orchestrationGraph, setOrchestrationGraph] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [runSetupOpen, setRunSetupOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workspace", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load workspace");
      setWorkspaceConfig(payload.workspaceConfig);
      setAuthority(payload.adapters?.integrations?.authority || null);
    } catch (err) {
      setError(err.message || "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolved = useMemo(
    () => (workspaceConfig ? findSandboxRowByWorkflowRef(workspaceConfig, objectId, rowId) : { object: null, row: null, rowIndex: -1 }),
    [workspaceConfig, objectId, rowId]
  );

  const sandboxRow = resolved.row;
  const hasGraphValue = (value) => Boolean(parseOrchestrationGraph(value));
  const effectiveFieldName = hasGraphValue(sandboxRow?.orchestrationConfig)
    ? "orchestrationConfig"
    : hasGraphValue(sandboxRow?.orchestrationGraph)
      ? "orchestrationGraph"
      : hasGraphValue(sandboxRow?.[fieldName])
        ? fieldName
        : "orchestrationConfig";
  const draftFieldName = effectiveFieldName === "orchestrationConfig" ? "orchestrationDraftConfig" : "orchestrationDraftGraph";
  const orchestrationDeltas = useMemo(
    () => (Array.isArray(sandboxRow?.orchestrationDeltas) ? sandboxRow.orchestrationDeltas : []),
    [sandboxRow]
  );
  const registryRow = useMemo(
    () => (sandboxRow && workspaceConfig ? resolveRegistryRowForSandbox(workspaceConfig, sandboxRow) : null),
    [workspaceConfig, sandboxRow]
  );

  // Template-aware activation banner. When the active workflow belongs to
  // a seeded template (project-management today) and its provider row
  // doesn't have a connectionId yet, surface a back-link to the API
  // Registry / Nango panel so the user can finish setup without hunting
  // through Data Model surfaces.
  const templateBanner = useMemo(() => {
    if (!workspaceConfig) return null;
    const provenance = deriveProvenance(workspaceConfig);
    if (provenance.template !== "project-management") return null;
    if (!registryRow) return null;
    const ready = hasConnectionId(registryRow);
    const apiRegistryObjectId = String(
      (Array.isArray(workspaceConfig?.dataModel?.objects)
        ? workspaceConfig.dataModel.objects.find((o) => o?.objectType === "api-registry")?.id
        : "") || ""
    );
    const apiRegistryRowId = String(registryRow.integrationId || "").trim();
    const backHref = apiRegistryObjectId && apiRegistryRowId
      ? `/data-model?object=${encodeURIComponent(apiRegistryObjectId)}&row=${encodeURIComponent(apiRegistryRowId)}`
      : "/data-model";
    return {
      ready,
      backHref,
      providerConfigKey: String(registryRow.providerConfigKey || registryRow.integrationId || "").trim(),
    };
  }, [workspaceConfig, registryRow]);

  useEffect(() => {
    setSidecarMode(runId ? "trace" : "graph");
  }, [runId]);

  useEffect(() => {
    if (!sandboxRow) return;
    const draftParsed = parseOrchestrationGraph(sandboxRow[draftFieldName]);
    const publishedParsed = parseOrchestrationGraph(sandboxRow[effectiveFieldName])
      || parseOrchestrationGraph(sandboxRow.orchestrationConfig)
      || parseOrchestrationGraph(sandboxRow.orchestrationGraph);
    const parsed = graphHasNodes(draftParsed)
      ? draftParsed
      : (publishedParsed || draftParsed);
    setOrchestrationGraph(parsed);
    setDirty(false);
    setGraphError("");
  }, [sandboxRow, effectiveFieldName, draftFieldName, objectId, rowId]);

  const graphUiState = getOrchestrationGraphUiState(orchestrationGraph);
  const graphUnset = graphUiState === "unset";
  const graphBlankShell = graphUiState === "blank-shell";
  const swarmMode = useMemo(() => isAgentSwarmGraph(orchestrationGraph), [orchestrationGraph]);
  const nextNodeId = useMemo(
    () => (orchestrationGraph && !swarmMode ? getNextCanonicalNodeId(orchestrationGraph) : null),
    [orchestrationGraph, swarmMode]
  );

  const selectedNode = useMemo(() => {
    if (!orchestrationGraph?.nodes || !selectedNodeId) return null;
    return orchestrationGraph.nodes.find((n) => String(n.id) === selectedNodeId) || null;
  }, [orchestrationGraph, selectedNodeId]);

  useEffect(() => {
    if (graphUnset || graphBlankShell) {
      setGraphError("");
      return;
    }
    const validation = validateOrchestrationGraph(orchestrationGraph);
    setGraphError(validation.ok ? "" : validation.errors[0] || "Invalid graph");
  }, [orchestrationGraph, graphUnset, graphBlankShell]);

  async function persistWorkspace(nextConfig) {
    const res = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataModel: nextConfig.dataModel }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || "Failed to save workspace");
    setWorkspaceConfig(payload.workspaceConfig || nextConfig);
  }

  function serializeCurrentGraph() {
    return graphUnset ? "" : serializeOrchestrationGraph(orchestrationGraph);
  }

  async function saveDraft(extraFields = {}) {
    if (resolved.rowIndex < 0 || !objectId) return null;
    const serialized = serializeCurrentGraph();
    const next = patchSandboxRowInConfig(workspaceConfig, objectId, resolved.rowIndex, {
      [draftFieldName]: serialized,
      orchestrationDraftStatus: "draft",
      orchestrationDraftUpdatedAt: new Date().toISOString(),
      orchestrationDraftBaseVersion: String(sandboxRow?.version || "1"),
      ...extraFields
    });
    await persistWorkspace(next);
    return { next, serialized };
  }

  async function saveGraph() {
    if (resolved.rowIndex < 0 || !objectId) return;
    setSaving(true);
    setSaveMessage("");
    try {
      await saveDraft({
        orchestrationDraftStatus: "untested",
        orchestrationDraftTestPassed: false,
        orchestrationDraftTestedConfig: ""
      });
      setDirty(false);
      setSaveMessage("Saved draft changes. Test must pass before Publish can update the executable version.");
    } catch (err) {
      setSaveMessage(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function patchSandboxRuntimeFields(fields) {
    if (resolved.rowIndex < 0 || !objectId || !fields || typeof fields !== "object") return;
    setSaving(true);
    setSaveMessage("");
    try {
      const next = patchSandboxRowInConfig(workspaceConfig, objectId, resolved.rowIndex, fields);
      await persistWorkspace(next);
      setSaveMessage("Updated workflow runtime settings.");
    } catch (err) {
      setSaveMessage(err.message || "Runtime update failed");
    } finally {
      setSaving(false);
    }
  }

  async function publishGraph() {
    if (resolved.rowIndex < 0 || !objectId) return;
    const serialized = serializeCurrentGraph();
    const draftPassed = sandboxRow?.orchestrationDraftTestPassed === true || String(sandboxRow?.orchestrationDraftTestPassed || "") === "true";
    const testedConfig = String(sandboxRow?.orchestrationDraftTestedConfig || "");
    if (!draftPassed || testedConfig !== serialized) {
      setSaveMessage("Publish blocked. Save and test this exact draft successfully before publishing.");
      return;
    }
    setPublishing(true);
    setSaveMessage("");
    try {
      const currentVersion = Number(sandboxRow?.version || 1);
      const nextVersion = Number.isFinite(currentVersion) ? String(currentVersion + 1) : "1";
      const previousDeltas = Array.isArray(sandboxRow?.orchestrationDeltas) ? sandboxRow.orchestrationDeltas : [];
      const previousPublishedGraph = parseOrchestrationGraph(sandboxRow?.[effectiveFieldName]);
      const nodeDeltas = getNodeDeltaRecords(previousPublishedGraph, orchestrationGraph);
      const deltaTags = normalizeDeltaTags(nodeDeltas.flatMap((delta) => delta.deltaTags));
      const changeReason = nodeDeltas.map((delta) => delta.changeReason).filter(Boolean).join("\n");
      const next = patchSandboxRowInConfig(workspaceConfig, objectId, resolved.rowIndex, {
        [effectiveFieldName]: serialized,
        [draftFieldName]: "",
        version: nextVersion,
        lifecycleStatus: "live",
        orchestrationDraftStatus: "published",
        orchestrationDraftTestPassed: false,
        orchestrationDraftTestedConfig: "",
        orchestrationPublishedAt: new Date().toISOString(),
        orchestrationDeltas: [
          ...previousDeltas,
          {
            at: new Date().toISOString(),
            version: nextVersion,
            field: effectiveFieldName,
            action: "publish",
            previousVersion: String(sandboxRow?.version || "1"),
            draftTestedAt: sandboxRow?.orchestrationDraftLastTested || "",
            draftRunId: sandboxRow?.orchestrationDraftLastRunId || "",
            changeReason,
            deltaTags,
            nodeDeltas,
            nodeCount: Array.isArray(orchestrationGraph?.nodes) ? orchestrationGraph.nodes.length : 0,
            edgeCount: Array.isArray(orchestrationGraph?.edges) ? orchestrationGraph.edges.length : 0
          }
        ]
      });
      await persistWorkspace(next);
      setDirty(false);
      setSaveMessage(`Published orchestration config v${nextVersion}.`);
    } catch (err) {
      setSaveMessage(err.message || "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  async function discardDraft() {
    if (resolved.rowIndex < 0 || !objectId) return;
    const hasSavedDraft = Boolean(String(sandboxRow?.[draftFieldName] || "").trim());
    if (hasSavedDraft || dirty) {
      const confirmed = window.confirm("Discard draft changes and return to the latest published orchestration config?");
      if (!confirmed) return;
    }
    setSaving(true);
    setSaveMessage("");
    try {
      const next = patchSandboxRowInConfig(workspaceConfig, objectId, resolved.rowIndex, {
        [draftFieldName]: "",
        orchestrationDraftStatus: "",
        orchestrationDraftUpdatedAt: "",
        orchestrationDraftBaseVersion: "",
        orchestrationDraftLastTested: "",
        orchestrationDraftLastRunId: "",
        orchestrationDraftLastResponse: "",
        orchestrationDraftTestPassed: false,
        orchestrationDraftTestedConfig: ""
      });
      await persistWorkspace(next);
      setOrchestrationGraph(parseOrchestrationGraph(sandboxRow?.[effectiveFieldName]));
      setSelectedNodeId("");
      setAddTarget(null);
      setDirty(false);
      setSaveMessage("Draft discarded. Showing latest published workflow.");
    } catch (err) {
      setSaveMessage(err.message || "Discard failed");
    } finally {
      setSaving(false);
    }
  }

  const runInputSchema = useMemo(
    () => discoverRunInputSchema(orchestrationGraph),
    [orchestrationGraph]
  );

  async function runSandbox(options = {}) {
    if (!objectId || !rowId) return;
    const runInputs = options && typeof options === "object" && options.runInputs && typeof options.runInputs === "object"
      ? options.runInputs
      : null;
    setRunning(true);
    setRunMessage("");
    try {
      const draft = await saveDraft({ orchestrationDraftStatus: "testing" });
      const draftGraph = draft?.serialized || serializeCurrentGraph();
      const body = { objectId, name: rowId, useDraft: true, draftGraph };
      if (runInputs) body.runInputs = runInputs;
      const res = await fetch("/api/workspace/sandbox-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      const responseText = redactSecretsFromText(JSON.stringify(payload.response ?? payload, null, 2));
      const status = payload.ok && String(payload.status || "").toLowerCase() === "connected" ? "connected" : "failed";
      const pass = isPassingRun(payload);
      const testedAt = payload.response?.ranAt || new Date().toISOString();
      const lastRunId = payload.runId || payload.response?.runId || "";
      const lastSourceId = payload.sourceId || payload.response?.sourceId || "";
      const next = patchSandboxRowInConfig(draft?.next || workspaceConfig, objectId, resolved.rowIndex, {
        [draftFieldName]: draftGraph,
        status,
        lastTested: testedAt,
        lastRunId,
        lastSourceId,
        lastResponse: responseText,
        orchestrationDraftStatus: pass ? "tested" : "failed",
        orchestrationDraftLastTested: testedAt,
        orchestrationDraftLastRunId: lastRunId,
        orchestrationDraftLastResponse: responseText,
        orchestrationDraftTestPassed: pass,
        orchestrationDraftTestedConfig: pass ? draftGraph : "",
      });
      await persistWorkspace(next);
      setDirty(false);
      setRunMessage(pass ? "Draft test passed. Publish is now available." : redactSecretsFromText(payload.response?.error || payload.error || "Draft test failed. Publish remains blocked."));
    } catch (err) {
      setRunMessage(redactSecretsFromText(err.message || "Sandbox run failed"));
    } finally {
      setRunning(false);
    }
  }

  function openTraceMode() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("run");
    router.push(`/workflows?${params.toString()}`);
    setSidecarMode("trace");
  }

  function handleTestClick() {
    if (runInputSchema.requiresInput) {
      setRunSetupOpen(true);
      setSelectedNodeId("");
      setAddTarget(null);
      return;
    }
    runSandbox();
  }

  async function handleRunWithInputs(runInputs) {
    setRunSetupOpen(false);
    await runSandbox({ runInputs });
  }

  function openGraphMode() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("run");
    router.push(`/workflows?${params.toString()}`);
    setSidecarMode("graph");
  }

  function openHistoryMode() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("run");
    router.push(`/workflows?${params.toString()}`);
    setSidecarMode("history");
  }

  function startFromRegistry() {
    if (!registryRow) return;
    setOrchestrationGraph(buildDefaultOrchestrationGraphFromRegistry(registryRow));
    setSelectedNodeId("input");
    setDirty(true);
  }

  function startBlank() {
    setOrchestrationGraph(buildBlankOrchestrationGraphShell());
    setSelectedNodeId("input");
    setDirty(true);
  }

  function startAgentSwarm() {
    const graph = buildDefaultAgentSwarmGraph({
      agentHost: String(sandboxRow?.agentHost || "").trim()
    });
    setOrchestrationGraph(graph);
    setSelectedNodeId("orchestrator");
    setConfigTab("swarm");
    setDirty(true);
  }

  function applyPastedGraph(text) {
    const parsed = parseOrchestrationGraph(text);
    if (parsed) {
      setOrchestrationGraph(parsed);
      setDirty(true);
    }
  }

  function addNextNode() {
    if (!nextNodeId) return;
    setOrchestrationGraph((g) => addCanonicalNodeToGraph(
      g || buildBlankOrchestrationGraphShell(),
      nextNodeId,
      registryRow || {},
    ));
    setSelectedNodeId(nextNodeId);
    setDirty(true);
  }

  function insertActionNode(action) {
    const node = makeWorkflowNode(action, workspaceConfig, orchestrationGraph);
    setOrchestrationGraph((g) => insertWorkflowNode(g, node, addTarget || {}));
    setSelectedNodeId(node.id);
    setConfigTab("node");
    setAddTarget(null);
    setDirty(true);
  }

  function handleNodeConfigChange(configPatch) {
    if (!selectedNodeId) return;
    const { __nodePatch, ...configOnly } = configPatch || {};
    setOrchestrationGraph((g) => {
      const updated = updateGraphNode(g, selectedNodeId, configOnly);
      if (!__nodePatch || typeof __nodePatch !== "object") return updated;
      const parsed = parseOrchestrationGraph(updated) || updated;
      return {
        ...parsed,
        nodes: (Array.isArray(parsed?.nodes) ? parsed.nodes : []).map((node) => (
          String(node.id) === selectedNodeId ? { ...node, ...__nodePatch } : node
        ))
      };
    });
    setDirty(true);
  }

  function deleteSelectedNode() {
    if (!selectedNodeId) return;
    const label = selectedNode?.label || selectedNodeId;
    const first = window.confirm(`Delete node "${label}" from the draft workflow?`);
    if (!first) return;
    const second = window.confirm("Confirm deletion. This changes the saved draft only and will not affect the published execution version until Publish.");
    if (!second) return;
    setOrchestrationGraph((g) => removeWorkflowNode(g, selectedNodeId));
    setSelectedNodeId("");
    setConfigTab("node");
    setDirty(true);
  }

  function handleConnectorAction(payload) {
    if (payload?.action === "add-step") {
      setAddTarget({ from: String(payload.from || ""), to: String(payload.to || "") });
      setSelectedNodeId("");
      setConfigTab("node");
      return;
    }
    if (payload?.action === "delete-edge-request") {
      setAddTarget(null);
      setSelectedNodeId("");
      setRunMessage("Edge deletion requires confirmation and is not applied from the canvas.");
      return;
    }
    const { nodeId, tab } = resolveConnectorAction(payload);
    setSelectedNodeId(nodeId);
    setConfigTab(tab);
  }

  const label = sandboxRow?.Name || rowId || "Workflow";
  const lifecycle = String(sandboxRow?.lifecycleStatus || "draft").trim();
  const version = String(sandboxRow?.version || "1").trim();
  const nodeCount = Array.isArray(orchestrationGraph?.nodes) ? orchestrationGraph.nodes.length : 0;
  const totalSteps = Math.max(nodeCount, 1);
  const orderedNodes = orchestrationGraph?.nodes || [];
  const currentGraphSerialized = graphUnset ? "" : serializeOrchestrationGraph(orchestrationGraph);
  const draftPassed = sandboxRow?.orchestrationDraftTestPassed === true || String(sandboxRow?.orchestrationDraftTestPassed || "") === "true";
  const publishReady = draftPassed && String(sandboxRow?.orchestrationDraftTestedConfig || "") === currentGraphSerialized && !dirty;
  const savedDraftValue = String(sandboxRow?.[draftFieldName] || "").trim();
  const draftStatus = String(sandboxRow?.orchestrationDraftStatus || "").trim();
  const hasSavedDraft = Boolean(savedDraftValue) && draftStatus !== "published" && graphHasNodes(parseOrchestrationGraph(savedDraftValue));
  const isDraftMode = dirty || hasSavedDraft;
  const canTest = !graphUnset && !graphBlankShell && Boolean(sandboxRow) && !Boolean(graphError);
  const showDiscardDraft = isDraftMode;
  const showPublish = isDraftMode || publishReady;
  const showSaveDraft = dirty && !graphUnset;
  const workflowModeLabel = isDraftMode ? "draft" : lifecycle || "live";

  return (
    <main className="workspace-builder dm-workflow-page">
      <WorkspaceRail
        workspaceConfig={workspaceConfig}
        authority={authority}
        helperOpen={false}
        onConfigChange={(nextConfig) => setWorkspaceConfig(nextConfig)}
        onOpenHelper={() => router.push("/data-model?helper=open")}
        onOpenThread={(row) => router.push(`/data-model?thread=${encodeURIComponent(row.id)}`)}
      />
      <section className="workspace-surface dm-workflow-surface">
        <header className="workspace-toolbar dm-workflow-toolbar">
          <div className="dm-workflow-titlebar">
            <span className="dm-workflow-title-muted">Workflows</span>
            <span className="dm-workflow-title-separator">/</span>
            <h1>{label}</h1>
            <span className="dm-workflow-count">({nodeCount}/{totalSteps}) · v{version} · {workflowModeLabel}</span>
          </div>
          <div className="dm-workflow-toolbar-actions">
            <button
              type="button"
              className="dm-workflow-icon-btn"
              aria-label="Navigate to next Workflow"
              onClick={() => {
                if (!orderedNodes.length) return;
                const index = Math.max(0, orderedNodes.findIndex((node) => String(node.id) === selectedNodeId));
                const next = orderedNodes[(index + 1) % orderedNodes.length];
                setSelectedNodeId(String(next?.id || ""));
                setAddTarget(null);
              }}
            >
              <ChevronDown size={14} />
            </button>
            <button
              type="button"
              className="dm-workflow-icon-btn"
              aria-label="Navigate to previous Workflow"
              onClick={() => {
                if (!orderedNodes.length) return;
                const index = Math.max(0, orderedNodes.findIndex((node) => String(node.id) === selectedNodeId));
                const prev = orderedNodes[(index - 1 + orderedNodes.length) % orderedNodes.length];
                setSelectedNodeId(String(prev?.id || ""));
                setAddTarget(null);
              }}
            >
              <ChevronUp size={14} />
            </button>
            {showDiscardDraft && (
              <button
                type="button"
                className="dm-workflow-chip-btn"
                disabled={saving || running || publishing}
                onClick={discardDraft}
              >
                Discard Draft
              </button>
            )}
            {canTest && (
              <button type="button" className="dm-workflow-chip-btn" disabled={running || saving || publishing} onClick={handleTestClick}>
              <Play size={13} /> {running ? "Running" : runInputSchema.requiresInput ? "Test with inputs" : "Test"}
              </button>
            )}
            {showPublish && (
              <button
                type="button"
                className="dm-workflow-chip-btn"
                disabled={publishing || saving || running || !publishReady || Boolean(graphError) || graphUnset}
                onClick={publishGraph}
                title={publishReady ? "Publish tested draft" : "Save and pass Test before publishing"}
              >
                <Power size={13} /> {publishing ? "Publishing" : "Publish"}
              </button>
            )}
            <button type="button" className="dm-workflow-chip-btn" disabled={!sandboxRow} onClick={openTraceMode}>
              <History size={13} /> See Runs
            </button>
            <button type="button" className="dm-workflow-chip-btn" disabled={!sandboxRow || !orchestrationDeltas.length} onClick={openHistoryMode}>
              <GitBranch size={13} /> Publish history
            </button>
            {sidecarMode === "trace" && (
              <button type="button" className="dm-workflow-chip-btn" onClick={openGraphMode}>
                Edit graph
              </button>
            )}
            {sidecarMode === "history" && (
              <button type="button" className="dm-workflow-chip-btn" onClick={openGraphMode}>
                Edit graph
              </button>
            )}
            {showSaveDraft && (
              <button
                type="button"
                className="dm-workflow-chip-btn"
                disabled={saving || running || publishing || Boolean(graphError) || graphUnset}
                onClick={saveGraph}
              >
                <Save size={13} /> {saving ? "Saving" : "Save draft"}
              </button>
            )}
            <Link href={`/data-model?object=${encodeURIComponent(objectId)}`} className="dm-workflow-icon-btn" aria-label="Back to Data Model">
              <X size={14} />
            </Link>
          </div>
        </header>

        {templateBanner ? (
          <div
            className={"workspace-template-context-banner" + (templateBanner.ready ? "" : " is-warn")}
            role="note"
          >
            <span>
              {templateBanner.ready
                ? `Provider connected via Nango${templateBanner.providerConfigKey ? ` (${templateBanner.providerConfigKey})` : ""}. Ready to run.`
                : "Connect your provider through Nango before running this workflow."}
            </span>
            <Link href={templateBanner.backHref} className="workspace-template-context-link">
              <span>{templateBanner.ready ? "Manage connection" : "Open Nango panel"}</span>
            </Link>
          </div>
        ) : null}

        {loading ? (
          <p className="dm-workflow-empty">Loading workflow…</p>
        ) : error ? (
          <p className="dm-workflow-empty dm-workflow-error">{error}</p>
        ) : !objectId || !rowId ? (
          <p className="dm-workflow-empty">Missing workflow object or row in the URL.</p>
        ) : !sandboxRow ? (
          <p className="dm-workflow-empty">
            Sandbox row not found. The workflow shortcut may reference a removed row.
          </p>
        ) : sidecarMode === "trace" ? (
          <OrchestrationRunTracePanel
            row={sandboxRow}
            objectId={objectId}
            fieldName="lastResponse"
            selectedRunId={runId}
            onBack={openGraphMode}
            onOpenGraph={openGraphMode}
            onReplay={runSandbox}
            running={running}
          />
        ) : sidecarMode === "history" ? (
          <OrchestrationDeltaHistoryPanel
            deltas={orchestrationDeltas}
            onBack={openGraphMode}
          />
        ) : (
          <div className={`dm-orchestration-sidecar dm-workflow-orchestration${selectedNode || addTarget || runSetupOpen ? " has-panel" : ""}`}>
            <div className="dm-orchestration-sidecar__body">
              <div className="dm-orchestration-sidecar__canvas-col">
                {graphUnset ? (
                  <OrchestrationGraphEmptyCanvas
                    disabled={false}
                    onStartFromRegistry={registryRow ? startFromRegistry : undefined}
                    onStartBlank={startBlank}
                    onStartAgentSwarm={startAgentSwarm}
                    onPasteGraph={applyPastedGraph}
                  />
                ) : graphBlankShell ? (
                  <div className="dm-orchestration-canvas dm-orchestration-canvas--blank-shell">
                    <p className="dm-orchestration-canvas__blank-hint">Add first node</p>
                    <button type="button" className="dm-btn-outline" onClick={addNextNode}>
                      + Add Input
                    </button>
                  </div>
                ) : (
                  <>
                    <OrchestrationGraphCanvas
                      graph={orchestrationGraph}
                      selectedNodeId={selectedNodeId}
                      onSelectNode={(node) => {
                        setSelectedNodeId(String(node?.id || ""));
                        setConfigTab("node");
                      }}
                      onConnectorAction={handleConnectorAction}
                      statusLabel={isDraftMode ? "Draft" : "Live"}
                    />
                    {nextNodeId && (
                      <button type="button" className="dm-btn-outline dm-orchestration-canvas__add-node" onClick={addNextNode}>
                        + Add {nextNodeId === "api-request" ? "API Registry" : nextNodeId}
                      </button>
                    )}
                  </>
                )}
              </div>
              {graphUiState === "populated" && runSetupOpen && (
                <div className="dm-orchestration-sidecar__config-col">
                  <div className="dm-workflow-panel-head">
                    <button type="button" className="dm-workflow-icon-btn" onClick={() => setRunSetupOpen(false)} aria-label="Close run setup panel">
                      <X size={14} />
                    </button>
                    <span>Run setup</span>
                    <em>Manual inputs</em>
                  </div>
                  <RunSetupPanel
                    schema={runInputSchema}
                    running={running}
                    onSubmit={handleRunWithInputs}
                    onCancel={() => setRunSetupOpen(false)}
                  />
                </div>
              )}
              {graphUiState === "populated" && !runSetupOpen && addTarget && (
                <div className="dm-orchestration-sidecar__config-col">
                  <div className="dm-workflow-panel-head">
                    <button type="button" className="dm-workflow-icon-btn" onClick={() => setAddTarget(null)} aria-label="Close side panel">
                      <X size={14} />
                    </button>
                    <span>Select Action</span>
                    <em>Workflow step</em>
                  </div>
                  <WorkflowAddStepPanel
                    target={addTarget}
                    onSelect={insertActionNode}
                  />
                </div>
              )}
              {graphUiState === "populated" && !runSetupOpen && !addTarget && selectedNode && swarmMode && selectedNode?.type === "thinAdapter" && (
                <div className="dm-orchestration-sidecar__config-col">
                  <div className="dm-workflow-panel-head">
                    <button type="button" className="dm-workflow-icon-btn" onClick={() => setSelectedNodeId("")} aria-label="Close side panel">
                      <X size={14} />
                    </button>
                    <span>Agent swarm</span>
                    <em>agent-swarm-v1</em>
                  </div>
                  <AgentSwarmPanel
                    graph={orchestrationGraph}
                    disabled={false}
                    onGraphChange={(updater) => {
                      setOrchestrationGraph((g) => (typeof updater === "function" ? updater(g) : updater));
                      setDirty(true);
                    }}
                  />
                  {graphError && <p className="dm-orchestration-config__error">{graphError}</p>}
                </div>
              )}
              {graphUiState === "populated" && !runSetupOpen && !addTarget && selectedNode && !(swarmMode && selectedNode?.type === "thinAdapter") && (
                <div className="dm-orchestration-sidecar__config-col">
                  <div className="dm-workflow-panel-head">
                    <button type="button" className="dm-workflow-icon-btn" onClick={() => setSelectedNodeId("")} aria-label="Close side panel">
                      <X size={14} />
                    </button>
                    <span>{selectedNode?.label || selectedNode?.id}</span>
                    <em>{selectedNode?.type}</em>
                  </div>
                  <OrchestrationNodeConfigPanel
                    node={selectedNode}
                    registryRow={registryRow}
                    workspaceConfig={workspaceConfig}
                    sandboxRow={sandboxRow}
                    objectId={objectId}
                    rowName={rowId}
                    onSandboxRowPatch={patchSandboxRuntimeFields}
                    onDeleteNode={deleteSelectedNode}
                    disabled={false}
                    activeTab={configTab}
                    onTabChange={setConfigTab}
                    onConfigChange={handleNodeConfigChange}
                  />
                  {graphError && <p className="dm-orchestration-config__error">{graphError}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {(saveMessage || runMessage) && (
          <p className="dm-workflow-status-msg">{saveMessage || runMessage}</p>
        )}
      </section>
    </main>
  );
}
