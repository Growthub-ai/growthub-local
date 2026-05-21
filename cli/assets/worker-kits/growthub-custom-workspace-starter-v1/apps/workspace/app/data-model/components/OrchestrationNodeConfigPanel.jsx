"use client";

import { useEffect, useMemo, useState } from "react";
import {
  detectFieldIdsFromLastResponse,
  FILTER_CONJUNCTIONS,
  FILTER_OPERATORS,
  isApiRegistryTestSuccessful
} from "@/lib/orchestration-graph";

const TABS = ["node", "filters", "preview", "advanced"];

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

export function OrchestrationNodeConfigPanel({
  node,
  onConfigChange,
  disabled,
  registryRow,
  activeTab: controlledTab,
  onTabChange
}) {
  const [internalTab, setInternalTab] = useState("node");
  const activeTab = controlledTab ?? internalTab;

  function setActiveTab(tab) {
    setInternalTab(tab);
    onTabChange?.(tab);
  }

  useEffect(() => {
    setActiveTab("node");
  }, [node?.id]);

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

  function patchConfig(patch) {
    onConfigChange?.({ ...config, ...patch });
  }

  const tabsForType = type === "input" || type === "transform-filter"
    ? TABS
    : type === "api-registry-call"
      ? ["node", "preview", "advanced"]
      : ["node", "preview"];

  const registryConnected = isApiRegistryTestSuccessful(registryRow);
  const responseMode = config.responseMode || config.mode || "json";

  return (
    <div className="dm-orchestration-config">
      <div className="dm-orchestration-config__head">
        <p className="dm-orchestration-config__node-kind">{node.label || node.id}</p>
        <p className="dm-orchestration-config__node-sub">{node.subtitle || type}</p>
      </div>
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

      {activeTab === "node" && type === "input" && (
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

      {activeTab === "node" && type === "api-registry-call" && (
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

      {activeTab === "node" && type === "transform-filter" && (
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

      {activeTab === "node" && type === "tool-result" && (
        <div className="dm-orchestration-config__pane">
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
          {type === "tool-result" ? (
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
            <label className="dm-orchestration-config__field">
              <span>Timeout (ms)</span>
              <input
                type="number"
                value={config.timeoutMs ?? 30000}
                disabled={disabled}
                onChange={(e) => patchConfig({ timeoutMs: Number(e.target.value) })}
              />
            </label>
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
            <label className="dm-orchestration-config__field">
              <span>Max rows (0 = no limit)</span>
              <input
                type="number"
                value={config.maxRows ?? 0}
                disabled={disabled}
                onChange={(e) => patchConfig({ maxRows: Number(e.target.value) })}
              />
            </label>
          )}
          {(type === "input" || type === "transform-filter") && (
            <details className="dm-orchestration-config__advanced-json">
              <summary>Advanced JSON</summary>
              <pre className="dm-orchestration-preview">{JSON.stringify(config, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
