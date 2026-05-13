function parseCsv(text) {
  const lines = String(text || "").trim().split("\n").filter(Boolean);
  if (!lines.length) return { columns: [], rows: [] };
  const parseLine = (line) => {
    const cells = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (quoted && line[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === "," && !quoted) {
        cells.push(value);
        value = "";
      } else {
        value += char;
      }
    }
    cells.push(value);
    return cells;
  };
  const columns = parseLine(lines[0]).map((cell) => cell.trim()).filter(Boolean);
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line);
    return columns.reduce((record, column, index) => {
      record[column] = (cells[index] || "").trim();
      return record;
    }, {});
  });
  return { columns, rows };
}

function toCsv(columns, rows) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const header = columns.map(escape).join(",");
  const body = rows.map((row) => columns.map((column) => escape(row?.[column])).join(",")).join("\n");
  return body ? `${header}\n${body}` : header;
}

function parseJsonRows(text) {
  try {
    const parsed = JSON.parse(text || "[]");
    const rows = Array.isArray(parsed) ? parsed.filter((row) => row && typeof row === "object" && !Array.isArray(row)) : [];
    const columns = Array.from(rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set()));
    return { columns, rows };
  } catch {
    return { columns: [], rows: [] };
  }
}

function listWidgetEntries(workspaceConfig) {
  const entries = [];
  const seen = new Set();
  const push = (widget, location) => {
    if (!widget?.id || seen.has(widget.id)) return;
    seen.add(widget.id);
    entries.push({ widget, location });
  };

  for (const dashboard of workspaceConfig?.dashboards || []) {
    for (const tab of dashboard.tabs || []) {
      for (const widget of tab.widgets || []) {
        push(widget, {
          dashboardId: dashboard.id,
          dashboardName: dashboard.name,
          tabId: tab.id,
          tabName: tab.name,
          widgetId: widget.id
        });
      }
    }
  }

  const canvas = workspaceConfig?.canvas;
  for (const tab of canvas?.tabs || []) {
    for (const widget of tab.widgets || []) {
      push(widget, { dashboardId: null, dashboardName: null, tabId: tab.id, tabName: tab.name, widgetId: widget.id });
    }
  }
  for (const widget of canvas?.widgets || []) {
    push(widget, { dashboardId: null, dashboardName: null, tabId: null, tabName: canvas.name || "Tab 1", widgetId: widget.id });
  }

  return entries;
}

function bindingColumns(binding) {
  const fields = Array.isArray(binding?.fields) ? binding.fields : [];
  return Array.from(new Set([...fields, "id", "label", "entityType", "provider", "lane", "status"])).filter(Boolean);
}

function deriveWidgetTable(widget, location) {
  const config = widget.config || {};
  const binding = config.binding && typeof config.binding === "object" && !Array.isArray(config.binding) ? config.binding : null;

  if (widget.kind === "view") {
    if (binding?.sourceType === "workspace-data-model") return null;
    const source = config.source || widget.title || "Untitled";
    const integration = binding?.mode === "integration";
    const columns = integration ? bindingColumns(binding) : (Array.isArray(config.columns) ? config.columns : []);
    const rows = integration && (binding.entityId || binding.entityLabel)
      ? [{ id: binding.entityId || "", label: binding.entityLabel || binding.entityId || "", entityType: binding.entityType || "", provider: binding.provider || "", lane: binding.lane || "", status: binding.status || "" }]
      : (Array.isArray(config.rows) ? config.rows : []);
    return { source, columns, rows, binding: binding || { mode: "manual", source: "Manual rows" }, mutable: !integration, storage: "view" };
  }

  if (binding?.mode === "integration") {
    const source = binding.entityLabel || binding.source || widget.title || "Integration reference";
    const rows = binding.entityId || binding.entityLabel
      ? [{ id: binding.entityId || "", label: binding.entityLabel || binding.entityId || "", entityType: binding.entityType || "", provider: binding.provider || "", lane: binding.lane || "", status: binding.status || "" }]
      : [];
    return { source, columns: bindingColumns(binding), rows, binding, mutable: false, storage: "integration" };
  }

  if (binding?.mode === "json" && typeof binding.json === "string") {
    const parsed = parseJsonRows(binding.json);
    return { source: binding.source || widget.title || "JSON binding", columns: parsed.columns, rows: parsed.rows, binding, mutable: true, storage: "json" };
  }

  if (binding?.mode === "csv" && typeof binding.csv === "string") {
    const parsed = parseCsv(binding.csv);
    return { source: binding.source || widget.title || "CSV binding", columns: parsed.columns, rows: parsed.rows, binding, mutable: true, storage: "csv" };
  }

  if (binding?.mode === "manual" && Array.isArray(binding.rows)) {
    const columns = Array.from(binding.rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set()));
    return { source: binding.source || widget.title || "Manual rows", columns, rows: binding.rows, binding, mutable: true, storage: "manual-binding" };
  }

  if (widget.kind === "chart" && Array.isArray(config.values)) {
    return {
      source: widget.title || "Chart values",
      columns: ["Index", "Value"],
      rows: config.values.map((value, index) => ({ Index: index + 1, Value: value })),
      binding: binding || { mode: "manual", source: "Chart values" },
      mutable: true,
      storage: "chart-values"
    };
  }

  return null;
}

