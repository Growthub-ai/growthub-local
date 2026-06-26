"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpCircle,
  Bot,
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
import { deriveOrchestrationNodeStatuses } from "@/lib/orchestration-node-status";
import {
  nodeSandboxRecordRef,
  patchSandboxRowInConfig,
  withGraphSandboxRecordRefs
} from "@/lib/orchestration-publish";
import { OrchestrationGraphCanvas } from "../data-model/components/OrchestrationGraphCanvas.jsx";
import { OrchestrationGraphEmptyCanvas } from "../data-model/components/OrchestrationGraphEmptyCanvas.jsx";
import { OrchestrationNodeConfigPanel } from "../data-model/components/OrchestrationNodeConfigPanel.jsx";
import { OrchestrationRunTracePanel } from "../data-model/components/OrchestrationRunTracePanel.jsx";
import { AgentSwarmPanel } from "../data-model/components/AgentSwarmPanel.jsx";
import { RunSetupPanel } from "./RunSetupPanel.jsx";
import { describeRunInputMetadataItems, discoverRunInputSchema } from "@/lib/orchestration-run-inputs";
import { selectWorkflowNodeInputSchema } from "@/lib/workspace-metadata-selectors";
import { deriveProvenance, hasConnectionId, readUiCacheFlag } from "@/lib/workspace-activation";
import { ApiRegistryCreationCockpit } from "../data-model/components/ApiRegistryCreationCockpit.jsx";
import { deriveSandboxServerlessState } from "@/lib/sandbox-serverless-flow";
import { deriveServerlessUpgradeState, SERVERLESS_UPGRADE_DISMISS_FLAG } from "@/lib/serverless-upgrade";
import { UPSTASH_QSTASH_INTEGRATION_ID, deriveWorkspaceAddOnsState } from "@/lib/workspace-add-ons";

// Set a flag on the governed workspace-ui-cache "activation" row (pure helper,
// same transform the rail/lens one-time dismisses use).
function withUiCacheFlag(workspaceConfig, flag, value) {
  const dm = workspaceConfig?.dataModel && typeof workspaceConfig.dataModel === "object" ? workspaceConfig.dataModel : {};
  const objects = Array.isArray(dm.objects) ? dm.objects : [];
  const existing = objects.find((o) => o?.id === "workspace-ui-cache");
  const baseRow = (existing?.rows || []).find((r) => r?.id === "activation") || { id: "activation" };
  const nextRow = { ...baseRow, [flag]: value };
  const nextCache = existing
    ? { ...existing, rows: [nextRow, ...(existing.rows || []).filter((r) => r?.id !== "activation")] }
    : {
        id: "workspace-ui-cache", label: "Workspace UI Cache", source: "Workspace UI Cache",
        objectType: "custom", columns: ["id", flag], rows: [nextRow],
        binding: { mode: "manual", source: "Workspace UI Cache" },
      };
  const nextObjects = existing
    ? objects.map((o) => (o?.id === "workspace-ui-cache" ? nextCache : o))
    : [...objects, nextCache];
  return { ...workspaceConfig, dataModel: { ...dm, objects: nextObjects } };
}

// Read the sandbox-run NDJSON delta stream (same shape SwarmRunCockpit
// consumes): push each growthub-sandbox-run-delta-v1 event to `onEvent` for
// live canvas hydration, and return the sandbox-run.final payload (the run
// result). Falls back to plain JSON when the response is not a stream.
async function readSandboxRunStream(response, onEvent) {
  if (!response?.body || typeof response.body.getReader !== "function") {
    return response.json().catch(() => null);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload = null;
  const handle = async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const event = JSON.parse(trimmed);
      if (event.kind !== "growthub-sandbox-run-delta-v1") return;
      if (event.type === "sandbox-run.final") finalPayload = event.payload || finalPayload;
      else if (typeof onEvent === "function") {
        onEvent((prev) => [...prev, event].slice(-300));
        await new Promise((resolve) => setTimeout(resolve, 90));
      }
    } catch {
      // Ignore malformed cosmetic chunks; the final payload still arrives.
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) await handle(line);
  }
  if (buffer.trim()) await handle(buffer);
  return finalPayload;
}

// Workspace Metadata Graph V1 — read-only dependency metadata for workflow
// sidecars. The runtime path (sandbox-run, publish, draft/live) is
// unchanged; this only exposes typed dependency descriptors so the sidecar
// can render "this node requires N inputs from M source nodes".
const WORKFLOW_METADATA_SELECTORS = Object.freeze({
  describeRunInputMetadataItems,
  selectWorkflowNodeInputSchema
});

