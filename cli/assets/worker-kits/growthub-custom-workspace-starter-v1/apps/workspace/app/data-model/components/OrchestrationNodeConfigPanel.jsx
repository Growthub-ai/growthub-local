"use client";

import { useState } from "react";
import { FILTER_CONJUNCTIONS, FILTER_OPERATORS } from "@/lib/orchestration-graph";

const TABS = ["node", "filters", "preview", "advanced"];

function FilterClauseList({ filters, filterMode, onChange, disabled, fieldPlaceholder }) {
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
      <label className="dm-orchestration-config__field">
        <span>Match</span>
        <select
          value={mode}
          disabled={disabled}
          onChange={(e) => onChange(clauses, e.target.value)}
        >
          {FILTER_CONJUNCTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      {clauses.map((clause, index) => (
        <div key={index} className="dm-orchestration-config__filter-row">
          <input
            placeholder={fieldPlaceholder || "fieldId"}
            value={clause.fieldId || ""}
            disabled={disabled}
            onChange={(e) => updateClause(index, { fieldId: e.target.value })}
          />
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

function FieldMapEditor({ fieldMap, onChange, disabled }) {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(fieldMap || {}, null, 2));
  const [error, setError] = useState("");

  function applyJson() {
    try {
      const parsed = JSON.parse(jsonText || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        onChange(parsed);
        setError("");
      } else {
        setError("Field map must be a JSON object");
      }
    } catch {
      setError("Invalid JSON");
    }
  }

  return (
    <label className="dm-orchestration-config__field">
      <span>Field map (target → source path)</span>
      <textarea
        rows={5}
        value={jsonText}
        disabled={disabled}
        onChange={(e) => setJsonText(e.target.value)}
        onBlur={applyJson}
      />
      {error && <p className="dm-orchestration-config__error">{error}</p>}
    </label>
  );
}

export function OrchestrationNodeConfigPanel({ node, onConfigChange, disabled, registryRow }) {
  const [activeTab, setActiveTab] = useState("node");
  if (!node) {
    return (
      <div className="dm-orchestration-config dm-orchestration-config--empty">
        <p>Select a node on the canvas to configure input, API request, transform, or result settings.</p>
      </div>
    );
  }

  const config = node.config || {};
  const type = String(node.type || "");

  function patchConfig(patch) {
    onConfigChange?.({ ...config, ...patch });
  }

  const tabsForType = type === "input" || type === "transform-filter"
    ? TABS
    : type === "api-registry-call"
      ? ["node", "preview", "advanced"]
      : ["node", "preview"];

  return (
    <div className="dm-orchestration-config">
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
          <label className="dm-orchestration-config__field">
            <span>Sample payload (JSON)</span>
            <textarea
              rows={4}
              disabled={disabled}
              value={typeof config.samplePayload === "string" ? config.samplePayload : JSON.stringify(config.samplePayload || {}, null, 2)}
              onChange={(e) => {
                try {
                  patchConfig({ samplePayload: JSON.parse(e.target.value || "{}") });
                } catch {
                  patchConfig({ samplePayload: e.target.value });
                }
              }}
            />
          </label>
          <p className="dm-orchestration-config__hint">Use {"{{input.field}}"} in the API node endpoint or body.</p>
        </div>
      )}

      {activeTab === "node" && type === "api-registry-call" && (
        <div className="dm-orchestration-config__pane">
          <label className="dm-orchestration-config__field">
            <span>Endpoint</span>
            <input value={config.endpoint || ""} disabled={disabled} onChange={(e) => patchConfig({ endpoint: e.target.value })} />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Method</span>
            <input value={config.method || "GET"} disabled={disabled} onChange={(e) => patchConfig({ method: e.target.value })} />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Body template</span>
            <textarea rows={3} value={config.bodyTemplate || ""} disabled={disabled} onChange={(e) => patchConfig({ bodyTemplate: e.target.value })} />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Auth reference (slug only)</span>
            <input value={config.authRef || ""} disabled={disabled} onChange={(e) => patchConfig({ authRef: e.target.value })} />
          </label>
        </div>
      )}

      {activeTab === "node" && type === "transform-filter" && (
        <div className="dm-orchestration-config__pane">
          <label className="dm-orchestration-config__field">
            <span>Root path</span>
            <input value={config.rootPath || "data"} disabled={disabled} onChange={(e) => patchConfig({ rootPath: e.target.value })} />
          </label>
          <label className="dm-orchestration-config__field">
            <span>Mode</span>
            <select value={config.mode || "json"} disabled={disabled} onChange={(e) => patchConfig({ mode: e.target.value })}>
              <option value="json">json</option>
              <option value="array">array</option>
              <option value="object">object</option>
            </select>
          </label>
          <FieldMapEditor fieldMap={config.fieldMap} disabled={disabled} onChange={(fieldMap) => patchConfig({ fieldMap })} />
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
            <span>Output mode</span>
            <input value={config.outputMode || "normalized-json"} disabled={disabled} onChange={(e) => patchConfig({ outputMode: e.target.value })} />
          </label>
        </div>
      )}

      {activeTab === "filters" && (type === "input" || type === "transform-filter") && (
        <FilterClauseList
          filters={config.filters}
          filterMode={config.filterMode}
          disabled={disabled}
          fieldPlaceholder={type === "transform-filter" ? "mapped field" : "payload field"}
          onChange={(filters, filterMode) => patchConfig({ filters, filterMode })}
        />
      )}

      {activeTab === "preview" && (
        <div className="dm-orchestration-config__pane">
          <pre className="dm-orchestration-config__preview">{JSON.stringify(config, null, 2)}</pre>
          {registryRow?.lastResponse && type === "transform-filter" && (
            <p className="dm-orchestration-config__hint">Last API test response is available on the registry row for field discovery.</p>
          )}
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
                <span>Auth header name</span>
                <input
                  value={config.requestHeadersMetadata?.authHeaderName || ""}
                  disabled={disabled}
                  onChange={(e) => patchConfig({
                    requestHeadersMetadata: {
                      ...(config.requestHeadersMetadata || {}),
                      authHeaderName: e.target.value
                    }
                  })}
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
        </div>
      )}
    </div>
  );
}
