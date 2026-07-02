"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Check, ChevronDown, Database, FileInput, KeyRound, ListTree, Webhook } from "lucide-react";
import {
  detectFieldIdsFromLastResponse,
  FILTER_CONJUNCTIONS,
  FILTER_OPERATORS,
  isApiRegistryTestSuccessful
} from "@/lib/orchestration-graph";
import { SandboxAgentAuthPanel } from "./SandboxAgentAuthPanel.jsx";
import { isSandboxLocalAgentHost } from "@/lib/sandbox-agent-auth-eligibility";
import { HOST_AUTH_CATALOG } from "@/lib/sandbox-agent-host-catalog";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const MODEL_OPTIONS = ["Claude Opus 4.6", "Claude Sonnet 4.5", "GPT-5.2", "Local agent host"];
const OUTPUT_TYPES = ["Text", "Number", "Boolean", "JSON", "Record ID"];
const LOCAL_AGENT_ADAPTERS = [
  { value: "local-process", label: "Local process" },
  { value: "local-agent-host", label: "Local agent host" },
  { value: "local-intelligence", label: "Local intelligence" }
];
const LOCAL_INTELLIGENCE_MODE_OPTIONS = [
  { value: "ollama", label: "ollama (OLLAMA_BASE_URL + /v1/chat/completions)" },
  { value: "lmstudio", label: "lmstudio (LMSTUDIO_BASE_URL)" },
  { value: "vllm", label: "vllm (VLLM_BASE_URL required)" },
  { value: "custom-openai-compatible", label: "custom (use Chat completions URL above)" }
];
const EMPTY_AGENT_AUTH_PATCH = {
  agentAuthStatus: "",
  agentAuthProvider: "",
  agentAuthLastChecked: "",
  agentAuthLastExitCode: "",
  agentAuthLastMessage: "",
  agentAuthLastLoginUrl: ""
};

function WorkflowCheckbox({ checked, disabled, onChange, children, title }) {
  return (
    <label className="dm-orchestration-config__field dm-orchestration-config__field-inline dm-workflow-check" title={title}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span className="dm-workflow-check__box" aria-hidden="true">
        {checked ? <Check size={13} strokeWidth={2.4} /> : null}
      </span>
      <span>{children}</span>
    </label>
  );
}

