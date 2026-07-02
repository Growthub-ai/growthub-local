"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
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
import { describeRunInputMetadataItems, discoverRunInputSchema, RUN_INPUTS_KIND } from "@/lib/orchestration-run-inputs";
import { selectWorkflowNodeInputSchema } from "@/lib/workspace-metadata-selectors";
import { deriveProvenance, hasConnectionId, readUiCacheFlag } from "@/lib/workspace-activation";
import { ApiRegistryCreationCockpit } from "../data-model/components/ApiRegistryCreationCockpit.jsx";
import { deriveSandboxServerlessState } from "@/lib/sandbox-serverless-flow";
import { deriveServerlessUpgradeState, SERVERLESS_UPGRADE_DISMISS_FLAG } from "@/lib/serverless-upgrade";
import { UPSTASH_QSTASH_INTEGRATION_ID, deriveWorkspaceAddOnsState, orchestrationGraphContentEquals } from "@/lib/workspace-add-ons";
import { scanServerlessReadiness, readinessFieldFlags } from "@/lib/serverless-readiness";

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

function resolveSchedulerRegistryRows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const rows = [];
  for (const objectItem of objects) {
    if (objectItem?.objectType !== "api-registry") continue;
    for (const row of Array.isArray(objectItem.rows) ? objectItem.rows : []) {
      if (String(row?.executionLane || "").trim() !== "serverless-scheduler") continue;
      const integrationId = String(row?.integrationId || "").trim();
      if (integrationId) rows.push({ object: objectItem, row, integrationId });
    }
  }
  return rows;
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

const SCHEDULE_CADENCE_OPTIONS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

const SCHEDULE_WEEKDAY_OPTIONS = [
  { id: "1", label: "Monday" },
  { id: "2", label: "Tuesday" },
  { id: "3", label: "Wednesday" },
  { id: "4", label: "Thursday" },
  { id: "5", label: "Friday" },
  { id: "6", label: "Saturday" },
  { id: "0", label: "Sunday" },
];

const SCHEDULE_HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const id = String(hour).padStart(2, "0");
  return { id, label: id };
});

const SCHEDULE_MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const minute = String(index * 5).padStart(2, "0");
  return { id: minute, label: minute };
});

const SCHEDULE_MONTH_DAY_OPTIONS = Array.from({ length: 28 }, (_, index) => {
  const day = String(index + 1);
  return { id: day, label: day };
});

function splitScheduleTime(value) {
  const [rawHour, rawMinute] = String(value || "09:00").split(":");
  const hour = Math.min(23, Math.max(0, Number(rawHour) || 0));
  const minute = Math.min(59, Math.max(0, Number(rawMinute) || 0));
  return {
    hour: String(hour).padStart(2, "0"),
    minute: String(Math.round(minute / 5) * 5).padStart(2, "0"),
  };
}

