"use client";

import { useMemo, useState } from "react";
import {
  detectFieldIdsFromLastResponse,
  FILTER_CONJUNCTIONS,
  FILTER_OPERATORS,
  isApiRegistryTestSuccessful
} from "@/lib/orchestration-graph";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const MODEL_OPTIONS = ["Claude Opus 4.6", "Claude Sonnet 4.5", "GPT-5.2", "Local agent host"];
const OUTPUT_TYPES = ["Text", "Number", "Boolean", "JSON", "Record ID"];
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

function PayloadKeyRows({ payload, onChange, disabled }) {
  const entries = Object.entries(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {});

  function setEntries(nextEntries) {
    onChange(Object.fromEntries(nextEntries.filter(([k]) => String(k).trim())));
  }

  return (
    <div className="dm-orchestration-config__payload">
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

function VersionDeltaControls({ node, config, sandboxRow, onChange, disabled }) {
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
            <label key={tag} className="dm-orchestration-config__field">
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

export function OrchestrationNodeConfigPanel({
  node,
  onConfigChange,
  onDeleteNode,
  disabled,
  registryRow,
  workspaceConfig,
  sandboxRow,
  activeTab: controlledTab,
  onTabChange
}) {
  const [internalTab, setInternalTab] = useState("node");
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
  const meta = config.requestHeadersMetadata || {};
  const workspaceObjects = (Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [])
    .filter((object) => object?.id && object?.objectType !== "sandbox-environment" && object?.objectType !== "api-registry");
  const selectedObject = getSelectedObject(workspaceObjects, config.objectId);
  const selectedObjectFields = getObjectFields(selectedObject);
  const selectedObjectFieldIds = selectedObjectFields.map((field) => field.id);

  function patchConfig(patch) {
    onConfigChange?.({ ...config, ...patch });
  }

  const tabsForType = type === "api-registry-call" || type === "core-action"
    ? ["configuration", "test", "advanced"]
    : type === "input" || type === "transform-filter" || type === "data-action" || type === "data-trigger" || type === "ai-agent" || type === "flow-control" || type === "human-input"
      ? ["configuration", "advanced"]
      : ["configuration"];
  const activeTab = tabsForType.includes(rawActiveTab) ? rawActiveTab : "configuration";

  const registryConnected = isApiRegistryTestSuccessful(registryRow);
  const responseMode = config.responseMode || config.mode || "json";

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
          <label className="dm-orchestration-config__field">
            <span>Input mode</span>
            <select value={config.inputMode || "manual"} disabled={disabled} onChange={(e) => patchConfig({ inputMode: e.target.value })}>
              <option value="manual">manual</option>
              <option value="record">record</option>
              <option value="source-record">source-record</option>
            </select>
          </label>
          <PayloadKeyRows
            payload={config.samplePayload}
            disabled={disabled}
            onChange={(samplePayload) => patchConfig({ samplePayload })}
          />
          <p className="dm-orchestration-config__hint">
            Bind values with {"{{input.key}}"} in the API endpoint or body template.
          </p>
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
          <label className="dm-orchestration-config__field">
            <span>Endpoint</span>
            <input value={config.endpoint || ""} disabled={disabled} onChange={(e) => patchConfig({ endpoint: e.target.value })} />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Body template</span>
            <textarea rows={3} value={config.bodyTemplate || ""} disabled={disabled} onChange={(e) => patchConfig({ bodyTemplate: e.target.value })} />
          </label>
          <label className="dm-orchestration-config__field">
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
          <label className="dm-orchestration-config__field dm-orchestration-config__field-inline">
            <input
              type="checkbox"
              checked={config.writeLastResponse !== false}
              disabled={disabled}
              onChange={(e) => patchConfig({ writeLastResponse: e.target.checked })}
            />
            <span>Write lastResponse on success</span>
          </label>
          <label className="dm-orchestration-config__field dm-orchestration-config__field-inline">
            <input
              type="checkbox"
              checked={config.writeSourceRecord !== false}
              disabled={disabled}
              onChange={(e) => patchConfig({ writeSourceRecord: e.target.checked })}
            />
            <span>Write source record history</span>
          </label>
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

          <VersionDeltaControls node={node} config={config} sandboxRow={sandboxRow} disabled={disabled} onChange={onConfigChange} />

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
          <label className="dm-orchestration-config__field dm-orchestration-config__field-inline">
            <input
              type="checkbox"
              checked={config.confirmationRequired === true}
              disabled={disabled || config.destructive === true}
              onChange={(e) => patchConfig({ confirmationRequired: e.target.checked })}
            />
            <span>Require confirmation before destructive or version-changing execution</span>
          </label>
          <p className="dm-orchestration-config__hint">
            Data actions bind only to this workspace data model. Execution resolves the latest object schema at run time.
          </p>
        </div>
      )}

      {activeTab === "configuration" && type === "ai-agent" && (
        <div className="dm-orchestration-config__pane">
          <label className="dm-orchestration-config__field">
            <span>Model</span>
            <select value={config.model || MODEL_OPTIONS[0]} disabled={disabled} onChange={(e) => patchConfig({ model: e.target.value })}>
              {MODEL_OPTIONS.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </label>
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
            <label className="dm-orchestration-config__field dm-orchestration-config__field-inline">
              <input
                type="checkbox"
                checked={config.canReadWorkspace !== false}
                disabled={disabled}
                onChange={(e) => patchConfig({ canReadWorkspace: e.target.checked })}
              />
              <span>Read workspace data</span>
            </label>
            <label className="dm-orchestration-config__field dm-orchestration-config__field-inline">
              <input
                type="checkbox"
                checked={config.canWriteDraft === true}
                disabled={disabled}
                onChange={(e) => patchConfig({ canWriteDraft: e.target.checked })}
              />
              <span>Write draft changes only</span>
            </label>
            <label className="dm-orchestration-config__field dm-orchestration-config__field-inline">
              <input
                type="checkbox"
                checked={config.networkAccess === true}
                disabled={disabled}
                onChange={(e) => patchConfig({ networkAccess: e.target.checked })}
              />
              <span>Allow network access</span>
            </label>
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
              <label className="dm-orchestration-config__field dm-orchestration-config__field-inline">
                <input type="checkbox" checked={config.requireApproval !== false} disabled={disabled} onChange={(e) => patchConfig({ requireApproval: e.target.checked })} />
                <span>Require approval before sending</span>
              </label>
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
          <label className="dm-orchestration-config__field dm-orchestration-config__field-inline">
            <input type="checkbox" checked={config.required !== false} disabled={disabled} onChange={(e) => patchConfig({ required: e.target.checked })} />
            <span>Require response before continuing</span>
          </label>
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
          <label className="dm-orchestration-config__field dm-orchestration-config__field-inline">
            <input type="checkbox" checked={config.blockPublishOnFailure !== false} disabled={disabled} onChange={(e) => patchConfig({ blockPublishOnFailure: e.target.checked })} />
            <span>Block Publish unless this step passes</span>
          </label>
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
        <VersionDeltaControls node={node} config={config} sandboxRow={sandboxRow} disabled={disabled} onChange={onConfigChange} />
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