function resolveRegistryRowForSandbox(workspaceConfig, sandboxRow) {
  return resolveRegistryRefForSandbox(workspaceConfig, sandboxRow)?.row || null;
}

function resolveRegistryRefForSandbox(workspaceConfig, sandboxRow) {
  const graph = parseOrchestrationGraph(sandboxRow?.orchestrationConfig || sandboxRow?.orchestrationGraph);
  const apiNode = graph?.nodes?.find((n) => n?.type === "api-registry-call");
  const registryId = String(
    apiNode?.config?.registryId || apiNode?.config?.integrationId || sandboxRow?.schedulerRegistryId || ""
  ).trim();
  if (!workspaceConfig) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  let firstRegistryRow = null;
  let firstRegistryObject = null;
  for (const objectItem of objects) {
    if (objectItem?.objectType !== "api-registry") continue;
    const rows = Array.isArray(objectItem.rows) ? objectItem.rows : [];
    const firstRow = rows.find((r) => String(r?.integrationId || "").trim());
    if (!firstRegistryRow && firstRow) {
      firstRegistryRow = firstRow;
      firstRegistryObject = objectItem;
    }
    if (registryId) {
      const match = rows.find((r) => String(r?.integrationId || "").trim() === registryId);
      if (match) return { object: objectItem, row: match };
    }
  }
  return firstRegistryRow ? { object: firstRegistryObject, row: firstRegistryRow } : null;
}