function tableId(source, columns) {
  return `table:${source}:${columns.join("\0")}`;
}

function normalizeManualObjects(workspaceConfig) {
  return Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
}

function objectUsesFieldSchema(object) {
  return Array.isArray(object.fields) && object.fields.length > 0;
}

function orderedVisibleFields(object) {
  const all = (object.fields || []).filter((f) => f && f.isVisible !== false);
  const order = Array.isArray(object.fieldSettings?.order) ? object.fieldSettings.order : [];
  const byId = new Map(all.map((f) => [f.id, f]));
  const seen = new Set();
  const out = [];
  for (const id of order) {
    const f = byId.get(id);
    if (f) {
      out.push(f);
      seen.add(id);
    }
  }
  for (const f of all) {
    if (!seen.has(f.id)) out.push(f);
  }
  return out;
}

function mergeFlatRowFromEnvelope(row, columnIds) {
  if (row && typeof row === "object" && row.data && typeof row.data === "object" && !Array.isArray(row.data)) {
    const id = typeof row.id === "string" && row.id ? row.id : "";
    const merged = { id, ...row.data };
    for (const col of columnIds) {
      if (merged[col] === undefined) merged[col] = "";
    }
    return merged;
  }
  const id = typeof row?.id === "string" ? row.id : "";
  const merged = { id, ...row };
  for (const col of columnIds) {
    if (merged[col] === undefined) merged[col] = "";
  }
  return merged;
}