function getAgentHostOptions() {
  return Object.entries(HOST_AUTH_CATALOG || {}).map(([slug, host]) => ({
    value: slug,
    label: host?.label || slug
  }));
}
function normalizeTags(tags) {
  return Array.from(new Set((Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .filter(Boolean)));
}

function inferDeltaTagsForNode(node, config) {
  const tags = [];
  const type = String(node?.type || "").trim();
  const action = String(config?.action || node?.id || "").trim();

  if (type === "thinAdapter") tags.push("model", "prompt", "routing");
  if (type === "ai-agent") tags.push("model", "prompt", "output");
  if (type === "data-action" || type === "data-trigger") tags.push("input", "output");
  if (type === "flow-control") tags.push("routing");
  if (type === "core-action") tags.push("runtime");
  if (type === "human-input") tags.push("input");

  if (action.includes("search") || action.includes("filter") || type === "transform-filter") tags.push("evaluation", "guardrail");
  if (action.includes("delete") || config?.confirmationRequired) tags.push("guardrail");
  if (action.includes("http") || config?.url || config?.method) tags.push("routing", "input", "output");
  if (action.includes("email")) tags.push("input", "output");
  if (action.includes("delay") || config?.duration || config?.unit) tags.push("runtime");
  if (config?.objectId || config?.fieldMap || config?.filters) tags.push("input", "output");
  if (config?.model || config?.prompt) tags.push("model", "prompt");

  return normalizeTags(tags);
}

function getDeltaTagDefaultValue(tag, node, config, sandboxRow) {
  const normalized = String(tag || "").trim().toLowerCase();
  if (normalized === "model") {
    return String(config?.model || sandboxRow?.adapter || sandboxRow?.executionAdapter || sandboxRow?.runAdapter || node?.sandbox || "").trim();
  }
  if (normalized === "prompt") {
    return String(config?.prompt || sandboxRow?.prompt || sandboxRow?.instructions || sandboxRow?.command || "").trim();
  }
  if (normalized === "routing") {
    return String(config?.inputBinding || config?.executionPolicy || config?.filterMode || config?.endpoint || config?.url || "").trim();
  }
  if (normalized === "input") {
    return String(config?.objectName || config?.objectId || config?.inputBinding || config?.bodyTemplate || config?.samplePayload ? (
      config?.objectName || config?.objectId || config?.inputBinding || "configured input"
    ) : "").trim();
  }
  if (normalized === "output") {
    return String(config?.outputKey || config?.outputVariable || config?.outputField || config?.fieldMap ? (
      config?.outputKey || config?.outputVariable || config?.outputField || "configured output"
    ) : "").trim();
  }
  if (normalized === "evaluation") {
    return String(config?.filters || config?.successStatusCodes || config?.expectedStatus ? "configured evaluation" : "").trim();
  }
  if (normalized === "guardrail") {
    return String(config?.confirmationRequired ? "confirmation required" : config?.networkPolicy || sandboxRow?.networkPolicy || "").trim();
  }
  if (normalized === "runtime") {
    return String(config?.duration || config?.unit ? `${config.duration || ""} ${config.unit || ""}`.trim() : sandboxRow?.runtime || "").trim();
  }
  return String(config?.deltaValues?.[normalized] || "").trim();
}

function getObjectFields(object) {
  return (Array.isArray(object?.fields) ? object.fields : [])
    .map((field) => ({
      id: String(field.id || field.name || field.label || "").trim(),
      label: String(field.label || field.name || field.id || "").trim(),
      type: String(field.type || field.fieldType || "text").trim()
    }))
    .filter((field) => field.id);
}

function getSelectedObject(workspaceObjects, objectId) {
  return workspaceObjects.find((object) => String(object.id) === String(objectId || "")) || null;
}

function KeyValueRows({ label, entries, onChange, disabled, keyPlaceholder = "Key", valuePlaceholder = "Value" }) {
  const rows = Array.isArray(entries)
    ? entries
    : Object.entries(entries && typeof entries === "object" ? entries : {}).map(([key, value]) => ({ key, value }));

  function normalize(nextRows) {
    onChange(nextRows.filter((row) => String(row.key || row.name || "").trim()));
  }

  function updateRow(index, patch) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    normalize(next);
  }

  return (
    <div className="dm-orchestration-config__fieldmap">
      <span className="dm-orchestration-config__field-label">{label}</span>
      {rows.map((row, index) => (
        <div key={index} className="dm-orchestration-config__fieldmap-row">
          <input
            placeholder={keyPlaceholder}
            value={row.key || row.name || ""}
            disabled={disabled}
            onChange={(e) => updateRow(index, { key: e.target.value })}
          />
          <input
            placeholder={valuePlaceholder}
            value={row.value == null ? "" : String(row.value)}
            disabled={disabled}
            onChange={(e) => updateRow(index, { value: e.target.value })}
          />
          <button type="button" className="dm-btn-ghost" disabled={disabled} onClick={() => normalize(rows.filter((_, i) => i !== index))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="dm-btn-outline" disabled={disabled} onClick={() => normalize([...rows, { key: "", value: "" }])}>
        + Add {label.toLowerCase()}
      </button>
    </div>
  );
}

function FilterClauseList({ filters, filterMode, onChange, disabled, fieldOptions = [] }) {
  const clauses = Array.isArray(filters) ? filters : [];
  const mode = FILTER_CONJUNCTIONS.includes(filterMode) ? filterMode : "and";

  function updateClause(index, patch) {
    const next = clauses.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange(next, mode);
  }

  function addClause() {
    onChange([...clauses, { fieldId: "", operator: "eq", value: "" }], mode);
  }

  function removeClause(index) {
    onChange(clauses.filter((_, i) => i !== index), mode);
  }

  return (
    <div className="dm-orchestration-config__filters">
      <p className="dm-orchestration-config__hint">Where</p>
      <label className="dm-orchestration-config__field">
        <span>Match</span>
        <select value={mode} disabled={disabled} onChange={(e) => onChange(clauses, e.target.value)}>
          {FILTER_CONJUNCTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      {clauses.map((clause, index) => (
        <div key={index} className="dm-orchestration-config__filter-row">
          {fieldOptions.length > 0 ? (
            <select
              value={clause.fieldId || ""}
              disabled={disabled}
              onChange={(e) => updateClause(index, { fieldId: e.target.value })}
            >
              <option value="">Select field</option>
              {fieldOptions.map((field) => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
          ) : (
            <input
              placeholder="field"
              value={clause.fieldId || ""}
              disabled={disabled}
              onChange={(e) => updateClause(index, { fieldId: e.target.value })}
            />
          )}
          <select
            value={clause.operator || "eq"}
            disabled={disabled}
            onChange={(e) => updateClause(index, { operator: e.target.value })}
          >
            {FILTER_OPERATORS.map((op) => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
          <input
            placeholder="value"
            value={clause.value ?? ""}
            disabled={disabled || clause.operator === "isEmpty" || clause.operator === "isNotEmpty"}
            onChange={(e) => updateClause(index, { value: e.target.value })}
          />
          <button type="button" className="dm-btn-ghost" disabled={disabled} onClick={() => removeClause(index)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="dm-btn-outline dm-orchestration-config__add-filter" disabled={disabled} onClick={addClause}>
        + Add filter rule
      </button>
    </div>
  );
}

function FieldMapRows({ fieldMap, onChange, disabled, fieldOptions = [] }) {
  const entries = Object.entries(fieldMap && typeof fieldMap === "object" ? fieldMap : {});

  function updateEntry(index, target, sourcePath) {
    const next = [...entries];
    next[index] = [target, sourcePath];
    onChange(Object.fromEntries(next.filter(([t]) => String(t).trim())));
  }

  function addEntry() {
    onChange({ ...Object.fromEntries(entries), "": "" });
  }

  function removeEntry(index) {
    const next = entries.filter((_, i) => i !== index);
    onChange(Object.fromEntries(next));
  }

  return (
    <div className="dm-orchestration-config__fieldmap">
      <span className="dm-orchestration-config__field-label">Field mapping</span>
      {entries.length === 0 && (
        <p className="dm-orchestration-config__hint">Map workspace field names to paths in the API response.</p>
      )}
      {entries.map(([target, sourcePath], index) => (
        <div key={`${target}-${index}`} className="dm-orchestration-config__fieldmap-row">
          <input
            placeholder="Output field"
            value={target}
            disabled={disabled}
            onChange={(e) => updateEntry(index, e.target.value, sourcePath)}
          />
          {fieldOptions.length > 0 ? (
            <select
              value={sourcePath || ""}
              disabled={disabled}
              onChange={(e) => updateEntry(index, target, e.target.value)}
            >
              <option value="">Source path</option>
              {fieldOptions.map((field) => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
          ) : (
            <input
              placeholder="Source path"
              value={sourcePath || ""}
              disabled={disabled}
              onChange={(e) => updateEntry(index, target, e.target.value)}
            />
          )}
          <button type="button" className="dm-btn-ghost" disabled={disabled} onClick={() => removeEntry(index)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="dm-btn-outline" disabled={disabled} onClick={addEntry}>
        + Add field mapping
      </button>
    </div>
  );
}

function PayloadKeyRows({ payload, onChange, disabled, flagClassName = "" }) {
  const entries = Object.entries(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {});

  function setEntries(nextEntries) {
    onChange(Object.fromEntries(nextEntries.filter(([k]) => String(k).trim())));
  }

  return (
    <div className={`dm-orchestration-config__payload${flagClassName}`}>
      <span className="dm-orchestration-config__field-label">Test payload fields</span>
      {entries.map(([key, value], index) => (
        <div key={index} className="dm-orchestration-config__payload-row">
          <input
            placeholder="key"
            value={key}
            disabled={disabled}
            onChange={(e) => {
              const next = [...entries];
              next[index] = [e.target.value, value];
              setEntries(next);
            }}
          />
          <input
            placeholder="value"
            value={value == null ? "" : String(value)}
            disabled={disabled}
            onChange={(e) => {
              const next = [...entries];
              next[index] = [key, e.target.value];
              setEntries(next);
            }}
          />
          <button
            type="button"
            className="dm-btn-ghost"
            disabled={disabled}
            onClick={() => setEntries(entries.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="dm-btn-outline"
        disabled={disabled}
        onClick={() => setEntries([...entries, ["", ""]])}
      >
        + Add payload field
      </button>
    </div>
  );
}

function VersionDeltaControls({ node, config, sandboxRow, onChange, disabled, flaggedTags, flagSeverity = "warning" }) {
  const flagged = flaggedTags instanceof Set ? flaggedTags : new Set(Array.isArray(flaggedTags) ? flaggedTags : []);
  const explicitTags = normalizeTags(config?.deltaTags);
  const inferredTags = inferDeltaTagsForNode(node, config);
  const selectedTags = explicitTags.length > 0 ? explicitTags : inferredTags;
  const deltaValues = config?.deltaValues && typeof config.deltaValues === "object" && !Array.isArray(config.deltaValues)
    ? config.deltaValues
    : {};

  function patch(patchValue) {
    onChange?.({ ...(config || {}), ...patchValue });
  }

  function patchDeltaValue(tag, value) {
    patch({ deltaValues: { ...deltaValues, [tag]: value } });
  }

  return (
    <div className="dm-orchestration-config__section dm-version-delta">
      <label className="dm-orchestration-config__field">
        <span className="dm-version-delta__label-row">
          Delta tags
          <span
            className="dm-version-delta__info"
            title={explicitTags.length > 0 ? "Saved orchestration config tags." : "Derived from this node's real bindings."}
            aria-label={explicitTags.length > 0 ? "Saved orchestration config tags" : "Derived from this node's real bindings"}
          >
            i
          </span>
        </span>
        <input
          value={selectedTags.join(", ")}
          placeholder="routing, prompt, evaluation"
          disabled={disabled}
          onChange={(event) => patch({ deltaTags: normalizeTags(event.target.value.split(",")) })}
        />
      </label>
      {selectedTags.length > 0 && (
        <div className="dm-version-delta__tag-fields">
          {selectedTags.map((tag) => (
            <label key={tag} className={`dm-orchestration-config__field${flagged.has(tag) ? ` dm-field--readiness is-${flagSeverity}` : ""}`}>
              <span>{tag} value</span>
              <input
                value={deltaValues[tag] ?? getDeltaTagDefaultValue(tag, node, config, sandboxRow)}
                placeholder={`Set ${tag} delta value`}
                disabled={disabled}
                onChange={(event) => patchDeltaValue(tag, event.target.value)}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function LocalAgentHostControls({
  sandboxRow,
  objectId,
  rowName,
  disabled,
  onSandboxRowPatch,
  adapterFlagClass = "",
  hostFlagClass = ""
}) {
  const row = sandboxRow && typeof sandboxRow === "object" ? sandboxRow : {};
  const adapter = String(row.adapter || "local-process").trim() || "local-process";
  const agentHost = String(row.agentHost || "").trim();
  const browserOn = ["true", "1", "on", "yes"].includes(String(row.browserAccess || "").trim().toLowerCase());
  const hostOptions = getAgentHostOptions();
  const canPatch = typeof onSandboxRowPatch === "function";

  function patch(fields) {
    onSandboxRowPatch?.(fields);
  }

  function patchWithClearedAgentAuth(fields) {
    patch({ ...fields, ...EMPTY_AGENT_AUTH_PATCH });
  }

  return (
    <div className="dm-orchestration-config__section dm-workflow-agent-runtime">
      <span>Local agent runtime</span>
      <p className="dm-orchestration-config__hint">
        Same runtime fields as the Data Model sandbox sidecar. Local agent host uses the Paperclip thin adapter on this machine.
      </p>
      <label className={`dm-orchestration-config__field${adapterFlagClass}`}>
        <span>Execution adapter</span>
        <select
          value={adapter}
          disabled={disabled || !canPatch}
          onChange={(event) => {
            const nextAdapter = event.target.value;
            patchWithClearedAgentAuth({
              runLocality: "local",
              adapter: nextAdapter,
              agentHost: nextAdapter === "local-agent-host" ? (agentHost || "claude_local") : ""
            });
          }}
        >
          {LOCAL_AGENT_ADAPTERS.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </label>
      {adapter === "local-agent-host" && (
        <label className={`dm-orchestration-config__field${hostFlagClass}`}>
          <span>Agent host (Paperclip)</span>
          <select
            value={agentHost}
            disabled={disabled || !canPatch}
            onChange={(event) => patchWithClearedAgentAuth({
              runLocality: "local",
              adapter: "local-agent-host",
              agentHost: event.target.value
            })}
          >
            <option value="">Select host...</option>
            {hostOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
      )}
      {adapter === "local-agent-host" && isSandboxLocalAgentHost(row) && (
        <SandboxAgentAuthPanel
          objectId={objectId}
          rowName={rowName}
          draft={row}
          disabled={disabled || !canPatch}
          onPatchDraft={patch}
        />
      )}
      {adapter === "local-intelligence" && (
        <div className="dm-sandbox-local-intel">
          <label className="dm-orchestration-config__field">
            <span>Concrete model id</span>
            <input
              value={row.localModel || ""}
              disabled={disabled || !canPatch}
              placeholder="gemma3:4b"
              onChange={(event) => patch({ runLocality: "local", localModel: event.target.value })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Chat completions URL (optional)</span>
            <input
              value={row.localEndpoint || ""}
              disabled={disabled || !canPatch}
              placeholder="http://127.0.0.1:11434/v1/chat/completions"
              onChange={(event) => patch({ runLocality: "local", localEndpoint: event.target.value })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Resolver mode</span>
            <select
              value={String(row.intelligenceAdapterMode || "ollama").trim().toLowerCase()}
              disabled={disabled || !canPatch}
              onChange={(event) => patch({ runLocality: "local", intelligenceAdapterMode: event.target.value })}
            >
              {LOCAL_INTELLIGENCE_MODE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <p className="dm-orchestration-config__hint">
            Uses Instructions + Command as the task payload. With sandbox browser access off, tool intents stay proposals. With browser access on, browser tool intents execute through the local browser bridge before the final JSON response is returned.
          </p>
          {browserOn && (
            <p className="dm-orchestration-config__hint">
              This workflow's AI-agent nodes inherit browser access only when their node-level Network permission is enabled.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function buildNodeAgentAuthDraft(sandboxRow, config) {
  const agentHost = String(config?.agentHost || sandboxRow?.agentHost || "").trim();
  if (!agentHost) return null;
  return {
    ...(sandboxRow || {}),
    runLocality: "local",
    adapter: "local-agent-host",
    agentHost
  };
}

export function OrchestrationNodeConfigPanel({
  node,
  onConfigChange,
  onDeleteNode,
  disabled,
  registryRow,
  workspaceConfig,
  sandboxRow,
  objectId,
  rowName,
  onSandboxRowPatch,
  inputScheduleControls,
  serverlessScheduleOptionAvailable = false,
  serverlessScheduleAvailable = false,
  webhookTriggerAvailable = false,
  apiTriggerAvailable = false,
  readinessFlag,
  activeTab: controlledTab,
  onTabChange
}) {
  const [internalTab, setInternalTab] = useState("node");
  const [inputModeOpen, setInputModeOpen] = useState(false);
  const rawActiveTab = controlledTab ?? internalTab;

  function setActiveTab(tab) {
    if (controlledTab == null) setInternalTab(tab);
    onTabChange?.(tab);
  }

  const detectedFields = useMemo(
    () => detectFieldIdsFromLastResponse(registryRow?.lastResponse),
    [registryRow?.lastResponse]
  );

  if (!node) {
    return (
      <div className="dm-orchestration-config dm-orchestration-config--empty">
        <p>Select a node on the canvas to configure it in this panel.</p>
      </div>
    );
  }

  const config = node.config || {};
  const type = String(node.type || "");
  const schedulerAvailable = Boolean(serverlessScheduleOptionAvailable || serverlessScheduleAvailable);
  const inputModeOptions = [
    { value: "manual", label: "Manual", Icon: FileInput },
    { value: "record", label: "Record", Icon: Database },
    { value: "source-record", label: "Source Record", Icon: ListTree },
    ...(schedulerAvailable ? [{ value: "serverless-schedule", label: "Serverless Schedule", Icon: CalendarClock }] : []),
    // Inbound input methods are workspace-NATIVE capabilities — no external
    // account or marketplace install exists, so they are always offered. The
    // real readiness gate (signing secret / invoke token env ref) lives in the
    // trigger panel and on the server bind; both name the exact missing ref.
    { value: "webhook", label: "Webhook", Icon: Webhook },
    { value: "api-request", label: "API Request", Icon: KeyRound },
  ];
  const selectedInputMode = inputModeOptions.find((option) => option.value === (config.inputMode || "manual")) || inputModeOptions[0];
  const meta = config.requestHeadersMetadata || {};
  const workspaceObjects = (Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [])
    .filter((object) => object?.id && object?.objectType !== "sandbox-environment" && object?.objectType !== "api-registry");
  const selectedObject = getSelectedObject(workspaceObjects, config.objectId);
  const selectedObjectFields = getObjectFields(selectedObject);
  const selectedObjectFieldIds = selectedObjectFields.map((field) => field.id);

  function patchConfig(patch) {
    onConfigChange?.({ ...config, ...patch });
  }

  // Serverless-readiness atomic field flag. The scan maps each alert to the exact
  // config / sandbox-row field(s) that must change; we fill ONLY those fields
  // light-orange (the color is the guidance — no extra copy). `row:`-prefixed
  // hints (e.g. the execution adapter) match without the prefix here too.
  const readinessSeverity = readinessFlag?.severity === "blocked" ? "blocked" : "warning";
  const readinessFieldSet = new Set([
    ...(Array.isArray(readinessFlag?.configFields) ? readinessFlag.configFields : []),
    ...(Array.isArray(readinessFlag?.rowFields) ? readinessFlag.rowFields : []),
    ...(Array.isArray(readinessFlag?.fields) ? readinessFlag.fields.map((f) => String(f).replace(/^row:/, "")) : []),
  ]);
  const readinessTagSet = new Set(Array.isArray(readinessFlag?.deltaTags) ? readinessFlag.deltaTags : []);
  function flagFieldClass(...keys) {
    return keys.some((k) => readinessFieldSet.has(k)) ? ` dm-field--readiness is-${readinessSeverity}` : "";
  }

  const tabsForType = type === "api-registry-call" || type === "core-action"
    ? ["configuration", "test", "advanced"]
    : type === "input" || type === "transform-filter" || type === "data-action" || type === "data-trigger" || type === "ai-agent" || type === "flow-control" || type === "human-input"
      ? ["configuration", "advanced"]
      : ["configuration"];
  const activeTab = tabsForType.includes(rawActiveTab) ? rawActiveTab : "configuration";

  const registryConnected = isApiRegistryTestSuccessful(registryRow);
  const responseMode = config.responseMode || config.mode || "json";
  const nodeAgentAuthDraft = type === "ai-agent" ? buildNodeAgentAuthDraft(sandboxRow, config) : null;
  const canPatchSandboxRow = typeof onSandboxRowPatch === "function";
  const sandboxBrowserOn = ["true", "1", "on", "yes"].includes(String(sandboxRow?.browserAccess || "").trim().toLowerCase());
  const sandboxAdapter = String(sandboxRow?.adapter || "").trim();
  const nodeAdapter = String(config.adapter || "").trim() || sandboxAdapter;
  const nodeUsesLocalIntelligence = nodeAdapter === "local-intelligence";

  function patchNodeAgentHost(agentHost) {
    const nextHost = String(agentHost || "").trim();
    patchConfig({
      agentHost: nextHost,
      ...(nextHost ? { adapter: "local-agent-host" } : {})
    });
    if (nextHost && canPatchSandboxRow) {
      onSandboxRowPatch({
        runLocality: "local",
        adapter: "local-agent-host",
        agentHost: nextHost,
        ...EMPTY_AGENT_AUTH_PATCH
      });
    }
  }

  return (
    <div className="dm-orchestration-config">
      {tabsForType.length > 1 && (
        <div className="dm-orchestration-config__tabs" role="tablist">
          {tabsForType.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={activeTab === tab ? "is-active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      )}

      {activeTab === "configuration" && type === "input" && (
        <div className="dm-orchestration-config__pane">
          <div className="dm-orchestration-config__field">
            <span>Input mode</span>
            <div className={`dm-select dm-input-mode-select${inputModeOpen ? " open" : ""}${disabled ? " disabled" : ""}`}>
              <button
                type="button"
                className="dm-select-trigger"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={inputModeOpen}
                onClick={() => setInputModeOpen((open) => !open)}
              >
                <span>{selectedInputMode.label}</span>
                <ChevronDown size={15} aria-hidden="true" />
              </button>
              {inputModeOpen ? (
                <div className="dm-select-popover">
                  <div className="dm-select-list" role="listbox" aria-label="Input mode">
                    {inputModeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={option.value === selectedInputMode.value}
                        className={`dm-select-option${option.value === selectedInputMode.value ? " selected" : ""}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          patchConfig({ inputMode: option.value });
                          setInputModeOpen(false);
                        }}
                      >
                        <option.Icon size={14} aria-hidden="true" />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <PayloadKeyRows
            payload={config.samplePayload}
            disabled={disabled}
            onChange={(samplePayload) => patchConfig({ samplePayload })}
            flagClassName={flagFieldClass("samplePayload", "triggerInput")}
          />
          <p className="dm-orchestration-config__hint">
            Bind values with {"{{input.key}}"} in the API endpoint or body template.
          </p>
          {inputScheduleControls || null}
        </div>
      )}

      {activeTab === "configuration" && type === "api-registry-call" && (
        <div className="dm-orchestration-config__pane">
          {registryConnected && (
            <span className="dm-orchestration-config__badge is-connected">Connected</span>
          )}
          <label className="dm-orchestration-config__field">
            <span>Method</span>
            <select
              value={String(config.method || "GET").toUpperCase()}
              disabled={disabled}
              onChange={(e) => patchConfig({ method: e.target.value })}
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className={`dm-orchestration-config__field${flagFieldClass("endpoint")}`}>
            <span>Endpoint</span>
            <input value={config.endpoint || ""} disabled={disabled} onChange={(e) => patchConfig({ endpoint: e.target.value })} />
          </label>
          <label className={`dm-orchestration-config__field${flagFieldClass("bodyTemplate")}`}>
            <span>Body template</span>
            <textarea rows={3} value={config.bodyTemplate || ""} disabled={disabled} onChange={(e) => patchConfig({ bodyTemplate: e.target.value })} />
          </label>
          <label className={`dm-orchestration-config__field${flagFieldClass("authRef", "registryId", "integrationId")}`}>
            <span>Auth reference</span>
            <input value={config.authRef || ""} disabled={disabled} onChange={(e) => patchConfig({ authRef: e.target.value })} />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Auth header name</span>
            <input
              value={meta.authHeaderName || config.authHeaderName || ""}
              disabled={disabled}
              onChange={(e) => patchConfig({
                authHeaderName: e.target.value,
                requestHeadersMetadata: { ...meta, authHeaderName: e.target.value }
              })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Auth prefix</span>
            <input
              value={meta.authPrefix || config.authPrefix || ""}
              disabled={disabled}
              onChange={(e) => patchConfig({
                authPrefix: e.target.value,
                requestHeadersMetadata: { ...meta, authPrefix: e.target.value }
              })}
            />
          </label>
        </div>
      )}

      {activeTab === "configuration" && type === "transform-filter" && (
        <div className="dm-orchestration-config__pane">
          {detectedFields.length > 0 && (
            <p className="dm-orchestration-config__meta">{detectedFields.length} fields detected from last API test</p>
          )}
          <label className="dm-orchestration-config__field">
            <span>Root path</span>
            <input
              value={config.rootPath || ""}
              placeholder="data.items"
              disabled={disabled}
              onChange={(e) => patchConfig({ rootPath: e.target.value })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Response mode</span>
            <select
              value={responseMode}
              disabled={disabled}
              onChange={(e) => patchConfig({ responseMode: e.target.value, mode: e.target.value })}
            >
              <option value="json">json</option>
              <option value="array">array</option>
              <option value="object">object</option>
            </select>
          </label>
          <FieldMapRows
            fieldMap={config.fieldMap}
            fieldOptions={detectedFields}
            disabled={disabled}
            onChange={(fieldMap) => patchConfig({ fieldMap })}
          />
        </div>
      )}

      {activeTab === "configuration" && type === "tool-result" && (
        <div className="dm-orchestration-config__pane">
          {registryRow?.status && (
            <span className={`dm-orchestration-config__badge is-${String(registryRow.status).toLowerCase()}`}>
              Latest registry test: {registryRow.status}
            </span>
          )}
          <WorkflowCheckbox
            checked={config.writeLastResponse !== false}
            disabled={disabled}
            onChange={(checked) => patchConfig({ writeLastResponse: checked })}
          >
            Write lastResponse on success
          </WorkflowCheckbox>
          <WorkflowCheckbox
            checked={config.writeSourceRecord !== false}
            disabled={disabled}
            onChange={(checked) => patchConfig({ writeSourceRecord: checked })}
          >
            Write source record history
          </WorkflowCheckbox>
          <label className="dm-orchestration-config__field">
            <span>Success HTTP codes</span>
            <input
              value={Array.isArray(config.successStatusCodes) ? config.successStatusCodes.join(", ") : "200"}
              disabled={disabled}
              onChange={(e) => {
                const codes = e.target.value.split(",").map((v) => Number(v.trim())).filter(Number.isFinite);
                patchConfig({ successStatusCodes: codes.length ? codes : [200] });
              }}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Output mode</span>
            <input value={config.outputMode || "normalized-json"} disabled={disabled} onChange={(e) => patchConfig({ outputMode: e.target.value })} />
          </label>
          {registryRow?.lastResponse && (
            <div className="dm-orchestration-preview">
              <span>Registry test preview</span>
              <pre>{String(registryRow.lastResponse).slice(0, 400)}{String(registryRow.lastResponse).length > 400 ? "…" : ""}</pre>
            </div>
          )}
        </div>
      )}

      {activeTab === "configuration" && type === "thinAdapter" && (
        <div className="dm-orchestration-config__pane">
          <div className="dm-orchestration-config__section">
            <label className="dm-orchestration-config__field">
              <span>Node id</span>
              <input
                value={node.id || ""}
                disabled
              />
            </label>
            <label className="dm-orchestration-config__field">
              <span>Node type</span>
              <input value="AI Model" disabled />
            </label>
            <label className="dm-orchestration-config__field">
              <span>Model reference</span>
              <input
                value={node.sandbox || ""}
                disabled={disabled}
                onChange={(event) => patchConfig({ __nodePatch: { sandbox: event.target.value } })}
              />
            </label>
            <label className="dm-orchestration-config__field">
              <span>Execution policy</span>
              <select
                value={config.executionPolicy || "sequential"}
                disabled={disabled}
                onChange={(event) => patchConfig({ executionPolicy: event.target.value })}
              >
                <option value="sequential">sequential</option>
                <option value="parallel">parallel</option>
                <option value="conditional">conditional</option>
              </select>
            </label>
            <label className="dm-orchestration-config__field">
              <span>Input binding</span>
              <input
                value={config.inputBinding || ""}
                placeholder="{{previous.output}}"
                disabled={disabled}
                onChange={(event) => patchConfig({ inputBinding: event.target.value })}
              />
            </label>
            <label className="dm-orchestration-config__field">
              <span>Output key</span>
              <input
                value={config.outputKey || ""}
                placeholder="result"
                disabled={disabled}
                onChange={(event) => patchConfig({ outputKey: event.target.value })}
              />
            </label>
          </div>

          <VersionDeltaControls node={node} config={config} sandboxRow={sandboxRow} disabled={disabled} onChange={onConfigChange} flaggedTags={readinessTagSet} flagSeverity={readinessSeverity} />

          <details className="dm-orchestration-config__advanced-json dm-orchestration-config__node-json">
            <summary>Node JSON</summary>
            <pre className="dm-orchestration-preview"><code>{JSON.stringify(node, null, 2)}</code></pre>
          </details>
        </div>
      )}

      {activeTab === "configuration" && (type === "data-action" || type === "data-trigger") && (
        <div className="dm-orchestration-config__pane">
          {config.destructive && (
            <span className="dm-orchestration-config__badge is-failed">Double confirmation required</span>
          )}
          <label className="dm-orchestration-config__field">
            <span>Workspace object</span>
            <select
              value={config.objectId || ""}
              disabled={disabled}
              onChange={(e) => {
                const selected = workspaceObjects.find((object) => String(object.id) === e.target.value);
                const objectName = String(selected?.name || selected?.label || selected?.id || "");
                patchConfig({
                  objectId: e.target.value,
                  objectType: String(selected?.objectType || ""),
                  objectName,
                  __nodePatch: {
                    subtitle: objectName || "Select workspace object"
                  }
                });
              }}
            >
              <option value="">Select object</option>
              {workspaceObjects.map((object) => (
                <option key={object.id} value={object.id}>
                  {object.name || object.label || object.id}
                </option>
              ))}
            </select>
          </label>
          <label className="dm-orchestration-config__field">
            <span>Action</span>
            <select value={config.action || node.id || ""} disabled={disabled} onChange={(e) => patchConfig({ action: e.target.value })}>
              <option value="create-record">Create Record</option>
              <option value="update-record">Update Record</option>
              <option value="delete-record">Delete Record</option>
              <option value="search-records">Search Records</option>
              <option value="upsert-record">Create or Update Record</option>
              <option value="record-created">Record is created</option>
              <option value="record-updated">Record is updated</option>
              <option value="record-deleted">Record is deleted</option>
            </select>
          </label>
          {selectedObjectFields.length > 0 && (
            <div className="dm-orchestration-config__section">
              <span>Object fields</span>
              {(config.action === "search-records" || config.action === "update-record" || config.action === "delete-record" || config.action === "upsert-record") && (
                <FilterClauseList
                  filters={config.filters}
                  filterMode={config.filterMode}
                  disabled={disabled}
                  fieldOptions={selectedObjectFieldIds}
                  onChange={(filters, filterMode) => patchConfig({ filters, filterMode })}
                />
              )}
              {(config.action === "create-record" || config.action === "update-record" || config.action === "upsert-record") && (
                <FieldMapRows
                  fieldMap={config.fieldValues}
                  fieldOptions={selectedObjectFieldIds}
                  disabled={disabled}
                  onChange={(fieldValues) => patchConfig({ fieldValues })}
                />
              )}
              {config.action === "search-records" && (
                <>
                  <label className="dm-orchestration-config__field">
                    <span>Result limit</span>
                    <input type="number" min="1" value={config.limit ?? 25} disabled={disabled} onChange={(e) => patchConfig({ limit: Number(e.target.value) })} />
                  </label>
                  <label className="dm-orchestration-config__field">
                    <span>Sort field</span>
                    <select value={config.sortField || ""} disabled={disabled} onChange={(e) => patchConfig({ sortField: e.target.value })}>
                      <option value="">No sort</option>
                      {selectedObjectFields.map((field) => <option key={field.id} value={field.id}>{field.label}</option>)}
                    </select>
                  </label>
                </>
              )}
            </div>
          )}
          <WorkflowCheckbox
            checked={config.confirmationRequired === true}
            disabled={disabled || config.destructive === true}
            onChange={(checked) => patchConfig({ confirmationRequired: checked })}
          >
            Require confirmation before destructive or version-changing execution
          </WorkflowCheckbox>
          <p className="dm-orchestration-config__hint">
            Data actions bind only to this workspace data model. Execution resolves the latest object schema at run time.
          </p>
        </div>
      )}

      {activeTab === "configuration" && type === "ai-agent" && (config.role || config.taskPrompt || config.required != null) && (
        <div className="dm-orchestration-config__pane">
          <label className="dm-orchestration-config__field">
            <span>Role</span>
            <input
              value={config.role || node.label || ""}
              disabled={disabled}
              onChange={(e) => patchConfig({ role: e.target.value, __nodePatch: { label: e.target.value } })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Description</span>
            <input
              placeholder="One-sentence charter"
              value={config.description || ""}
              disabled={disabled}
              onChange={(e) => patchConfig({ description: e.target.value })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Task</span>
            <textarea
              rows={4}
              value={config.taskPrompt || ""}
              disabled={disabled}
              onChange={(e) => patchConfig({ taskPrompt: e.target.value })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Tools</span>
            <input
              placeholder="read, summarize"
              value={Array.isArray(config.tools) ? config.tools.join(", ") : ""}
              disabled={disabled}
              onChange={(e) => patchConfig({
                tools: e.target.value.split(",").map((t) => t.trim()).filter(Boolean)
              })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Max tokens</span>
            <input
              type="number"
              min="0"
              placeholder="0 = inherit"
              value={config.maxTokens || 0}
              disabled={disabled}
              onChange={(e) => patchConfig({ maxTokens: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Agent host</span>
            <select
              value={config.agentHost || ""}
              disabled={disabled}
              onChange={(e) => patchNodeAgentHost(e.target.value)}
            >
              <option value="">Inherit</option>
              {Object.entries(HOST_AUTH_CATALOG || {}).map(([slug, host]) => (
                <option key={slug} value={slug}>{host?.label || slug}</option>
              ))}
            </select>
          </label>
          {nodeAgentAuthDraft && isSandboxLocalAgentHost(nodeAgentAuthDraft) && (
            <SandboxAgentAuthPanel
              objectId={objectId}
              rowName={rowName}
              draft={nodeAgentAuthDraft}
              disabled={disabled || !canPatchSandboxRow}
              onPatchDraft={onSandboxRowPatch}
            />
          )}
          <WorkflowCheckbox
            checked={config.required !== false}
            disabled={disabled}
            onChange={(checked) => patchConfig({ required: checked })}
          >
            Required
          </WorkflowCheckbox>
          <WorkflowCheckbox
            checked={config.networkAccess === true}
            disabled={disabled}
            title={sandboxBrowserOn && nodeUsesLocalIntelligence
              ? "Network and browser are granted only when this node permission is on and the sandbox row has browser access on."
              : "Network is granted only when both this and the row's networkAllow are on. The row's browser access inherits through the same gate."}
            onChange={(checked) => patchConfig({ networkAccess: checked })}
          >
            {sandboxBrowserOn && nodeUsesLocalIntelligence ? "Network + browser" : "Network"}
          </WorkflowCheckbox>
        </div>
      )}

      {activeTab === "configuration" && type === "ai-agent" && !(config.role || config.taskPrompt || config.required != null) && (
        <div className="dm-orchestration-config__pane">
          <label className="dm-orchestration-config__field">
            <span>Model</span>
            <select value={config.model || MODEL_OPTIONS[0]} disabled={disabled} onChange={(e) => patchConfig({ model: e.target.value })}>
              {MODEL_OPTIONS.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </label>
          {(config.model || MODEL_OPTIONS[0]) === "Local agent host" && (
            <LocalAgentHostControls
              sandboxRow={sandboxRow}
              objectId={objectId}
              rowName={rowName}
              disabled={disabled}
              onSandboxRowPatch={onSandboxRowPatch}
              adapterFlagClass={flagFieldClass("adapter")}
              hostFlagClass={flagFieldClass("agentHost")}
            />
          )}
          <label className="dm-orchestration-config__field">
            <span>Input prompt</span>
            <textarea
              rows={4}
              placeholder="Describe what you want the AI to do..."
              value={config.prompt || ""}
              disabled={disabled}
              onChange={(e) => patchConfig({ prompt: e.target.value })}
            />
          </label>
          <div className="dm-orchestration-config__section">
            <span>Permissions</span>
            <WorkflowCheckbox checked={config.canReadWorkspace !== false} disabled={disabled} onChange={(checked) => patchConfig({ canReadWorkspace: checked })}>
              Read workspace data
            </WorkflowCheckbox>
            <WorkflowCheckbox checked={config.canWriteDraft === true} disabled={disabled} onChange={(checked) => patchConfig({ canWriteDraft: checked })}>
              Write draft changes only
            </WorkflowCheckbox>
            <WorkflowCheckbox
              checked={config.networkAccess === true}
              disabled={disabled}
              title={sandboxBrowserOn && nodeUsesLocalIntelligence
                ? "This node gets browser access only when this permission and the sandbox row Browser access toggle are both on."
                : undefined}
              onChange={(checked) => patchConfig({ networkAccess: checked })}
            >
              {sandboxBrowserOn && nodeUsesLocalIntelligence ? "Allow network + browser access" : "Allow network access"}
            </WorkflowCheckbox>
          </div>
          <KeyValueRows
            label="Output fields"
            entries={config.outputs}
            disabled={disabled}
            keyPlaceholder="Variable name"
            valuePlaceholder="Instruction for AI"
            onChange={(outputs) => patchConfig({ outputs })}
          />
          <label className="dm-orchestration-config__field">
            <span>Default output type</span>
            <select value={config.outputType || "Text"} disabled={disabled} onChange={(e) => patchConfig({ outputType: e.target.value })}>
              {OUTPUT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      )}

      {activeTab === "configuration" && type === "flow-control" && (
        <div className="dm-orchestration-config__pane">
          {config.action === "iterator" && (
            <>
              <label className="dm-orchestration-config__field">
                <span>Collection path</span>
                <input placeholder="{{previous.records}}" value={config.collectionPath || ""} disabled={disabled} onChange={(e) => patchConfig({ collectionPath: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Item variable</span>
                <input placeholder="item" value={config.itemVariable || "item"} disabled={disabled} onChange={(e) => patchConfig({ itemVariable: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Concurrency</span>
                <input type="number" min="1" value={config.concurrency ?? 1} disabled={disabled} onChange={(e) => patchConfig({ concurrency: Number(e.target.value) })} />
              </label>
            </>
          )}
          {config.action === "filter" && (
            <FilterClauseList
              filters={config.filters}
              filterMode={config.filterMode}
              disabled={disabled}
              fieldOptions={detectedFields}
              onChange={(filters, filterMode) => patchConfig({ filters, filterMode })}
            />
          )}
          {config.action === "if-else" && (
            <>
              <FilterClauseList
                filters={config.conditions}
                filterMode={config.conditionMode}
                disabled={disabled}
                fieldOptions={detectedFields}
                onChange={(conditions, conditionMode) => patchConfig({ conditions, conditionMode })}
              />
              <label className="dm-orchestration-config__field">
                <span>True branch label</span>
                <input value={config.trueLabel || "Yes"} disabled={disabled} onChange={(e) => patchConfig({ trueLabel: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>False branch label</span>
                <input value={config.falseLabel || "No"} disabled={disabled} onChange={(e) => patchConfig({ falseLabel: e.target.value })} />
              </label>
            </>
          )}
          {config.action === "delay" && (
            <>
              <label className="dm-orchestration-config__field">
                <span>Delay amount</span>
                <input type="number" min="1" value={config.delayAmount ?? 5} disabled={disabled} onChange={(e) => patchConfig({ delayAmount: Number(e.target.value) })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Delay unit</span>
                <select value={config.delayUnit || "minutes"} disabled={disabled} onChange={(e) => patchConfig({ delayUnit: e.target.value })}>
                  <option value="seconds">seconds</option>
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
              </label>
            </>
          )}
        </div>
      )}

      {activeTab === "configuration" && type === "core-action" && (
        <div className="dm-orchestration-config__pane">
          {(config.action === "http-request" || node.id === "http-request") && (
            <>
              <label className="dm-orchestration-config__field">
                <span>URL</span>
                <input placeholder="https://api.example.com/endpoint" value={config.url || ""} disabled={disabled} onChange={(e) => patchConfig({ url: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>HTTP Method</span>
                <select value={String(config.method || "GET").toUpperCase()} disabled={disabled} onChange={(e) => patchConfig({ method: e.target.value })}>
                  {HTTP_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </label>
              <KeyValueRows
                label="Headers Input"
                entries={config.headers}
                disabled={disabled}
                keyPlaceholder="Header name"
                valuePlaceholder="Header value"
                onChange={(headers) => patchConfig({ headers })}
              />
              <label className="dm-orchestration-config__field">
                <span>Request Body</span>
                <textarea rows={4} placeholder="{ }" value={config.body || ""} disabled={disabled} onChange={(e) => patchConfig({ body: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Expected Response Body</span>
                <textarea
                  rows={5}
                  placeholder={'{\n  "id": "123",\n  "status": "ok"\n}'}
                  value={config.expectedResponseBody || ""}
                  disabled={disabled}
                  onChange={(e) => patchConfig({ expectedResponseBody: e.target.value })}
                />
              </label>
            </>
          )}
          {(config.action === "send-email" || config.action === "draft-email") && (
            <>
              <label className="dm-orchestration-config__field">
                <span>To</span>
                <input placeholder="{{record.email}}" value={config.to || ""} disabled={disabled} onChange={(e) => patchConfig({ to: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Subject</span>
                <input value={config.subject || ""} disabled={disabled} onChange={(e) => patchConfig({ subject: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Message</span>
                <textarea rows={6} value={config.message || ""} disabled={disabled} onChange={(e) => patchConfig({ message: e.target.value })} />
              </label>
              <WorkflowCheckbox checked={config.requireApproval !== false} disabled={disabled} onChange={(checked) => patchConfig({ requireApproval: checked })}>
                Require approval before sending
              </WorkflowCheckbox>
            </>
          )}
          {config.action === "code-function" && (
            <>
              <label className="dm-orchestration-config__field">
                <span>Function name</span>
                <input value={config.functionName || "logicFunction"} disabled={disabled} onChange={(e) => patchConfig({ functionName: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Code</span>
                <textarea rows={8} placeholder="return input;" value={config.code || ""} disabled={disabled} onChange={(e) => patchConfig({ code: e.target.value })} />
              </label>
              <KeyValueRows label="Environment references" entries={config.envRefs} disabled={disabled} onChange={(envRefs) => patchConfig({ envRefs })} />
            </>
          )}
        </div>
      )}

      {activeTab === "configuration" && type === "human-input" && (
        <div className="dm-orchestration-config__pane">
          <label className="dm-orchestration-config__field">
            <span>Form title</span>
            <input value={config.title || "Review input"} disabled={disabled} onChange={(e) => patchConfig({ title: e.target.value })} />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Instructions</span>
            <textarea rows={4} value={config.instructions || ""} disabled={disabled} onChange={(e) => patchConfig({ instructions: e.target.value })} />
          </label>
          <KeyValueRows
            label="Form fields"
            entries={config.fields}
            disabled={disabled}
            keyPlaceholder="Field name"
            valuePlaceholder="Field type or help text"
            onChange={(fields) => patchConfig({ fields })}
          />
          <WorkflowCheckbox checked={config.required !== false} disabled={disabled} onChange={(checked) => patchConfig({ required: checked })}>
            Require response before continuing
          </WorkflowCheckbox>
        </div>
      )}

      {activeTab === "test" && (
        <div className="dm-orchestration-config__pane">
          <label className="dm-orchestration-config__field">
            <span>Success condition</span>
            <input value={config.successCondition || "HTTP 200 or successful execution"} disabled={disabled} onChange={(e) => patchConfig({ successCondition: e.target.value })} />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Sample response</span>
            <textarea rows={5} value={config.sampleResponse || ""} disabled={disabled} onChange={(e) => patchConfig({ sampleResponse: e.target.value })} />
          </label>
          <WorkflowCheckbox checked={config.blockPublishOnFailure !== false} disabled={disabled} onChange={(checked) => patchConfig({ blockPublishOnFailure: checked })}>
            Block Publish unless this step passes
          </WorkflowCheckbox>
        </div>
      )}

      {activeTab === "advanced" && (type === "data-action" || type === "data-trigger" || type === "ai-agent" || type === "flow-control" || type === "core-action" || type === "human-input") && (
        <div className="dm-orchestration-config__pane">
          <details className="dm-orchestration-config__advanced-json" open>
            <summary>Advanced JSON</summary>
            <pre className="dm-orchestration-preview">{JSON.stringify(config, null, 2)}</pre>
          </details>
        </div>
      )}

      {activeTab === "filters" && (type === "input" || type === "transform-filter") && (
        <FilterClauseList
          filters={config.filters}
          filterMode={config.filterMode}
          disabled={disabled}
          fieldOptions={type === "transform-filter" ? detectedFields : []}
          onChange={(filters, filterMode) => patchConfig({ filters, filterMode })}
        />
      )}

      {activeTab === "preview" && (
        <div className="dm-orchestration-config__pane">
          {type === "thinAdapter" ? (
            <>
              <ul className="dm-orchestration-config__preview-list">
                <li>Sandbox: {node.sandbox || node.id || "unknown"}</li>
                <li>Type: thinAdapter</li>
              </ul>
              <details className="dm-orchestration-config__advanced-json dm-orchestration-config__node-json">
                <summary>Node JSON</summary>
                <pre className="dm-orchestration-preview"><code>{JSON.stringify(node, null, 2)}</code></pre>
              </details>
            </>
          ) : type === "tool-result" ? (
            <>
              <p className="dm-orchestration-config__hint">
                After Run sandbox, status, lastTested, and lastResponse update on the sandbox row.
              </p>
              <ul className="dm-orchestration-config__preview-list">
                <li>Success codes: {Array.isArray(config.successStatusCodes) ? config.successStatusCodes.join(", ") : "200"}</li>
                <li>Write lastResponse: {config.writeLastResponse !== false ? "yes" : "no"}</li>
                <li>Write source record: {config.writeSourceRecord !== false ? "yes" : "no"}</li>
                <li>Output mode: {config.outputMode || "normalized-json"}</li>
              </ul>
              {registryRow?.lastResponse && (
                <div className="dm-orchestration-preview">
                  <span>Latest API test output (preview)</span>
                  <pre>{String(registryRow.lastResponse).slice(0, 500)}{String(registryRow.lastResponse).length > 500 ? "…" : ""}</pre>
                </div>
              )}
            </>
          ) : (
            <p className="dm-orchestration-config__hint">Advanced node configuration preview.</p>
          )}
          <details className="dm-orchestration-config__advanced-json">
            <summary>Advanced JSON</summary>
            <pre className="dm-orchestration-preview">{JSON.stringify(config, null, 2)}</pre>
          </details>
        </div>
      )}

      {activeTab === "advanced" && (
        <div className="dm-orchestration-config__pane">
          {type === "api-registry-call" && (
            <>
              <label className="dm-orchestration-config__field">
                <span>Timeout (ms)</span>
                <input
                  type="number"
                  value={config.timeoutMs ?? 30000}
                  disabled={disabled}
                  onChange={(e) => patchConfig({ timeoutMs: Number(e.target.value) })}
                />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Query params (JSON object)</span>
                <textarea
                  rows={2}
                  disabled={disabled}
                  value={JSON.stringify(config.queryParams || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      patchConfig({ queryParams: JSON.parse(e.target.value || "{}") });
                    } catch {
                      /* keep typing */
                    }
                  }}
                />
              </label>
            </>
          )}
          {type === "input" && (
            <>
              <label className="dm-orchestration-config__field">
                <span>Source type</span>
                <input value={config.sourceType || ""} disabled={disabled} onChange={(e) => patchConfig({ sourceType: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Source ID</span>
                <input value={config.sourceId || ""} disabled={disabled} onChange={(e) => patchConfig({ sourceId: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Entity ID</span>
                <input value={config.entityId || ""} disabled={disabled} onChange={(e) => patchConfig({ entityId: e.target.value })} />
              </label>
            </>
          )}
          {type === "transform-filter" && (
            <>
              <label className="dm-orchestration-config__field">
                <span>Max rows (0 = no limit)</span>
                <input
                  type="number"
                  value={config.maxRows ?? 0}
                  disabled={disabled}
                  onChange={(e) => patchConfig({ maxRows: Number(e.target.value) })}
                />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Include fields (comma-separated)</span>
                <input
                  value={Array.isArray(config.includeFields) ? config.includeFields.join(", ") : ""}
                  disabled={disabled}
                  onChange={(e) => patchConfig({
                    includeFields: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                  })}
                />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Exclude fields (comma-separated)</span>
                <input
                  value={Array.isArray(config.excludeFields) ? config.excludeFields.join(", ") : ""}
                  disabled={disabled}
                  onChange={(e) => patchConfig({
                    excludeFields: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                  })}
                />
              </label>
            </>
          )}
          {type === "tool-result" && (
            <>
              <label className="dm-orchestration-config__field">
                <span>Preview fields (comma-separated)</span>
                <input
                  value={Array.isArray(config.previewFields) ? config.previewFields.join(", ") : ""}
                  disabled={disabled}
                  onChange={(e) => patchConfig({
                    previewFields: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                  })}
                />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Status field name</span>
                <input value={config.statusField || "status"} disabled={disabled} onChange={(e) => patchConfig({ statusField: e.target.value })} />
              </label>
              <label className="dm-orchestration-config__field">
                <span>Last tested field name</span>
                <input value={config.lastTestedField || "lastTested"} disabled={disabled} onChange={(e) => patchConfig({ lastTestedField: e.target.value })} />
              </label>
            </>
          )}
          {(type === "input" || type === "transform-filter") && (
            <details className="dm-orchestration-config__advanced-json">
              <summary>Advanced JSON</summary>
              <pre className="dm-orchestration-preview">{JSON.stringify(config, null, 2)}</pre>
            </details>
          )}
        </div>
      )}

      {activeTab === "configuration" && type !== "thinAdapter" && (
        <VersionDeltaControls node={node} config={config} sandboxRow={sandboxRow} disabled={disabled} onChange={onConfigChange} flaggedTags={readinessTagSet} flagSeverity={readinessSeverity} />
      )}
      <div className="dm-workflow-node-config-foot">
        <button type="button" className="dm-workflow-node-options" disabled={disabled}>
          Options ⌘O
        </button>
        <button type="button" className="dm-workflow-node-delete" disabled={disabled} onClick={onDeleteNode}>
          Delete
        </button>
      </div>
    </div>
  );
}