function WorkflowAddOnChooser({ addOn, disabled, onUseQstash, onSetupQstash, onSetupCustom }) {
  return (
    <div className="dm-workflow-addon-choice-list">
      <section className="dm-api-action-card dm-workflow-installed-addon">
        <div className="dm-api-action-card-body">
          <p className="dm-api-action-card-eyebrow">{addOn ? "Verified workflow add-on" : "Workflow add-on"}</p>
          <h3>Upstash QStash/Workflow</h3>
          <p>
            {addOn
              ? "Bind the verified workspace QStash scheduler to this workflow and switch it to serverless."
              : "Install and sync QStash in Workspace Add-ons first; the canvas only binds verified scheduler rows."}
          </p>
          <div className="dm-cockpit-fields">
            <span className="dm-cockpit-field"><b>registry</b>{addOn?.integrationId || UPSTASH_QSTASH_INTEGRATION_ID}</span>
            <span className="dm-cockpit-field"><b>status</b>{addOn?.syncStatus || "setup required"}</span>
            <span className="dm-cockpit-field"><b>region</b>{addOn?.region || "pending"}</span>
          </div>
        </div>
        <div className="dm-api-action-card-actions">
          {addOn ? (
            <button type="button" className="dm-btn-primary-sm dm-api-action-card-cta" disabled={disabled} onClick={onUseQstash}>
              Use for this workflow
            </button>
          ) : (
            <button type="button" className="dm-btn-outline dm-api-action-card-cta" disabled={disabled} onClick={onSetupQstash}>
              Set up QStash
            </button>
          )}
        </div>
      </section>
      <section className="dm-api-action-card dm-workflow-installed-addon">
        <div className="dm-api-action-card-body">
          <p className="dm-api-action-card-eyebrow">Custom</p>
          <h3>Custom scheduler plugin</h3>
          <p>Use a governed API Registry scheduler row and bind it through this sandbox row's schedulerRegistryId field.</p>
        </div>
        <div className="dm-api-action-card-actions">
          <button type="button" className="dm-btn-outline dm-api-action-card-cta" disabled={disabled} onClick={onSetupCustom}>
            Configure custom
          </button>
        </div>
      </section>
    </div>
  );
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
  const [liveRunEvents, setLiveRunEvents] = useState([]);
  const [runMessage, setRunMessage] = useState("");
  const [sidecarMode, setSidecarMode] = useState(runId ? "trace" : "graph");

  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [addTarget, setAddTarget] = useState(null);
  const [configTab, setConfigTab] = useState("node");
  const [graphError, setGraphError] = useState("");
  const [orchestrationGraph, setOrchestrationGraph] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [runSetupOpen, setRunSetupOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [serverlessSignals, setServerlessSignals] = useState({ configuredEnvRefs: [], persistenceAdapters: [] });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace/env-status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : {}))
      .then((payload) => {
        if (cancelled) return;
        setServerlessSignals({
          configuredEnvRefs: Array.isArray(payload.configuredEnvRefs) ? payload.configuredEnvRefs : [],
          persistenceAdapters: Array.isArray(payload.persistenceAdapters) ? payload.persistenceAdapters : [],
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [objectId, rowId]);

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

  // Reset live per-node deltas when the active workflow changes, so a prior
  // run's stream never bleeds onto a different workflow's canvas — the new
  // workflow settles from its own persisted nodeTrace until it is run.
  useEffect(() => { setLiveRunEvents([]); }, [objectId, rowId]);

  const resolved = useMemo(
    () => (workspaceConfig ? findSandboxRowByWorkflowRef(workspaceConfig, objectId, rowId) : { object: null, row: null, rowIndex: -1 }),
    [workspaceConfig, objectId, rowId]
  );

  const sandboxRow = resolved.row;

  // Per-node Workflow Canvas pill status — GENERAL orchestration (not swarm).
  // Live from the streamed orchestration.node.* deltas while a run is in
  // flight; settled from the persisted run record's nodeTrace once complete.
  const runNodeStatuses = useMemo(() => {
    let record = sandboxRow?.lastResponse;
    if (typeof record === "string") {
      try { record = JSON.parse(record); } catch { record = null; }
    }
    const map = deriveOrchestrationNodeStatuses({ events: liveRunEvents, record });
    return Object.keys(map).length ? map : null;
  }, [liveRunEvents, sandboxRow]);
  const hasGraphValue = (value) => Boolean(parseOrchestrationGraph(value));
  const effectiveFieldName = hasGraphValue(sandboxRow?.[fieldName])
    ? fieldName
    : hasGraphValue(sandboxRow?.orchestrationConfig)
      ? "orchestrationConfig"
      : hasGraphValue(sandboxRow?.orchestrationGraph)
        ? "orchestrationGraph"
        : (fieldName || "orchestrationConfig");
  const draftFieldName = effectiveFieldName === "orchestrationConfig" ? "orchestrationDraftConfig" : "orchestrationDraftGraph";
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
    const parsed = graphHasNodes(draftParsed) || !graphHasNodes(publishedParsed) ? draftParsed : publishedParsed;
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
    const node = orchestrationGraph.nodes.find((n) => String(n.id) === selectedNodeId) || null;
    if (!node) return null;
    return {
      ...node,
      config: {
        ...(node.config || {}),
        sandboxRecordRef: nodeSandboxRecordRef(objectId, rowId, node.id)
      }
    };
  }, [orchestrationGraph, selectedNodeId, objectId, rowId]);

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
    return graphUnset ? "" : serializeOrchestrationGraph(withGraphSandboxRecordRefs(orchestrationGraph, objectId, rowId));
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
    // Publish is server-authoritative: POST /api/workspace/workflow/publish
    // verifies the saved draft + passing test against the persisted row and
    // owns the version bump, delta record, and draft → live promotion.
    // Direct PATCH of live workflow fields is rejected by the runtime policy.
    const serialized = serializeCurrentGraph();
    const savedDraft = String(sandboxRow?.[draftFieldName] || "");
    if (dirty || serialized !== savedDraft) {
      setSaveMessage("Publish blocked. Save this draft first — publish promotes the saved, tested draft.");
      return;
    }
    setPublishing(true);
    setSaveMessage("");
    try {
      const res = await fetch("/api/workspace/workflow/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectId, name: rowId, field: effectiveFieldName }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "Publish failed");
      }
      setWorkspaceConfig(payload.workspaceConfig || workspaceConfig);
      setDirty(false);
      setSaveMessage(`Published orchestration config v${payload.version}.`);
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
    setLiveRunEvents([]);
    try {
      const draft = await saveDraft({ orchestrationDraftStatus: "testing" });
      const draftGraph = draft?.serialized || serializeCurrentGraph();
      const body = { objectId, name: rowId, useDraft: true, draftGraph, stream: true };
      if (runInputs) body.runInputs = runInputs;
      const res = await fetch("/api/workspace/sandbox-run", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify(body),
      });
      // Consume the NDJSON delta stream: per-node orchestration.node.* events
      // hydrate the canvas pills live; the sandbox-run.final payload is the
      // run result we persist. Falls back to plain JSON if not a stream.
      const payload = (await readSandboxRunStream(res, setLiveRunEvents)) || {};
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
    const recordRef = nodeSandboxRecordRef(objectId, rowId, selectedNodeId);
    setOrchestrationGraph((g) => {
      const updated = updateGraphNode(g, selectedNodeId, {
        ...configOnly,
        sandboxRecordRef: recordRef
      });
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

  // Serverless upgrade — same derivation + cockpit as the sandbox/API lanes.
  const upgradeState = deriveServerlessUpgradeState(workspaceConfig || {}, {
    dismissed: readUiCacheFlag(workspaceConfig || {}, SERVERLESS_UPGRADE_DISMISS_FLAG),
  });
  const serverlessState = sandboxRow
    ? deriveSandboxServerlessState({
        sandboxRow,
        workspaceConfig: workspaceConfig || {},
        configuredEnvRefs: serverlessSignals.configuredEnvRefs,
        persistenceAdapters: serverlessSignals.persistenceAdapters,
      })
    : null;
  const addOnsState = deriveWorkspaceAddOnsState(workspaceConfig || {});
  const isServerlessWorkflow = Boolean(serverlessState?.isServerless);
  const showServerlessUpgrade = String(sandboxRow?.adapter || "").trim() !== "local-intelligence";

  async function patchSandboxAndPersist(fields) {
    if (resolved.rowIndex < 0 || !objectId || !workspaceConfig) return;
    try {
      const next = patchSandboxRowInConfig(workspaceConfig, objectId, resolved.rowIndex, fields);
      await persistWorkspace(next);
      setSaveMessage(fields.runLocality === "serverless"
        ? "Upgraded to serverless. Link a scheduler and configure persistence to close the loop."
        : fields.runLocality === "local"
          ? "Reverted to local execution."
          : "Saved.");
    } catch (err) {
      setSaveMessage(err.message || "Failed to save");
    }
  }

  async function handleUpgradeAction(action) {
    if (!action) return;
    if (action.id === "toggle-locality") {
      if (isServerlessWorkflow) {
        await patchSandboxAndPersist({ runLocality: "local" });
        return;
      }
      setUpgradeOpen(true);
    } else if (action.id === "open-settings") {
      router.push(action.href || "/settings");
    } else if (action.id === "link-scheduler") {
      const registryRef = resolveRegistryRefForSandbox(workspaceConfig, sandboxRow);
      if (registryRef?.object?.id && registryRef?.row?.integrationId) {
        router.push(`/data-model?object=${encodeURIComponent(registryRef.object.id)}&row=${encodeURIComponent(registryRef.row.integrationId)}`);
      } else {
        router.push(`/data-model?object=${encodeURIComponent(objectId)}&row=${encodeURIComponent(rowId)}`);
      }
    } else if (action.id === "edit-adapter") {
      // Full scheduler/adapter config lives on the sandbox object's drawer.
      router.push(`/data-model?object=${encodeURIComponent(objectId)}&row=${encodeURIComponent(rowId)}`);
    }
  }

  async function useInstalledQstashWorkflowAddOn() {
    // Bind requires an installed+verified QStash product. The bind itself
    // CREATES this workflow row's serverless schedule first; we only flip the
    // row to serverless if the provider confirmed the schedule. This is a
    // stronger guarantee than a static capability check: serverless is never
    // claimed without a live schedule whose destination runs THIS row.
    if (resolved.rowIndex < 0 || !objectId || !rowId || !workspaceConfig || !addOnsState.qstashWorkflow) return;
    let scheduled = false;
    try {
      const response = await fetch("/api/workspace/add-ons/upstash/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: "upstash-qstash",
          objectId,
          rowId,
          region: addOnsState.qstashWorkflow.region || "us-east-1",
          version: String(sandboxRow?.version || "v1"),
          workspaceId: workspaceConfig?.id || "workspace",
        }),
      });
      scheduled = response.ok;
    } catch (error) {
      console.warn(error);
    }
    if (!scheduled) {
      // Could not install a schedule (missing token / read-only / provider) —
      // keep the workflow local and send the operator to Add-ons to finish setup.
      router.push("/settings/add-ons");
      return;
    }
    const adapterId = String(sandboxRow?.adapter || "").trim();
    await patchSandboxAndPersist({
      runLocality: "serverless",
      schedulerRegistryId: UPSTASH_QSTASH_INTEGRATION_ID,
      adapter: ["local-agent-host", "local-intelligence"].includes(adapterId) ? "local-process" : (adapterId || "local-process"),
    });
  }

  function openQstashSetup() {
    router.push("/settings/add-ons");
  }

  function openCustomSchedulerSetup() {
    router.push(`/data-model?object=${encodeURIComponent(objectId)}&row=${encodeURIComponent(rowId)}&field=${encodeURIComponent("schedulerRegistryId")}`);
  }

  async function dismissUpgradeOnboarding() {
    if (!workspaceConfig) return;
    try {
      await persistWorkspace(withUiCacheFlag(workspaceConfig, SERVERLESS_UPGRADE_DISMISS_FLAG, true));
    } catch {
      /* non-fatal */
    }
  }

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
              <ArrowDown size={13} />
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
              <ArrowUp size={13} />
            </button>
            {sandboxRow && showServerlessUpgrade && (
              <button
                type="button"
                className={"dm-workflow-icon-btn dm-workflow-upgrade-btn" + (isServerlessWorkflow ? " is-serverless" : (upgradeState.showOnboarding ? " is-pulse" : ""))}
                aria-label={isServerlessWorkflow ? "Serverless workflow — review persistence & scheduling" : "Choose workflow add-on"}
                data-tooltip={isServerlessWorkflow ? "Serverless — review persistence & scheduling" : "Choose QStash or custom scheduler"}
                aria-pressed={upgradeOpen}
                onClick={() => setUpgradeOpen((open) => !open)}
              >
                <ArrowUpCircle size={14} />
              </button>
            )}
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
            <button
              type="button"
              className="dm-workflow-chip-btn"
              onClick={() => {
                if (sandboxRow) openTraceMode();
              }}
            >
              <History size={13} /> See Runs
            </button>
            {sidecarMode === "trace" && (
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

        {/* One-time serverless upgrade onboarding — shows only when the operator
            has workflows but none are serverless, and hasn't dismissed it. */}
        {sandboxRow && showServerlessUpgrade && !upgradeOpen && upgradeState.showOnboarding ? (
          <div className="workspace-template-context-banner dm-workflow-upgrade-nudge" role="note">
            <div>
              <strong>{upgradeState.headline}</strong>
              <span style={{ display: "block", marginTop: 2 }}>{upgradeState.subheadline}</span>
            </div>
            <div className="dm-workflow-upgrade-nudge-actions">
              {addOnsState.hasQstashWorkflow ? (
                <button type="button" className="dm-btn-primary-sm" onClick={() => setUpgradeOpen(true)}>
                  Review installed add-on
                </button>
              ) : (
                <button type="button" className="dm-btn-primary-sm" onClick={() => setUpgradeOpen(true)}>
                  Choose workflow add-on
                </button>
              )}
              <button type="button" className="dm-btn-ghost" onClick={dismissUpgradeOnboarding}>Not now</button>
            </div>
          </div>
        ) : null}

        {/* Workflow Canvas consumes installed add-ons only. Marketplace browsing
            and custom install start in Workspace Settings -> Add-ons. */}
        {sandboxRow && showServerlessUpgrade && upgradeOpen && serverlessState ? (
          <div className="dm-workflow-upgrade-panel">
            <div className="dm-workflow-upgrade-panel-head">
              <span className="dm-api-action-card-eyebrow">{isServerlessWorkflow ? "Persistence & scheduling" : "Installed add-on"}</span>
              <button type="button" className="dm-workflow-icon-btn" aria-label="Close upgrade panel" onClick={() => { setUpgradeOpen(false); dismissUpgradeOnboarding(); }}>
                <X size={14} />
              </button>
            </div>
            {isServerlessWorkflow ? (
              <ApiRegistryCreationCockpit
                state={serverlessState}
                onAction={handleUpgradeAction}
                disabled={saving || publishing || running}
                eyebrow="Serverless workflow"
              />
            ) : (
              <WorkflowAddOnChooser
                addOn={addOnsState.qstashWorkflow}
                disabled={saving || publishing || running}
                onUseQstash={useInstalledQstashWorkflowAddOn}
                onSetupQstash={openQstashSetup}
                onSetupCustom={openCustomSchedulerSetup}
              />
            )}
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
                      nodeStatuses={runNodeStatuses}
                      onNodeStatusClick={(node) => { setSelectedNodeId(String(node?.id || "")); openTraceMode(); }}
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
                    objectId={objectId}
                    rowName={rowId}
                    sandboxRow={sandboxRow}
                    onSandboxRowPatch={patchSandboxRuntimeFields}
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