function flatRowsToEnvelopeRows(rows, columnIds) {
  return rows.map((flat, idx) => {
    const id = typeof flat.id === "string" && flat.id
      ? flat.id
      : `row_${Date.now().toString(36)}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
    const data = {};
    for (const col of columnIds) {
      data[col] = flat[col] ?? "";
    }
    return { id, data };
  });
}

function deriveManualObjectTable(object) {
  const useSchema = objectUsesFieldSchema(object);
  const fieldsOrdered = useSchema ? orderedVisibleFields(object) : [];
  const columns = useSchema
    ? fieldsOrdered.map((f) => f.id)
    : (Array.isArray(object.columns) ? object.columns.filter(Boolean) : []);
  const rawRows = Array.isArray(object.rows) ? object.rows.filter((row) => row && typeof row === "object" && !Array.isArray(row)) : [];
  const rows = useSchema
    ? rawRows.map((row) => mergeFlatRowFromEnvelope(row, columns))
    : rawRows;
  const source = object.source || object.label || object.name || "Manual object";
  return {
    id: `manual-object:${object.id || source}`,
    label: object.label || object.name || source,
    source,
    objectType: object.objectType || "custom",
    icon: object.icon || null,
    columns,
    rows,
    binding: object.binding || { mode: "manual", source: "Data Model" },
    relations: Array.isArray(object.relations) ? object.relations : [],
    mutable: true,
    storage: "manual-object",
    objectId: object.id,
    widgetRefs: [],
    rowStorage: useSchema ? "envelope" : "flat",
    schemaFields: useSchema ? object.fields : null,
    schemaSections: useSchema ? (Array.isArray(object.sections) ? object.sections : []) : null,
    fieldSettings: {
      hidden: Array.isArray(object.fieldSettings?.hidden) ? object.fieldSettings.hidden : [],
      order: Array.isArray(object.fieldSettings?.order) ? object.fieldSettings.order : columns
    }
  };
}

function listWorkspaceDataModelTables(workspaceConfig) {
  const widgetEntries = listWidgetEntries(workspaceConfig);
  const refsByObjectId = widgetEntries.reduce((map, { widget, location }) => {
    const binding = widget?.config?.binding;
    if (binding?.sourceType !== "workspace-data-model" || !binding.objectId) return map;
    const refs = map.get(binding.objectId) || [];
    refs.push({
      ...location,
      widgetTitle: widget.title,
      widgetKind: widget.kind
    });
    map.set(binding.objectId, refs);
    return map;
  }, new Map());
  const manualObjects = normalizeManualObjects(workspaceConfig).map((object) => {
    const table = deriveManualObjectTable(object);
    return { ...table, widgetRefs: refsByObjectId.get(object.id) || [] };
  });
  const widgetTables = widgetEntries
    .map(({ widget, location }) => {
      const table = deriveWidgetTable(widget, location);
      if (!table) return null;
      return {
        id: tableId(table.source, table.columns),
        label: table.source,
        source: table.source,
        columns: table.columns,
        rows: table.rows,
        binding: table.binding,
        mutable: table.mutable,
        storage: table.storage,
        widgetRefs: [{
          ...location,
          widgetTitle: widget.title,
          widgetKind: widget.kind
        }],
        fieldSettings: {
          hidden: Array.isArray(widget.config?.fieldSettings?.hidden) ? widget.config.fieldSettings.hidden : [],
          order: Array.isArray(widget.config?.fieldSettings?.order) ? widget.config.fieldSettings.order : table.columns
        }
      };
    })
    .filter(Boolean);
  return [...manualObjects, ...widgetTables];
}

function writeTableConfig(config, storage, columns, rows) {
  if (storage === "view") {
    const binding = config.binding?.mode === "manual" ? { ...config.binding, rows } : config.binding;
    return { ...config, columns, rows, binding, fieldSettings: { hidden: config.fieldSettings?.hidden || [], order: columns } };
  }
  if (storage === "json") {
    return { ...config, binding: { ...config.binding, json: JSON.stringify(rows, null, 2) } };
  }
  if (storage === "csv") {
    return { ...config, binding: { ...config.binding, csv: toCsv(columns, rows) } };
  }
  if (storage === "manual-binding") {
    return { ...config, binding: { ...config.binding, rows } };
  }
  if (storage === "chart-values") {
    return { ...config, values: rows.map((row) => Number(row.Value)).filter((value) => Number.isFinite(value)) };
  }
  return config;
}

function applyTableMutation(workspaceConfig, table, mutate) {
  if (table.storage === "manual-object") {
    const objects = normalizeManualObjects(workspaceConfig);
    const dataModel = workspaceConfig.dataModel && typeof workspaceConfig.dataModel === "object" && !Array.isArray(workspaceConfig.dataModel)
      ? workspaceConfig.dataModel
      : {};
    return {
      ...workspaceConfig,
      dataModel: {
        ...dataModel,
        objects: objects.map((object) => {
          if (object.id !== table.objectId) return object;
          const current = deriveManualObjectTable(object);
          const next = mutate({ columns: current.columns, rows: current.rows.map((r) => ({ ...r })) });
          const useSchema = objectUsesFieldSchema(object);
          if (useSchema) {
            return {
              ...object,
              columns: next.columns,
              rows: flatRowsToEnvelopeRows(next.rows, next.columns),
              fieldSettings: { ...(object.fieldSettings || {}), order: next.columns }
            };
          }
          return {
            ...object,
            columns: next.columns,
            rows: next.rows,
            fieldSettings: { ...(object.fieldSettings || {}), order: next.columns }
          };
        })
      }
    };
  }

  const ids = new Set((table.widgetRefs || []).map((ref) => ref.widgetId));
  const mutateWidgets = (widgets) => (widgets || []).map((widget) => {
    if (!ids.has(widget.id)) return widget;
    const current = deriveWidgetTable(widget, { widgetId: widget.id });
    if (!current?.mutable) return widget;
    const next = mutate({ columns: current.columns, rows: current.rows });
    return { ...widget, config: writeTableConfig(widget.config || {}, current.storage, next.columns, next.rows) };
  });

  const dashboards = (workspaceConfig.dashboards || []).map((dashboard) => ({
    ...dashboard,
    tabs: (dashboard.tabs || []).map((tab) => ({ ...tab, widgets: mutateWidgets(tab.widgets) }))
  }));
  let canvas = workspaceConfig.canvas ? { ...workspaceConfig.canvas } : {};
  if (Array.isArray(canvas.widgets)) canvas = { ...canvas, widgets: mutateWidgets(canvas.widgets) };
  if (Array.isArray(canvas.tabs)) canvas = { ...canvas, tabs: canvas.tabs.map((tab) => ({ ...tab, widgets: mutateWidgets(tab.widgets) })) };
  return { ...workspaceConfig, dashboards, canvas };
}

function slugifyObjectName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "object";
}

function uniqueObjectId(workspaceConfig, name) {
  const base = slugifyObjectName(name);
  const used = new Set(normalizeManualObjects(workspaceConfig).map((object) => object.id));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

/**
 * Top-level object type presets.
 * Each entry defines: label, icon (Lucide name), description, default columns, and
 * any built-in relations.  These are the five first-class types the UI offers when
 * a user clicks "New object" — they act like schema templates, not hard constraints.
 *
 * Relation shape:
 *   {
 *     id:              string,   // stable slug within this object
 *     name:            string,   // display label
 *     field:           string,   // FK column on THIS object
 *     targetObjectType:string,   // objectType of the referenced object
 *     type:            "belongs-to" | "has-many",
 *     description:     string
 *   }
 */
const OBJECT_TYPE_PRESETS = {
  "data-source": {
    label: "Data Source",
    icon: "Globe",
    description: "Custom API, webhook, or external feed. References an API Registry record while credentials stay in workspace settings.",
    columns: ["Name", "registryId", "endpoint", "authRef", "baseUrl", "status", "lastTested", "lastResponse"],
    relations: [
      {
        id: "resolver-binding",
        name: "Resolver",
        field: "registryId",
        targetObjectType: "api-registry",
        type: "belongs-to",
        description: "The API Registry entry whose fetchRecords function resolves this source. Set registryId to match the resolver integrationId."
      }
    ]
  },
  "api-registry": {
    label: "API Registry",
    icon: "Code2",
    description: "HTTP API records with endpoint config, auth references, connection status, and stored test output.",
    columns: ["integrationId", "authRef", "baseUrl", "endpoint", "method", "status", "lastTested", "lastResponse", "entityTypes", "description"],
    relations: []
  },
  "people": {
    label: "People",
    icon: "Users",
    description: "Contacts, leads, or team members with standard CRM fields.",
    columns: ["Name", "Email", "Phone", "Company", "Status", "Role"],
    relations: []
  },
  "tasks": {
    label: "Tasks",
    icon: "CheckSquare",
    description: "Action items, to-dos, or work items.",
    columns: ["Name", "Status", "DueDate", "Assignee", "Priority"],
    relations: []
  },
  "sandbox-environment": {
    label: "Sandbox Environment",
    icon: "Terminal",
    description: "Execution locality: local (process sandbox or Paperclip thin local agent-host CLI) or serverless (delegates to an API Registry HTTP target: Edge/QStash/cron webhook). Env refs resolve server-side; run history in growthub.source-records.json. Not a widget binding source.",
    columns: [
      "Name",
      "lifecycleStatus",
      "version",
      "runLocality",
      "schedulerRegistryId",
      "runtime",
      "adapter",
      "agentHost",
      "envRefs",
      "networkAllow",
      "allowList",
      "instructions",
      "command",
      "timeoutMs",
      "status",
      "lastTested",
      "lastRunId",
      "lastSourceId",
      "lastResponse"
    ],
    relations: [
      {
        id: "scheduler-registry-binding",
        name: "Scheduler (serverless)",
        field: "schedulerRegistryId",
        targetObjectType: "api-registry",
        type: "belongs-to",
        description: "When runLocality is serverless, POST /api/workspace/sandbox-run sends growthub-sandbox-run-v1 to this API Registry record (METHOD, baseUrl, endpoint, authRef resolved server-side). Use for Supabase Edge URL, QStash forwarder, Vercel-exposed webhook, cron targets, etc."
      }
    ]
  },
  "custom": {
    label: "Custom",
    icon: "Plus",
    description: "Start with a blank table — define your own fields and records.",
    columns: ["Name"],
    relations: []
  }
};

/**
 * Create a typed business object from a preset template.
 * Accepts objectType (one of the OBJECT_TYPE_PRESETS keys) and an optional icon override.
 * The object is stored in dataModel.objects[] alongside manual objects.
 */
function createTypedBusinessObject(workspaceConfig, { name, objectType = "custom", icon } = {}) {
  const label = String(name || "").trim();
  if (!label) return workspaceConfig;
  const preset = OBJECT_TYPE_PRESETS[objectType] || OBJECT_TYPE_PRESETS.custom;
  const columns = [...preset.columns];
  const dataModel =
    workspaceConfig.dataModel && typeof workspaceConfig.dataModel === "object" && !Array.isArray(workspaceConfig.dataModel)
      ? workspaceConfig.dataModel
      : {};
  const id = uniqueObjectId(workspaceConfig, label);
  const object = {
    id,
    label,
    source: label,
    objectType,
    icon: icon || preset.icon,
    columns,
    rows: [],
    binding: { mode: "manual", source: "Data Model" },
    relations: preset.relations ? preset.relations.map((r) => ({ ...r })) : [],
    fieldSettings: { hidden: [], order: columns }
  };
  return {
    ...workspaceConfig,
    dataModel: {
      ...dataModel,
      objects: [...normalizeManualObjects(workspaceConfig), object]
    }
  };
}

function createManualBusinessObject(workspaceConfig, { name, fields } = {}) {
  const label = String(name || "").trim();
  const columns = Array.from(new Set((Array.isArray(fields) ? fields : String(fields || "").split(","))
    .map((field) => String(field || "").trim())
    .filter(Boolean)));
  if (!label || !columns.length) return workspaceConfig;
  const dataModel = workspaceConfig.dataModel && typeof workspaceConfig.dataModel === "object" && !Array.isArray(workspaceConfig.dataModel)
    ? workspaceConfig.dataModel
    : {};
  const id = uniqueObjectId(workspaceConfig, label);
  const object = {
    id,
    label,
    source: label,
    columns,
    rows: [],
    binding: { mode: "manual", source: "Data Model" },
    fieldSettings: { hidden: [], order: columns }
  };
  return {
    ...workspaceConfig,
    dataModel: {
      ...dataModel,
      objects: [...normalizeManualObjects(workspaceConfig), object]
    }
  };
}

function addTableField(workspaceConfig, table, fieldName) {
  const name = String(fieldName || "").trim();
  if (!name || !table.mutable) return workspaceConfig;
  return applyTableMutation(workspaceConfig, table, ({ columns, rows }) => {
    if (columns.includes(name)) return { columns, rows };
    return { columns: [...columns, name], rows: rows.map((row) => ({ ...row, [name]: "" })) };
  });
}

function addTableRow(workspaceConfig, table) {
  if (!table.mutable) return workspaceConfig;
  return applyTableMutation(workspaceConfig, table, ({ columns, rows }) => {
    let newRow;
    if (table.rowStorage === "envelope") {
      const id = `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      newRow = { id, ...Object.fromEntries(columns.map((column) => [column, ""])) };
    } else {
      newRow = Object.fromEntries(columns.map((column) => [column, ""]));
    }
    return { columns, rows: [...rows, newRow] };
  });
}