function joinScheduleTime(hour, minute) {
  const safeHour = Math.min(23, Math.max(0, Number(hour) || 0));
  const safeMinute = Math.min(59, Math.max(0, Number(minute) || 0));
  return `${String(safeHour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}

function ScheduleTimeControls({ value, onChange }) {
  const { hour, minute } = splitScheduleTime(value);
  return (
    <div className="dm-workflow-schedule-time-grid">
      <label className="dm-orchestration-config__field">
        <span>Hour (UTC)</span>
        <select value={hour} onChange={(event) => onChange(joinScheduleTime(event.target.value, minute))}>
          {SCHEDULE_HOUR_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="dm-orchestration-config__field">
        <span>Minute</span>
        <select value={minute} onChange={(event) => onChange(joinScheduleTime(hour, event.target.value))}>
          {SCHEDULE_MINUTE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function deriveCronFromSchedule({ cadence, time, weekday, monthDay }) {
  const [hourText, minuteText] = String(time || "09:00").split(":");
  const hour = Math.min(23, Math.max(0, Number(hourText) || 0));
  const minute = Math.min(59, Math.max(0, Number(minuteText) || 0));
  if (cadence === "weekly") return `${minute} ${hour} * * ${String(weekday || "1")}`;
  if (cadence === "monthly") return `${minute} ${hour} ${Math.min(28, Math.max(1, Number(monthDay) || 1))} * *`;
  return `${minute} ${hour} * * *`;
}

function describeSchedule({ cadence, time, weekday, monthDay }) {
  const selectedWeekday = SCHEDULE_WEEKDAY_OPTIONS.find((option) => option.id === String(weekday))?.label || "Monday";
  if (cadence === "weekly") return `Runs every ${selectedWeekday} at ${time || "09:00"} UTC.`;
  if (cadence === "monthly") return `Runs on day ${Math.min(28, Math.max(1, Number(monthDay) || 1))} of each month at ${time || "09:00"} UTC.`;
  return `Runs every day at ${time || "09:00"} UTC.`;
}

function buildServerlessScheduleRunInputs({ workflow, cadence, time, weekday, monthDay }) {
  return {
    kind: "growthub-workflow-run-inputs-v1",
    source: "serverless-scheduler",
    values: {
      trigger: "scheduled",
      source: "serverless-scheduler",
      workflow: String(workflow || ""),
      cadence: String(cadence || ""),
      runTimeUtc: String(time || ""),
      weekday: String(weekday || ""),
      monthDay: String(monthDay || "")
    }
  };
}

function WorkflowScheduleModal({
  open,
  addOn,
  workflowName,
  cadence,
  scheduleTime,
  scheduleWeekday,
  scheduleMonthDay,
  errorMessage,
  disabled,
  onCadenceChange,
  onScheduleTimeChange,
  onScheduleWeekdayChange,
  onScheduleMonthDayChange,
  onSubmit,
  onClose,
}) {
  if (!open) return null;
  return (
    <div className="dm-workflow-schedule-backdrop" role="presentation">
      <section className="dm-workflow-schedule-modal" role="dialog" aria-modal="true" aria-label="Configure QStash schedule">
        <header>
          <div>
            <p className="dm-api-action-card-eyebrow">Serverless schedule</p>
            <h3>Use QStash for {workflowName || "this workflow"}</h3>
          </div>
          <button type="button" className="dm-workflow-icon-btn" aria-label="Close schedule modal" onClick={onClose}>
            <X size={14} />
          </button>
        </header>
        <div className="dm-workflow-schedule-body">
          <div className="dm-marketplace-config-summary">
            <div><span>Registry</span><code>{addOn?.integrationId || UPSTASH_QSTASH_INTEGRATION_ID}</code></div>
            <div><span>Region</span><code>{addOn?.region || "pending"}</code></div>
            <div><span>Status</span><code>{addOn?.syncStatus || "setup required"}</code></div>
          </div>
          <label className="dm-marketplace-field">
            <span>Cadence</span>
            <select value={cadence} onChange={(event) => onCadenceChange(event.target.value)}>
              {SCHEDULE_CADENCE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <ScheduleTimeControls value={scheduleTime} onChange={onScheduleTimeChange} />
          {cadence === "weekly" ? (
            <label className="dm-marketplace-field">
              <span>Run day</span>
              <select value={scheduleWeekday} onChange={(event) => onScheduleWeekdayChange(event.target.value)}>
                {SCHEDULE_WEEKDAY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          {cadence === "monthly" ? (
            <label className="dm-marketplace-field">
              <span>Day of month</span>
              <select value={scheduleMonthDay} onChange={(event) => onScheduleMonthDayChange(event.target.value)}>
                {SCHEDULE_MONTH_DAY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="dm-cockpit-step-hint">{describeSchedule({ cadence, time: scheduleTime, weekday: scheduleWeekday, monthDay: scheduleMonthDay })}</p>
          {errorMessage ? <p className="dm-workflow-schedule-error" role="alert">{errorMessage}</p> : null}
          <p className="dm-cockpit-step-hint">This writes the sandbox row to serverless, stores the cadence and trigger input on the workflow trigger, and submits the QStash schedule through the server-owned workspace origin.</p>
        </div>
        <footer>
          <button type="button" className="dm-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="dm-btn-primary-sm" disabled={disabled || !String(scheduleTime || "").trim()} onClick={onSubmit}>
            {disabled ? "Scheduling..." : "Create schedule"}
          </button>
        </footer>
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
  const isData = action.type === "data-action";
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
  // Which lane the canonical RunSetupPanel submits to: "sandbox" (draft test
  // runner — unchanged behavior) or an inbound input mode ("webhook" /
  // "api-request") whose test invocation must ALSO satisfy the workflow's
  // declared run-input schema through the same canonical entry path.
  const [runSetupTarget, setRunSetupTarget] = useState("sandbox");
  // Inbound test-request values — the editable JSON body a webhook / API
  // request test invocation sends through the destination door. Seeded from
  // the input node's samplePayload + the row's schedulerTriggerInput: the SAME
  // two sources the readiness scan's scheduled-input contract
  // (collectAvailableInputKeys) derives from, so what the user tests is what
  // downstream nodes consume. null = not yet edited (re-seed from contract).
  const [inboundTestValuesText, setInboundTestValuesText] = useState(null);
  const [inboundExampleCopied, setInboundExampleCopied] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleCadence, setScheduleCadence] = useState("daily");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleWeekday, setScheduleWeekday] = useState("1");
  const [scheduleMonthDay, setScheduleMonthDay] = useState("1");
  const [scheduleError, setScheduleError] = useState("");
  const [remoteScheduleState, setRemoteScheduleState] = useState({ status: "idle", verified: false, scheduleId: "", proof: "" });
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

  useEffect(() => {
    const scheduleId = String(sandboxRow?.scheduleId || "").trim();
    const rowScheduler = String(sandboxRow?.schedulerRegistryId || "").trim();
    const rowLocality = String(sandboxRow?.runLocality || "").trim();
    if (!objectId || !rowId || rowLocality !== "serverless" || !scheduleId || rowScheduler !== UPSTASH_QSTASH_INTEGRATION_ID) {
      setRemoteScheduleState({ status: "idle", verified: false, scheduleId: "", proof: "" });
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      productId: "upstash-qstash",
      objectId,
      rowId,
      scheduleId,
      region: String(sandboxRow?.schedulerRegion || "us-east-1").trim(),
    });
    setRemoteScheduleState({ status: "checking", verified: false, scheduleId, proof: "" });
    fetch(`/api/workspace/add-ons/upstash/schedule?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}));
        if (cancelled) return;
        setRemoteScheduleState({
          status: res.ok && payload.verified ? "verified" : "missing",
          verified: res.ok && payload.verified === true && String(payload.remoteScheduleId || payload.scheduleId || "").trim() === scheduleId,
          scheduleId,
          proof: payload.proof || payload.error || "",
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setRemoteScheduleState({ status: "error", verified: false, scheduleId, proof: error?.message || "remote schedule verification failed" });
      });
    return () => { cancelled = true; };
  }, [objectId, rowId, sandboxRow?.runLocality, sandboxRow?.schedulerRegistryId, sandboxRow?.scheduleId, sandboxRow?.schedulerRegion]);

  const remoteScheduleVerified = remoteScheduleState.verified === true;

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
    const baseConfig = node.config || {};
    return {
      ...node,
      config: {
        ...baseConfig,
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
    // Content equality, not byte equality: the trigger-bind sync and the
    // canvas serializer format the same graph differently.
    if (dirty || !orchestrationGraphContentEquals(serialized, savedDraft)) {
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

  function findWorkflowRowInConfig(config) {
    return findSandboxRowByWorkflowRef(config, objectId, rowId)?.row || null;
  }

  async function fetchWorkspaceConfigOnce() {
    const res = await fetch("/api/workspace", { cache: "no-store" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Failed to load workspace");
    if (payload.workspaceConfig) setWorkspaceConfig(payload.workspaceConfig);
    return payload.workspaceConfig || null;
  }

  async function waitForScheduledRunProof(messageId) {
    const wanted = String(messageId || "").trim();
    const maxAttempts = 20;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const latestConfig = await fetchWorkspaceConfigOnce();
      const latestRow = findWorkflowRowInConfig(latestConfig);
      const latestMessageId = String(latestRow?.lastScheduledRunMessageId || "").trim();
      const latestStatus = String(latestRow?.lastScheduledRunStatus || "").trim();
      if ((wanted && latestMessageId === wanted) || (!wanted && latestStatus)) return latestRow;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return findWorkflowRowInConfig(workspaceConfig);
  }

  async function runInstalledSchedulerNow() {
    if (!objectId || !rowId || !workspaceConfig || !sandboxRow?.scheduleId || !remoteScheduleVerified) return runSandbox();
    setRunning(true);
    setRunMessage("");
    setLiveRunEvents([]);
    try {
      const triggerInput = JSON.stringify(buildServerlessScheduleRunInputs({
        workflow: rowId,
        cadence: scheduleCadence,
        time: scheduleTime,
        weekday: scheduleWeekday,
        monthDay: scheduleMonthDay,
      }));
      const response = await fetch("/api/workspace/add-ons/upstash/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "run",
          productId: "upstash-qstash",
          objectId,
          rowId,
          region: sandboxRow.schedulerRegion || addOnsState.qstashWorkflow?.region || "us-east-1",
          scheduleId: sandboxRow.scheduleId,
          version: String(sandboxRow?.version || "v1"),
          workspaceId: workspaceConfig?.id || "workspace",
          triggerInput,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Scheduler run could not be published.");
      }
      setRunMessage(payload.messageId ? `Scheduler run published (${payload.messageId}). Waiting for callback proof...` : "Scheduler run published. Waiting for callback proof...");
      const proofRow = await waitForScheduledRunProof(payload.messageId);
      const status = String(proofRow?.lastScheduledRunStatus || "").trim();
      const succeeded = status && Number(status) >= 200 && Number(status) < 300;
      if (succeeded) {
        setRunMessage(`Scheduler run succeeded with HTTP ${status}.`);
      } else if (status) {
        setRunMessage(redactSecretsFromText(`Scheduler run returned HTTP ${status}: ${proofRow?.lastScheduledRunFailureReason || proofRow?.lastScheduledRunBodyPreview || "see run proof"}`));
      } else {
        setRunMessage("Scheduler run was published, but callback proof did not land before the UI timeout.");
      }
    } catch (err) {
      setRunMessage(redactSecretsFromText(err.message || "Scheduler run failed"));
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
      setRunSetupTarget("sandbox");
      setRunSetupOpen(true);
      setSelectedNodeId("");
      setAddTarget(null);
      return;
    }
    runSandbox();
  }

  // The inbound test-request contract: seed values from the input node's
  // samplePayload merged with the row's schedulerTriggerInput — the exact
  // sources collectAvailableInputKeys() (serverless-readiness) builds the
  // scheduled-input contract from, so the seeded test body matches what the
  // readiness scan verified downstream nodes can consume.
  function deriveInboundTestSeed() {
    const seed = {};
    const merge = (raw) => {
      let value = raw;
      if (typeof value === "string" && value.trim()) {
        try { value = JSON.parse(value); } catch { value = null; }
      }
      if (value && typeof value === "object" && !Array.isArray(value)) Object.assign(seed, value);
    };
    const inputNode = (Array.isArray(orchestrationGraph?.nodes) ? orchestrationGraph.nodes : [])
      .find((n) => n?.type === "input" || n?.id === "input" || n?.type === "data-trigger") || null;
    merge(inputNode?.config?.samplePayload);
    merge(sandboxRow?.schedulerTriggerInput);
    return seed;
  }

  // Parse the (possibly edited) inbound test-request body. Returns the values
  // object, or null after surfacing a visible error — never invokes on bad JSON.
  function parseInboundTestValues() {
    const text = inboundTestValuesText != null
      ? inboundTestValuesText
      : JSON.stringify(deriveInboundTestSeed(), null, 2);
    let values = null;
    try {
      values = JSON.parse(String(text || "").trim() || "{}");
    } catch {
      setScheduleError("Test request values must be valid JSON.");
      return null;
    }
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      setScheduleError("Test request values must be a JSON object.");
      return null;
    }
    return values;
  }

  function handleInboundTestClick(inputMode) {
    const values = parseInboundTestValues();
    if (!values) return;
    if (runInputSchema.requiresInput) {
      // Canonical run-input entry path: the workflow declares a run-input
      // schema, so the SAME RunSetupPanel that fronts every execution lane
      // collects those fields; they merge over the request-body seed below.
      setRunSetupTarget(inputMode);
      setRunSetupOpen(true);
      setAddTarget(null);
      return;
    }
    runInboundTestInvocation(inputMode, { kind: RUN_INPUTS_KIND, source: "manual", values, files: [] });
  }

  async function handleRunWithInputs(runInputs) {
    setRunSetupOpen(false);
    if (runSetupTarget === "webhook" || runSetupTarget === "api-request") {
      // Compose the two contracts: the inbound request body (samplePayload /
      // triggerInput contract) under the canonical schema-collected fields.
      const bodyValues = parseInboundTestValues() || {};
      const merged = {
        ...(runInputs && typeof runInputs === "object" ? runInputs : { kind: RUN_INPUTS_KIND, source: "manual", files: [] }),
        values: { ...bodyValues, ...(runInputs?.values || {}) },
      };
      await runInboundTestInvocation(runSetupTarget, merged);
      return;
    }
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
  const liveScheduleBinding = (() => {
    const graph = parseOrchestrationGraph(sandboxRow?.orchestrationGraph || sandboxRow?.orchestrationConfig);
    const node = (Array.isArray(graph?.nodes) ? graph.nodes : []).find((entry) => entry?.type === "input" || entry?.id === "input");
    const schedule = node?.config?.schedule && typeof node.config.schedule === "object" ? node.config.schedule : {};
    return {
      enabled: node?.config?.enabled !== false,
      scheduleId: String(schedule.scheduleId || "").trim(),
      schedulerRegistryId: String(schedule.schedulerRegistryId || "").trim()
    };
  })();
  // Inbound bindings have no remote schedule to read-probe; their equivalent
  // (and stronger) verification is the method-specific durable proof the
  // destination door wrote: a 2xx run of the SAME trigger kind with every
  // downstream node completed. The server publish route re-derives all of
  // this authoritatively — this only unlocks the canvas control.
  const inboundProofVerified = (() => {
    const kind = String(sandboxRow?.schedulerTriggerKind || "").trim();
    if (!["inbound-webhook", "api-request"].includes(kind)) return false;
    return (
      String(sandboxRow?.lastScheduledRunTriggerKind || "").trim() === kind &&
      String(sandboxRow?.lastScheduledRunStatus || "").trim().startsWith("2") &&
      String(sandboxRow?.lastScheduledRunNodesCompleted || "").trim() !== "false"
    );
  })();
  const serverlessInstalledAndBound =
    String(sandboxRow?.runLocality || "").trim() === "serverless" &&
    Boolean(String(sandboxRow?.scheduleId || "").trim()) &&
    (remoteScheduleVerified || inboundProofVerified) &&
    Boolean(String(sandboxRow?.schedulerRegistryId || "").trim()) &&
    liveScheduleBinding.enabled === true &&
    liveScheduleBinding.scheduleId === String(sandboxRow?.scheduleId || "").trim() &&
    liveScheduleBinding.schedulerRegistryId === String(sandboxRow?.schedulerRegistryId || "").trim() &&
    orchestrationGraphContentEquals(
      String(sandboxRow?.orchestrationDraftConfig || sandboxRow?.orchestrationDraftGraph || "").trim(),
      currentGraphSerialized,
    );
  const publishReady = !dirty && (
    (draftPassed && String(sandboxRow?.orchestrationDraftTestedConfig || "") === currentGraphSerialized) ||
    serverlessInstalledAndBound
  );
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
  const schedulerRegistryRows = resolveSchedulerRegistryRows(workspaceConfig || {});
  const selectedSchedulerRegistryId = String(sandboxRow?.schedulerRegistryId || addOnsState.qstashWorkflow?.integrationId || schedulerRegistryRows[0]?.integrationId || "").trim();
  const selectedSchedulerRow = schedulerRegistryRows.find((entry) => entry.integrationId === selectedSchedulerRegistryId)?.row || addOnsState.qstashWorkflow || null;
  const isServerlessWorkflow = Boolean(serverlessState?.isServerless);

  // Serverless-readiness — a PURE causation driver, the same shape/inputs as
  // deriveSandboxServerlessState above (no fetch, no effect): the credential
  // signal is the already-resolved `serverlessSignals.configuredEnvRefs` (slugs,
  // never values). It runs once the input trigger is in (or moving into)
  // Serverless Schedule, and feeds the ultrathin orange node border + the
  // light-orange field/delta-tag fills (the color is the only guidance added).
  const selectedInputMode = String(
    (Array.isArray(orchestrationGraph?.nodes) ? orchestrationGraph.nodes : [])
      .find((n) => n?.type === "input" || n?.id === "input" || n?.type === "data-trigger")?.config?.inputMode || "",
  ).trim();
  // Webhook and API Request are serverless invocation methods just like the
  // schedule — selecting any of the three activates the same pre-bind
  // readiness/delta field highlighting before the user hits Bind.
  const inputServerlessSelected = ["serverless-schedule", "webhook", "api-request"].includes(selectedInputMode);
  // The expected registry for the scan follows the selected method: the bound
  // inbound capability row for webhook/api-request, the scheduler row otherwise.
  const expectedReadinessRegistryId = selectedInputMode === "webhook"
    ? String(addOnsState.webhookTrigger?.integrationId || "").trim()
    : selectedInputMode === "api-request"
      ? String(addOnsState.apiTrigger?.integrationId || "").trim()
      : selectedSchedulerRegistryId;
  const serverlessReadiness = sandboxRow && (isServerlessWorkflow || inputServerlessSelected)
    ? scanServerlessReadiness({
        row: sandboxRow,
        workspaceConfig: workspaceConfig || {},
        configuredEnvRefs: serverlessSignals.configuredEnvRefs,
        phase: isServerlessWorkflow && String(sandboxRow?.scheduleId || "").trim() ? "bound" : "pre-bind",
        expected: { schedulerRegistryId: expectedReadinessRegistryId, scheduleId: String(sandboxRow?.scheduleId || "").trim() },
      })
    : null;
  const readinessFlags = serverlessReadiness ? readinessFieldFlags(serverlessReadiness) : {};
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
    } else if (action.id === "run-sandbox") {
      if (
        isServerlessWorkflow &&
        sandboxRow?.schedulerRegistryId === UPSTASH_QSTASH_INTEGRATION_ID &&
        sandboxRow?.scheduleId &&
        remoteScheduleVerified
      ) {
        await runInstalledSchedulerNow();
      } else {
        await runSandbox();
      }
    }
  }

  async function useInstalledQstashWorkflowAddOn() {
    setScheduleModalOpen(true);
  }

  function updateScheduleCadence(cadence) {
    const next = SCHEDULE_CADENCE_OPTIONS.find((option) => option.id === cadence) || SCHEDULE_CADENCE_OPTIONS[0];
    setScheduleCadence(next.id);
  }

  async function submitQstashSchedule() {
    // Bind requires an installed+verified QStash product. The schedule route
    // installs THIS row's schedule AND flips it to serverless in ONE
    // server-authoritative write, then returns the persisted config — we adopt
    // it verbatim. No second PATCH over stale state (which could clobber the
    // just-written scheduleId), and serverless is never claimed unless the
    // server confirmed both the remote schedule and the local persist.
    if (resolved.rowIndex < 0 || !objectId || !rowId || !workspaceConfig || !addOnsState.qstashWorkflow) return false;
    if (!String(scheduleTime || "").trim()) {
      setScheduleError("Choose a run time.");
      return false;
    }
    const scheduleCron = deriveCronFromSchedule({
      cadence: scheduleCadence,
      time: scheduleTime,
      weekday: scheduleWeekday,
      monthDay: scheduleMonthDay,
    });
    const triggerInput = JSON.stringify(buildServerlessScheduleRunInputs({
      workflow: rowId,
      cadence: scheduleCadence,
      time: scheduleTime,
      weekday: scheduleWeekday,
      monthDay: scheduleMonthDay,
    }));
    setScheduleError("");
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch("/api/workspace/add-ons/upstash/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: "upstash-qstash",
          objectId,
          rowId,
          region: addOnsState.qstashWorkflow.region || "us-east-1",
          cron: scheduleCron,
          cadence: scheduleCadence,
          triggerInput,
          version: String(sandboxRow?.version || "v1"),
          workspaceId: workspaceConfig?.id || "workspace",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.bound || !payload.workspaceConfig) {
        // No schedule installed (missing token / read-only / provider / persist
        // failure). Keep the workflow local; route the operator to finish setup.
        setScheduleError(payload.error ? `Could not create schedule: ${payload.error}` : "Could not create the QStash schedule.");
        return false;
      }
      setWorkspaceConfig(payload.workspaceConfig);
      setScheduleModalOpen(false);
      setSaveMessage("Schedule updated.");
      return true;
    } catch (error) {
      console.warn(error);
      setSaveMessage(error?.message || "Could not create QStash schedule.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function revertServerlessScheduleToLocal() {
    if (!objectId || !rowId || !sandboxRow?.scheduleId) return false;
    setScheduleError("");
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch("/api/workspace/add-ons/upstash/schedule", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: "upstash-qstash",
          objectId,
          rowId,
          scheduleId: sandboxRow.scheduleId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !payload.workspaceConfig) {
        setScheduleError(payload.error || "Could not remove the remote schedule.");
        return false;
      }
      setWorkspaceConfig(payload.workspaceConfig);
      setSaveMessage("Schedule removed.");
      return true;
    } catch (error) {
      setScheduleError(error?.message || "Could not remove the remote schedule.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Inbound input methods (webhook / api-request) — the exact mirror of the
  // QStash schedule actions: the growthub schedule route binds THIS row and
  // flips it serverless in ONE server-authoritative write; we adopt the
  // returned config verbatim and never claim bound unless the server
  // confirmed the persist.
  // Inbound method meta is DERIVED from the marketplace-agnostic add-ons
  // state (any installed + verified product on an inbound execution lane —
  // resolveInboundMethodProducts), falling back to the packaged growthub
  // products so the canvas can name the method before anything is installed.
  const INBOUND_METHOD_FALLBACK = {
    webhook: { providerId: "growthub", productId: "growthub-webhook-trigger", triggerKind: "inbound-webhook", label: "Webhook", requiredEnv: ["GROWTHUB_WEBHOOK_SIGNING_SECRET"] },
    "api-request": { providerId: "growthub", productId: "growthub-api-trigger", triggerKind: "api-request", label: "API request", requiredEnv: ["GROWTHUB_API_INVOKE_TOKEN"] },
  };
  function inboundMethodMeta(inputMode) {
    const method = (addOnsState.inboundMethods || []).find((entry) => entry.inputMode === inputMode) || null;
    if (method) {
      return {
        providerId: method.providerId || "growthub",
        productId: method.productId,
        triggerKind: method.triggerKind,
        label: method.label || INBOUND_METHOD_FALLBACK[inputMode]?.label || inputMode,
        requiredEnv: method.requiredEnv?.length ? method.requiredEnv : (INBOUND_METHOD_FALLBACK[inputMode]?.requiredEnv || []),
      };
    }
    return INBOUND_METHOD_FALLBACK[inputMode] || null;
  }

  // The caller-facing wire contract (v1) per inbound method: exactly what an
  // external system needs to invoke the bound workflow — full envelope,
  // destination, and auth headers. Secrets appear as env-ref NAMES only.
  function buildInboundInvocationExample(inputMode, meta) {
    const dest = String(sandboxRow?.schedulerDestination || "").trim() || "<workspace-destination-url>";
    const envRef = (meta?.requiredEnv || [])[0] || (inputMode === "webhook" ? "GROWTHUB_WEBHOOK_SIGNING_SECRET" : "GROWTHUB_API_INVOKE_TOKEN");
    const body = JSON.stringify({
      kind: "growthub-invoked-run-v1",
      scheduleId: String(sandboxRow?.scheduleId || ""),
      workspaceId: workspaceConfig?.id || "workspace",
      objectId,
      rowId,
      version: String(sandboxRow?.version || "v1"),
      runInputs: { kind: RUN_INPUTS_KIND, source: inputMode, values: deriveInboundTestSeed(), files: [] },
    });
    if (inputMode === "webhook") {
      return [
        `curl -X POST '${dest}' \\`,
        "  -H 'content-type: application/json' \\",
        "  -H 'x-growthub-timestamp: <unix-seconds>' \\",
        `  -H 'x-growthub-signature: v1=<hex hmac-sha256(${envRef}, \"<timestamp>.<body>\")>' \\`,
        `  -d '${body}'`,
      ].join("\n");
    }
    return [
      `curl -X POST '${dest}' \\`,
      "  -H 'content-type: application/json' \\",
      `  -H "authorization: Bearer $${envRef}" \\`,
      `  -d '${body}'`,
    ].join("\n");
  }

  async function copyInboundExample(inputMode, meta) {
    try {
      await navigator.clipboard.writeText(buildInboundInvocationExample(inputMode, meta));
      setInboundExampleCopied(true);
      window.setTimeout(() => setInboundExampleCopied(false), 1200);
    } catch {
      // Clipboard API unavailable — the example stays selectable by hand.
    }
  }
  function inboundScheduleRoute(meta) {
    return `/api/workspace/add-ons/${encodeURIComponent(meta?.providerId || "growthub")}/schedule`;
  }

  async function submitInboundBinding(inputMode) {
    const meta = inboundMethodMeta(inputMode);
    if (!meta || resolved.rowIndex < 0 || !objectId || !rowId || !workspaceConfig) return false;
    setScheduleError("");
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch(inboundScheduleRoute(meta), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: meta.productId,
          objectId,
          rowId,
          version: String(sandboxRow?.version || "v1"),
          workspaceId: workspaceConfig?.id || "workspace",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.bound || !payload.workspaceConfig) {
        setScheduleError(payload.error ? `Could not bind ${meta.label}: ${payload.error}` : `Could not bind the ${meta.label} trigger.`);
        return false;
      }
      setWorkspaceConfig(payload.workspaceConfig);
      setSaveMessage(`${meta.label} trigger bound.`);
      return true;
    } catch (error) {
      console.warn(error);
      setScheduleError(error?.message || `Could not bind the ${meta.label} trigger.`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function revertInboundBindingToLocal(inputMode) {
    const meta = inboundMethodMeta(inputMode);
    if (!meta || !objectId || !rowId || !sandboxRow?.scheduleId) return false;
    setScheduleError("");
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch(inboundScheduleRoute(meta), {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: meta.productId,
          objectId,
          rowId,
          scheduleId: sandboxRow.scheduleId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !payload.workspaceConfig) {
        setScheduleError(payload.error || `Could not remove the ${meta.label} binding.`);
        return false;
      }
      setWorkspaceConfig(payload.workspaceConfig);
      setSaveMessage(`${meta.label} binding removed.`);
      return true;
    } catch (error) {
      setScheduleError(error?.message || `Could not remove the ${meta.label} binding.`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function runInboundTestInvocation(inputMode, runInputs = null) {
    const meta = inboundMethodMeta(inputMode);
    if (!meta || !objectId || !rowId || !sandboxRow?.scheduleId) return false;
    setScheduleError("");
    setSaving(true);
    setSaveMessage("");
    try {
      const body = {
        action: "run",
        productId: meta.productId,
        objectId,
        rowId,
        version: String(sandboxRow?.version || "v1"),
        workspaceId: workspaceConfig?.id || "workspace",
      };
      // User-entered test values ride the canonical run-input envelope; the
      // destination door still validates them against the workflow's own
      // input schema before any node runs.
      if (runInputs && typeof runInputs === "object" && !Array.isArray(runInputs)) {
        body.runInputs = runInputs;
      }
      const response = await fetch(inboundScheduleRoute(meta), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setScheduleError(payload.error || `${meta.label} test invocation failed.`);
        return false;
      }
      // The destination door wrote the durable last-run proof; re-hydrate so
      // the panel and cockpit show the verified 200 without a manual refresh.
      try {
        await fetchWorkspaceConfigOnce();
      } catch {
        // hydration is best-effort; the proof is already durable server-side
      }
      setSaveMessage(`${meta.label} test invocation succeeded (run ${payload.runId || "ok"}).`);
      return true;
    } catch (error) {
      setScheduleError(error?.message || `${meta.label} test invocation failed.`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function controlInstalledScheduler(action) {
    if (!objectId || !rowId || !sandboxRow?.scheduleId || !["pause", "resume"].includes(action)) return false;
    setScheduleError("");
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch("/api/workspace/add-ons/upstash/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          productId: "upstash-qstash",
          objectId,
          rowId,
          region: sandboxRow.schedulerRegion || addOnsState.qstashWorkflow?.region || "us-east-1",
          scheduleId: sandboxRow.scheduleId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !payload.workspaceConfig) {
        setScheduleError(payload.error || `Could not ${action} the remote schedule.`);
        return false;
      }
      setWorkspaceConfig(payload.workspaceConfig);
      setSaveMessage(action === "pause" ? "Schedule paused." : "Schedule resumed.");
      return true;
    } catch (error) {
      setScheduleError(error?.message || `Could not ${action} the remote schedule.`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function controlInboundBinding(inputMode, action) {
    const meta = inboundMethodMeta(inputMode);
    if (!meta || !objectId || !rowId || !sandboxRow?.scheduleId || !["pause", "resume"].includes(action)) return false;
    setScheduleError("");
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch(inboundScheduleRoute(meta), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          productId: meta.productId,
          objectId,
          rowId,
          scheduleId: sandboxRow.scheduleId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !payload.workspaceConfig) {
        setScheduleError(payload.error || `Could not ${action} the ${meta.label} binding.`);
        return false;
      }
      setWorkspaceConfig(payload.workspaceConfig);
      setSaveMessage(action === "pause" ? `${meta.label} binding paused.` : `${meta.label} binding resumed.`);
      return true;
    } catch (error) {
      setScheduleError(error?.message || `Could not ${action} the ${meta.label} binding.`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openQstashSetup() {
    router.push("/settings/add-ons");
  }

  function openCustomSchedulerSetup() {
    // Custom schedulers are provider-AGNOSTIC: any governed API Registry row can
    // be bound via this sandbox row's schedulerRegistryId and is executed by the
    // generic sandbox-run serverless delegation — no marketplace adapter or
    // Upstash coupling. Route to the row drawer (where schedulerRegistryId is
    // editable) when we have a workflow row; otherwise send the operator to
    // API/Webhooks to register the custom scheduler row first. Never navigate
    // with empty object/row params.
    if (objectId && rowId) {
      router.push(`/data-model?object=${encodeURIComponent(objectId)}&row=${encodeURIComponent(rowId)}&field=${encodeURIComponent("schedulerRegistryId")}`);
    } else {
      router.push("/settings/apis-webhooks");
    }
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

        <WorkflowScheduleModal
          open={scheduleModalOpen}
          addOn={addOnsState.qstashWorkflow}
          workflowName={rowId}
          cadence={scheduleCadence}
          scheduleTime={scheduleTime}
          scheduleWeekday={scheduleWeekday}
          scheduleMonthDay={scheduleMonthDay}
          errorMessage={scheduleError}
          disabled={saving || publishing || running}
          onCadenceChange={updateScheduleCadence}
          onScheduleTimeChange={setScheduleTime}
          onScheduleWeekdayChange={setScheduleWeekday}
          onScheduleMonthDayChange={setScheduleMonthDay}
          onSubmit={submitQstashSchedule}
          onClose={() => setScheduleModalOpen(false)}
        />

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
                      readinessFlags={readinessFlags}
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
                    <em>{runSetupTarget === "webhook" ? "Webhook test values" : runSetupTarget === "api-request" ? "API request test values" : "Manual inputs"}</em>
                  </div>
                  <RunSetupPanel
                    schema={runInputSchema}
                    running={running || saving}
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
                    readinessFlag={selectedNodeId ? readinessFlags[selectedNodeId] : null}
                    serverlessScheduleOptionAvailable={Boolean(addOnsState.qstashWorkflow || selectedSchedulerRegistryId || schedulerRegistryRows.length)}
                    serverlessScheduleAvailable={remoteScheduleVerified}
                    webhookTriggerAvailable={addOnsState.hasWebhookTriggerCapability}
                    apiTriggerAvailable={addOnsState.hasApiTriggerCapability}
                    inputScheduleControls={selectedNode?.type === "input" && selectedNode?.config?.inputMode === "serverless-schedule" ? (
                      <div className="dm-trigger-schedule-config">
                        <span className="dm-field-label">Serverless schedule</span>
                        <dl className="dm-workflow-schedule-state">
                          <div>
                            <dt>Scheduler</dt>
                            <dd>{selectedSchedulerRegistryId || "Install scheduler first"}</dd>
                          </div>
                          <div>
                            <dt>Status</dt>
                            <dd>{remoteScheduleVerified ? (sandboxRow?.schedulerPaused ? "paused" : "bound") : "not bound"}</dd>
                          </div>
                          <div>
                            <dt>Region</dt>
                            <dd>{sandboxRow?.schedulerRegion || selectedSchedulerRow?.region || "pending"}</dd>
                          </div>
                          {remoteScheduleVerified && sandboxRow?.scheduleId ? (
                            <div>
                              <dt>Schedule</dt>
                              <dd>{sandboxRow.scheduleId}</dd>
                            </div>
                          ) : null}
                          {remoteScheduleVerified && sandboxRow?.schedulerCron ? (
                            <div>
                              <dt>Cron</dt>
                              <dd>{sandboxRow.schedulerCron}</dd>
                            </div>
                          ) : null}
                          {remoteScheduleVerified && sandboxRow?.schedulerInstalledAt ? (
                            <div>
                              <dt>Last sync</dt>
                              <dd>{sandboxRow.schedulerInstalledAt}</dd>
                            </div>
                          ) : null}
                          {sandboxRow?.schedulerPausedAt ? (
                            <div>
                              <dt>Paused</dt>
                              <dd>{sandboxRow.schedulerPausedAt}</dd>
                            </div>
                          ) : null}
                        </dl>
                        {schedulerRegistryRows.length > 1 ? (
                          <label className="dm-orchestration-config__field">
                            <span>Scheduler registry</span>
                            <select
                              value={selectedSchedulerRegistryId}
                              disabled={Boolean(sandboxRow?.scheduleId) || saving}
                              onChange={(e) => patchSandboxRuntimeFields({ schedulerRegistryId: e.target.value })}
                            >
                              {schedulerRegistryRows.map((entry) => (
                                <option key={entry.integrationId} value={entry.integrationId}>
                                  {entry.integrationId}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <label className="dm-orchestration-config__field">
                          <span>Cadence</span>
                          <select value={scheduleCadence} onChange={(e) => updateScheduleCadence(e.target.value)}>
                            {SCHEDULE_CADENCE_OPTIONS.map((option) => (
                              <option key={option.id} value={option.id}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <ScheduleTimeControls value={scheduleTime} onChange={setScheduleTime} />
                        {scheduleCadence === "weekly" ? (
                          <label className="dm-orchestration-config__field">
                            <span>Run day</span>
                            <select value={scheduleWeekday} onChange={(e) => setScheduleWeekday(e.target.value)}>
                              {SCHEDULE_WEEKDAY_OPTIONS.map((option) => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        {scheduleCadence === "monthly" ? (
                          <label className="dm-orchestration-config__field">
                            <span>Day of month</span>
                            <select value={scheduleMonthDay} onChange={(e) => setScheduleMonthDay(e.target.value)}>
                              {SCHEDULE_MONTH_DAY_OPTIONS.map((option) => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        {sandboxRow?.lastScheduledRunResponse || sandboxRow?.lastScheduledRunBodyPreview || sandboxRow?.lastScheduledRunStatus ? (
                          <div className="dm-workflow-schedule-last-run">
                            <span>Last run</span>
                            <strong>{sandboxRow?.lastScheduledRunStatus || "pending"}</strong>
                          </div>
                        ) : null}
                        {scheduleError ? <p className="dm-workflow-schedule-error" role="alert">{scheduleError}</p> : null}
                        <button
                          type="button"
                          className="dm-btn-outline dm-workflow-schedule-submit"
                          disabled={saving || !addOnsState.qstashWorkflow || !String(scheduleTime || "").trim()}
                          onClick={submitQstashSchedule}
                        >
                          {saving ? "Saving schedule..." : sandboxRow?.scheduleId ? "Update schedule" : "Save schedule"}
                        </button>
                        {!addOnsState.qstashWorkflow ? (
                          <p className="dm-cockpit-step-hint">Install + sync QStash in Workspace Add-ons first, then save the schedule here.</p>
                        ) : null}
                        {sandboxRow?.scheduleId ? (
                          <div className="dm-workflow-schedule-actions">
                            <button
                              type="button"
                              className="dm-btn-outline"
                              disabled={saving}
                              onClick={() => controlInstalledScheduler(sandboxRow?.schedulerPaused ? "resume" : "pause")}
                            >
                              {sandboxRow?.schedulerPaused ? "Resume" : "Pause"}
                            </button>
                            <button
                              type="button"
                              className="dm-btn-outline is-danger"
                              disabled={saving}
                              onClick={revertServerlessScheduleToLocal}
                            >
                              Revert to local
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : selectedNode?.type === "input" && ["webhook", "api-request"].includes(String(selectedNode?.config?.inputMode || "").trim()) ? (() => {
                      // Inbound input methods — the exact mirror of the schedule
                      // panel above: capability → bind → test invocation →
                      // verified 200 proof, all through the governed growthub
                      // schedule route and the real destination door.
                      const inputMode = String(selectedNode.config.inputMode).trim();
                      const meta = inboundMethodMeta(inputMode);
                      // Native readiness: the signing secret / invoke token env
                      // ref resolving in this runtime IS the capability — the
                      // same signal the server bind gate enforces.
                      const envRef = (meta.requiredEnv || [])[0] || "";
                      const secretConfigured = envRef ? (serverlessSignals.configuredEnvRefs || []).includes(envRef) : false;
                      const bound = Boolean(sandboxRow?.scheduleId) && String(sandboxRow?.schedulerTriggerKind || "").trim() === meta.triggerKind;
                      const lastStatus = String(sandboxRow?.lastScheduledRunStatus || "").trim();
                      const lastKindAgrees = String(sandboxRow?.lastScheduledRunTriggerKind || "").trim() === meta.triggerKind;
                      const verified = bound && lastKindAgrees && lastStatus.startsWith("2") && String(sandboxRow?.lastScheduledRunNodesCompleted || "").trim() !== "false";
                      const lastFailed = bound && lastKindAgrees && Boolean(lastStatus) && !lastStatus.startsWith("2");
                      return (
                        <div className="dm-trigger-schedule-config">
                          <span className="dm-field-label">{meta.label} trigger</span>
                          <dl className="dm-workflow-schedule-state">
                            <div>
                              <dt>Status</dt>
                              <dd>{bound ? (sandboxRow?.schedulerPaused ? "paused" : verified ? "verified 200" : lastFailed ? "last run failed" : "bound — no receipt yet") : "not bound"}</dd>
                            </div>
                            {bound && sandboxRow?.scheduleId ? (
                              <div>
                                <dt>Binding</dt>
                                <dd>{sandboxRow.scheduleId}</dd>
                              </div>
                            ) : null}
                            {bound && sandboxRow?.schedulerDestination ? (
                              <div>
                                <dt>Destination</dt>
                                <dd>{sandboxRow.schedulerDestination}</dd>
                              </div>
                            ) : null}
                            <div>
                              <dt>Auth</dt>
                              <dd>{inputMode === "webhook" ? "v1 HMAC — x-growthub-signature + x-growthub-timestamp (±300s)" : "Bearer — authorization or x-growthub-api-key"}</dd>
                            </div>
                            {envRef ? (
                              <div>
                                <dt>{inputMode === "webhook" ? "Signing secret" : "Invoke token"}</dt>
                                <dd>{envRef} — {secretConfigured ? "configured" : "not configured"} (env ref; value stays server-side)</dd>
                              </div>
                            ) : null}
                          </dl>
                          {bound && lastStatus ? (
                            <div className="dm-workflow-schedule-last-run">
                              <span>Last run</span>
                              <strong>{lastStatus}{lastKindAgrees ? "" : " (other method)"}</strong>
                            </div>
                          ) : null}
                          {scheduleError ? <p className="dm-workflow-schedule-error" role="alert">{scheduleError}</p> : null}
                          {!bound ? (
                            <button
                              type="button"
                              className="dm-btn-outline dm-workflow-schedule-submit"
                              disabled={saving || !secretConfigured}
                              onClick={() => submitInboundBinding(inputMode)}
                            >
                              {saving ? "Binding..." : `Bind ${meta.label} trigger`}
                            </button>
                          ) : (
                            <>
                              <label className="dm-orchestration-config__field">
                                <span>Test request values (JSON)</span>
                                <textarea
                                  rows={5}
                                  value={inboundTestValuesText != null ? inboundTestValuesText : JSON.stringify(deriveInboundTestSeed(), null, 2)}
                                  onChange={(e) => setInboundTestValuesText(e.target.value)}
                                  spellCheck={false}
                                />
                                <small className="dm-run-setup__help">Seeded from the input node&apos;s sample payload — the same contract the readiness scan checks downstream nodes against. Sent as the real {meta.label.toLowerCase()} request body.</small>
                              </label>
                              <button
                                type="button"
                                className="dm-btn-outline dm-workflow-schedule-submit"
                                disabled={saving || Boolean(sandboxRow?.schedulerPaused)}
                                onClick={() => handleInboundTestClick(inputMode)}
                              >
                                {saving ? "Invoking..." : runInputSchema.requiresInput ? "Run test invocation with inputs..." : "Run test invocation"}
                              </button>
                              <label className="dm-orchestration-config__field">
                                <span>Call it from your system</span>
                                <textarea
                                  rows={7}
                                  readOnly
                                  value={buildInboundInvocationExample(inputMode, meta)}
                                  spellCheck={false}
                                  onFocus={(e) => e.target.select()}
                                />
                                <small className="dm-run-setup__help">The complete v1 wire contract for this binding: destination, auth header{inputMode === "webhook" ? "s (signature is HMAC-SHA256 over `timestamp.body` with the signing secret)" : ""}, and the invoked-run envelope carrying your run inputs.</small>
                              </label>
                              <button
                                type="button"
                                className="dm-btn-outline"
                                onClick={() => copyInboundExample(inputMode, meta)}
                              >
                                {inboundExampleCopied ? "Copied" : "Copy example request"}
                              </button>
                            </>
                          )}
                          {!secretConfigured && envRef ? (
                            <p className="dm-cockpit-step-hint">Set {envRef} in the workspace environment (deployment env or .env.local), then bind — the {meta.label.toLowerCase()} endpoint can only verify calls once the ref resolves.</p>
                          ) : null}
                          {bound && !verified && !lastFailed ? (
                            <p className="dm-cockpit-step-hint">Run a test invocation with real values — publish requires a verified 200 with every downstream node completed.</p>
                          ) : null}
                          {bound ? (
                            <div className="dm-workflow-schedule-actions">
                              <button
                                type="button"
                                className="dm-btn-outline"
                                disabled={saving}
                                onClick={() => controlInboundBinding(inputMode, sandboxRow?.schedulerPaused ? "resume" : "pause")}
                              >
                                {sandboxRow?.schedulerPaused ? "Resume" : "Pause"}
                              </button>
                              <button
                                type="button"
                                className="dm-btn-outline is-danger"
                                disabled={saving}
                                onClick={() => revertInboundBindingToLocal(inputMode)}
                              >
                                Revert to local
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })() : null}
                  />
                  {graphError && <p className="dm-orchestration-config__error">{graphError}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {runMessage && (
          <p className="dm-workflow-status-msg">{saveMessage || runMessage}</p>
        )}
      </section>
    </main>
  );
}