function updateTableCell(workspaceConfig, table, rowIndex, fieldName, value) {
  if (!table.mutable) return workspaceConfig;
  return applyTableMutation(workspaceConfig, table, ({ columns, rows }) => ({
    columns,
    rows: rows.map((row, index) => index === rowIndex ? { ...row, [fieldName]: value } : row)
  }));
}

function deleteTableRow(workspaceConfig, table, rowIndex) {
  if (!table.mutable) return workspaceConfig;
  return applyTableMutation(workspaceConfig, table, ({ columns, rows }) => ({
    columns,
    rows: rows.filter((_, index) => index !== rowIndex)
  }));
}

function duplicateTableRow(workspaceConfig, table, rowIndex) {
  if (!table.mutable) return workspaceConfig;
  return applyTableMutation(workspaceConfig, table, ({ columns, rows }) => {
    const next = [...rows];
    if (rows[rowIndex]) next.splice(rowIndex + 1, 0, { ...rows[rowIndex] });
    return { columns, rows: next };
  });
}

function appendRowsToTable(workspaceConfig, table, rowsToAppend) {
  if (!table.mutable || !Array.isArray(rowsToAppend)) return workspaceConfig;
  return applyTableMutation(workspaceConfig, table, ({ columns, rows }) => ({ columns, rows: [...rows, ...rowsToAppend] }));
}

function replaceTableContent(workspaceConfig, table, { columns = [], rows = [] } = {}) {
  if (!table.mutable) return workspaceConfig;
  return applyTableMutation(workspaceConfig, table, () => ({ columns, rows }));
}

function exportTableAsCsv(table) {
  return toCsv(table.columns || [], table.rows || []);
}

function importTableFromCsv(text) {
  return parseCsv(text);
}

function describeBindingLane(binding) {
  if (binding?.mode === "integration" && binding.lane === "data-source") return "data-source";
  if (binding?.mode === "integration" && binding.lane === "workspace-integration") return "workspace-integration";
  if (binding?.mode === "integration") return "integration";
  return "manual";
}

/**
 * Saved env-key references — name-only projection of workspace integrations[].
 *
 * Used by the sandbox-environment drawer's env-ref multi-select. The browser
 * receives the `endpointRef` slug only (never the secret value); the sandbox
 * run route resolves the slug to a server-side env value using the same
 * `envKeyCandidates(authRef)` pattern as `test-api-record/route.js`.
 *
 * Returns: [{ id, endpointRef, kind, hasSecret }]
 */
function listSavedEnvRefs(workspaceConfig) {
  const integrations = Array.isArray(workspaceConfig?.integrations) ? workspaceConfig.integrations : [];
  return integrations
    .filter((entry) => entry?.sourceType === "custom-api-webhooks" && typeof entry.endpointRef === "string" && entry.endpointRef.trim())
    .map((entry) => ({
      id: entry.id || entry.endpointRef,
      endpointRef: entry.endpointRef,
      kind: entry.kind === "webhook" ? "webhook" : "api",
      hasSecret: entry.hasSecret === true
    }));
}

/**
 * Parse a sandbox-environment row's `envRefs` column into a clean string array.
 * Stored as a comma-separated string in the row to keep the column flat under
 * the existing governed Data Model schema; rendered as a multi-select chip
 * group in the drawer. The server reads the same comma-separated form.
 */
function parseSandboxEnvRefs(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Parse a sandbox-environment row's `allowList` column into a clean array of
 * domain hostnames. Stored as comma-separated string for governed flatness;
 * the run route enforces the list when `networkAllow` is truthy.
 */
function parseSandboxAllowList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Stable sourceId for a sandbox-environment row's run history sidecar.
 * Keyed by object id + slugified Name so the key survives reorder of rows
 * inside the same object. The sandbox-run route uses this id to read/write
 * `growthub.source-records.json`.
 */
function sandboxRunSourceId(objectId, name) {
  const slug = String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!objectId || !slug) return null;
  return `sandbox:${objectId}:${slug}`;
}

function describeBindingMode(binding) {
  const lane = describeBindingLane(binding);
  if (lane === "data-source") return { label: "Data source scope", description: "Integration reference selected in the existing widget source flow. Dynamic data resolves through the governed server-side integration path." };
  if (lane === "workspace-integration") return { label: "Workspace tool scope", description: "Workspace integration reference selected in the existing widget source flow." };
  if (lane === "integration") return { label: "Integration scope", description: "Integration reference stored on widget.config.binding." };
  return { label: "Manual local table", description: "Rows and fields live in the existing widget config and travel with workspace export/import." };
}

function updateManualObjectById(workspaceConfig, objectId, updater) {
  const objects = normalizeManualObjects(workspaceConfig);
  const dataModel =
    workspaceConfig.dataModel && typeof workspaceConfig.dataModel === "object" && !Array.isArray(workspaceConfig.dataModel)
      ? workspaceConfig.dataModel
      : {};
  return {
    ...workspaceConfig,
    dataModel: {
      ...dataModel,
      objects: objects.map((o) => (o.id === objectId ? updater(o) : o))
    }
  };
}

function defaultValueForFieldType(type) {
  if (type === "multiSelect") return [];
  if (type === "boolean") return false;
  if (type === "ref") return null;
  if (type === "multiRef") return [];
  return "";
}

function appendStructuredField(workspaceConfig, { objectId, field }) {
  return updateManualObjectById(workspaceConfig, objectId, (o) => {
    const fields = [...(o.fields || []), field];
    const visible = fields.filter((f) => f.isVisible !== false);
    const columns = visible.map((f) => f.id);
    const rows = (o.rows || []).map((row) => {
      const dv = field.defaultValue !== undefined && field.defaultValue !== null
        ? field.defaultValue
        : defaultValueForFieldType(field.type);
      if (row && typeof row === "object" && row.data && typeof row.data === "object" && !Array.isArray(row.data)) {
        return { ...row, data: { ...row.data, [field.id]: dv } };
      }
      if (row && typeof row === "object") {
        return { ...row, [field.id]: dv };
      }
      return row;
    });
    return {
      ...o,
      fields,
      columns,
      rows,
      fieldSettings: { ...(o.fieldSettings || {}), order: columns }
    };
  });
}

function setStructuredFieldVisibility(workspaceConfig, { objectId, fieldId, isVisible }) {
  return updateManualObjectById(workspaceConfig, objectId, (o) => ({
    ...o,
    fields: (o.fields || []).map((f) => (f.id === fieldId ? { ...f, isVisible } : f))
  }));
}

function removeStructuredField(workspaceConfig, { objectId, fieldId }) {
  return updateManualObjectById(workspaceConfig, objectId, (o) => {
    const fields = (o.fields || []).filter((f) => f.id !== fieldId);
    const visible = fields.filter((f) => f.isVisible !== false);
    const columns = visible.map((f) => f.id);
    const rows = (o.rows || []).map((row) => {
      if (row && typeof row === "object" && row.data && typeof row.data === "object" && !Array.isArray(row.data)) {
        const { [fieldId]: dropped, ...rest } = row.data;
        return { ...row, data: rest };
      }
      if (row && typeof row === "object") {
        const { [fieldId]: dropped, ...rest } = row;
        return rest;
      }
      return row;
    });
    return {
      ...o,
      fields,
      columns,
      rows,
      fieldSettings: { ...(o.fieldSettings || {}), order: columns }
    };
  });
}

function reorderStructuredFields(workspaceConfig, { objectId, orderedFieldIds }) {
  return updateManualObjectById(workspaceConfig, objectId, (o) => ({
    ...o,
    fieldSettings: { ...(o.fieldSettings || {}), order: orderedFieldIds }
  }));
}

export {
  OBJECT_TYPE_PRESETS,
  addTableField,
  addTableRow,
  appendRowsToTable,
  appendStructuredField,
  createManualBusinessObject,
  createTypedBusinessObject,
  deleteTableRow,
  describeBindingLane,
  describeBindingMode,
  duplicateTableRow,
  exportTableAsCsv,
  importTableFromCsv,
  listSavedEnvRefs,
  listWorkspaceDataModelTables,
  normalizeManualObjects,
  parseSandboxAllowList,
  parseSandboxEnvRefs,
  removeStructuredField,
  reorderStructuredFields,
  replaceTableContent,
  sandboxRunSourceId,
  setStructuredFieldVisibility,
  updateTableCell
};
