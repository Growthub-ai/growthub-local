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

function normalizeStringList(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
}

function normalizeSortClauses(sort, columns) {
  const allowed = new Set(columns);
  return (Array.isArray(sort) ? sort : []).flatMap((clause) => {
    if (!clause || typeof clause !== "object" || Array.isArray(clause)) return [];
    const fieldId = String(clause.fieldId || "").trim();
    const direction = String(clause.direction || "asc").trim().toLowerCase() === "desc" ? "desc" : "asc";
    return allowed.has(fieldId) ? [{ fieldId, direction }] : [];
  });
}

function normalizeFilterConfig(filter, columns) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return undefined;
  const allowed = new Set(columns);
  const op = String(filter.op || "and").trim().toLowerCase() === "or" ? "or" : "and";
  const clauses = (Array.isArray(filter.clauses) ? filter.clauses : []).flatMap((clause) => {
    if (!clause || typeof clause !== "object" || Array.isArray(clause)) return [];
    const fieldId = String(clause.fieldId || "").trim();
    const operator = String(clause.operator || "eq").trim();
    if (!allowed.has(fieldId)) return [];
    if (["isEmpty", "isNotEmpty"].includes(operator)) return [{ fieldId, operator }];
    const value = clause.value;
    if (value === undefined || value === null || value === "") return [];
    return [{ fieldId, operator, value }];
  });
  return clauses.length ? { op, clauses } : undefined;
}

function normalizeFieldTypes(types, columns) {
  const result = {};
  const source = types && typeof types === "object" && !Array.isArray(types) ? types : {};
  columns.forEach((column) => {
    const value = String(source[column] || "").trim();
    if (value) result[column] = value;
  });
  return result;
}

function snapshotTableViewState(settings) {
  return {
    hidden: normalizeStringList(settings?.hidden),
    order: normalizeStringList(settings?.order),
    sort: Array.isArray(settings?.sort) ? settings.sort.map((clause) => ({ ...clause })) : [],
    filter: settings?.filter ? {
      op: settings.filter.op,
      clauses: (settings.filter.clauses || []).map((clause) => ({ ...clause }))
    } : undefined
  };
}

function normalizeSavedViews(views, columns) {
  return (Array.isArray(views) ? views : []).flatMap((view, index) => {
    if (!view || typeof view !== "object" || Array.isArray(view)) return [];
    const id = String(view.id || "").trim() || `view-${index + 1}`;
    const name = String(view.name || "").trim();
    if (!name) return [];
    const state = normalizeFieldSettings({
      hidden: view.hidden,
      order: view.order,
      sort: view.sort,
      filter: view.filter,
    }, columns);
    return [{
      id,
      name,
      favorite: Boolean(view.favorite),
      locked: Boolean(view.locked),
      hidden: state.hidden,
      order: state.order,
      sort: state.sort,
      filter: state.filter
    }];
  });
}

function normalizeFieldSettings(fieldSettings, columns) {
  const order = normalizeStringList([
    ...(Array.isArray(fieldSettings?.order) ? fieldSettings.order : []),
    ...columns
  ]).filter((column) => columns.includes(column));
  const hidden = normalizeStringList(fieldSettings?.hidden).filter((column) => columns.includes(column));
  const sort = normalizeSortClauses(fieldSettings?.sort, columns);
  const filter = normalizeFilterConfig(fieldSettings?.filter, columns);
  const views = normalizeSavedViews(fieldSettings?.views, columns);
  const activeViewId = String(fieldSettings?.activeViewId || "").trim();
  return {
    hidden,
    order,
    sort,
    filter,
    types: normalizeFieldTypes(fieldSettings?.types, columns),
    views,
    activeViewId: views.some((view) => view.id === activeViewId) ? activeViewId : "",
    favorite: Boolean(fieldSettings?.favorite)
  };
}

function deriveManualObjectTable(object) {
  const columns = Array.isArray(object.columns) ? object.columns.filter(Boolean) : [];
  const rows = Array.isArray(object.rows) ? object.rows.filter((row) => row && typeof row === "object" && !Array.isArray(row)) : [];
  const source = object.source || object.label || object.name || "Manual object";
  return {
    id: `manual-object:${object.id || source}`,
    label: object.label || object.name || source,
    source,
    objectType: object.objectType || "custom",
    icon: object.icon || null,
    pickerHidden: Boolean(object.pickerHidden),
    columns,
    rows,
    binding: object.binding || { mode: "manual", source: "Data Model" },
    relations: Array.isArray(object.relations) ? object.relations : [],
    mutable: true,
    storage: "manual-object",
    objectId: object.id,
    widgetRefs: [],
    fieldSettings: normalizeFieldSettings(object.fieldSettings, columns)
  };
}

// Helper-owned hidden objects — system-managed, never surfaced in the
// user-facing Data Model picker / object list / dynamic title.
//
// - `workspace-helper-sandbox` backs the helper's local-intelligence
//   sandbox primitive (helper-tuned instructions live there); users
//   interact with it only through the helper Setup tab.
// - `nav-folders` backs the Custom Folders Navigation module rendered
//   in the workspace rail (between the tab toggles and the Home / Chat
//   body). Users create, rename, drag, and add items entirely from the
//   rail; the row-level structure is never exposed in the Data Model
//   admin surface so the core governed business objects stay clean.
const HIDDEN_HELPER_OBJECT_IDS = new Set([
  "workspace-helper-sandbox",
  "nav-folders",
]);

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
  const manualObjects = normalizeManualObjects(workspaceConfig)
    .filter((object) => !HIDDEN_HELPER_OBJECT_IDS.has(object?.id))
    .map((object) => {
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
        fieldSettings: normalizeFieldSettings({
          ...(widget.config?.fieldSettings || {}),
          sort: widget.config?.sort,
          filter: widget.config?.filter
        }, table.columns)
      };
    })
    .filter(Boolean);
  return [...manualObjects, ...widgetTables];
}

function writeTableConfig(config, storage, columns, rows) {
  const fieldSettings = normalizeFieldSettings({
    ...(config.fieldSettings || {}),
    sort: config.sort,
    filter: config.filter
  }, columns);
  if (storage === "view") {
    const binding = config.binding?.mode === "manual" ? { ...config.binding, rows } : config.binding;
    return { ...config, columns, rows, binding, fieldSettings, sort: fieldSettings.sort, filter: fieldSettings.filter };
  }
  if (storage === "json") {
    return { ...config, binding: { ...config.binding, json: JSON.stringify(rows, null, 2) }, fieldSettings, sort: fieldSettings.sort, filter: fieldSettings.filter };
  }
  if (storage === "csv") {
    return { ...config, binding: { ...config.binding, csv: toCsv(columns, rows) }, fieldSettings, sort: fieldSettings.sort, filter: fieldSettings.filter };
  }
  if (storage === "manual-binding") {
    return { ...config, binding: { ...config.binding, rows }, fieldSettings, sort: fieldSettings.sort, filter: fieldSettings.filter };
  }
  if (storage === "chart-values") {
    return { ...config, values: rows.map((row) => Number(row.Value)).filter((value) => Number.isFinite(value)), fieldSettings, sort: fieldSettings.sort, filter: fieldSettings.filter };
  }
  return config;
}

function updateTableFieldSettings(workspaceConfig, table, updater) {
  const nextSettings = normalizeFieldSettings(
    updater(normalizeFieldSettings(table.fieldSettings, table.columns)),
    table.columns
  );
  if (table.storage === "manual-object") {
    const objects = normalizeManualObjects(workspaceConfig);
    const dataModel = workspaceConfig.dataModel && typeof workspaceConfig.dataModel === "object" && !Array.isArray(workspaceConfig.dataModel)
      ? workspaceConfig.dataModel
      : {};
    return {
      ...workspaceConfig,
      dataModel: {
        ...dataModel,
        objects: objects.map((object) => object.id === table.objectId
          ? { ...object, fieldSettings: nextSettings }
          : object)
      }
    };
  }

  const ids = new Set((table.widgetRefs || []).map((ref) => ref.widgetId));
  const mutateWidgets = (widgets) => (widgets || []).map((widget) => {
    if (!ids.has(widget.id)) return widget;
    const current = deriveWidgetTable(widget, { widgetId: widget.id });
    if (!current?.mutable) return widget;
    return {
      ...widget,
      config: {
        ...(widget.config || {}),
        fieldSettings: nextSettings,
        sort: nextSettings.sort,
        filter: nextSettings.filter
      }
    };
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

function remapFieldName(name, renameMap = {}) {
  return renameMap[name] || name;
}

function remapFieldSettings(fieldSettings, columns, renameMap = {}) {
  const mapList = (values) => normalizeStringList((values || []).map((value) => remapFieldName(value, renameMap))).filter((value) => columns.includes(value));
  const mapSort = (sort) => normalizeSortClauses((sort || []).map((clause) => ({
    ...clause,
    fieldId: remapFieldName(clause.fieldId, renameMap)
  })), columns);
  const mapFilter = (filter) => normalizeFilterConfig(filter ? {
    ...filter,
    clauses: (filter.clauses || []).map((clause) => ({
      ...clause,
      fieldId: remapFieldName(clause.fieldId, renameMap)
    }))
  } : null, columns);
  const sourceTypes = fieldSettings?.types && typeof fieldSettings.types === "object" && !Array.isArray(fieldSettings.types)
    ? fieldSettings.types
    : {};
  const types = columns.reduce((acc, column) => {
    const previousKey = Object.keys(renameMap).find((key) => renameMap[key] === column) || column;
    const typeValue = sourceTypes[column] || sourceTypes[previousKey];
    if (typeValue) acc[column] = typeValue;
    return acc;
  }, {});
  const views = normalizeSavedViews((fieldSettings?.views || []).map((view) => ({
    ...view,
    hidden: mapList(view.hidden || []),
    order: mapList(view.order || []),
    sort: mapSort(view.sort || []),
    filter: mapFilter(view.filter)
  })), columns);
  const activeViewId = String(fieldSettings?.activeViewId || "").trim();
  return {
    hidden: mapList(fieldSettings?.hidden || []),
    order: mapList(fieldSettings?.order || columns),
    sort: mapSort(fieldSettings?.sort || []),
    filter: mapFilter(fieldSettings?.filter),
    types,
    views,
    activeViewId: views.some((view) => view.id === activeViewId) ? activeViewId : "",
    favorite: Boolean(fieldSettings?.favorite)
  };
}

function renameRowFields(row, nextColumns, renameMap = {}) {
  const reverseMap = Object.entries(renameMap).reduce((acc, [previous, next]) => {
    acc[next] = previous;
    return acc;
  }, {});
  return nextColumns.reduce((acc, column) => {
    const previousKey = reverseMap[column] || column;
    acc[column] = row?.[previousKey] ?? row?.[column] ?? "";
    return acc;
  }, {});
}

function transformTableSchema(workspaceConfig, table, { columns, renameMap = {} }) {
  const nextColumns = Array.isArray(columns) ? columns.filter(Boolean) : table.columns;
  if (!nextColumns.length) return workspaceConfig;

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
          const rows = (Array.isArray(object.rows) ? object.rows : []).map((row) => renameRowFields(row, nextColumns, renameMap));
          return {
            ...object,
            columns: nextColumns,
            rows,
            fieldSettings: remapFieldSettings(object.fieldSettings || {}, nextColumns, renameMap)
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
    const rows = (current.rows || []).map((row) => renameRowFields(row, nextColumns, renameMap));
    const nextFieldSettings = remapFieldSettings({
      ...(widget.config?.fieldSettings || {}),
      sort: widget.config?.sort,
      filter: widget.config?.filter
    }, nextColumns, renameMap);
    return {
      ...widget,
      config: {
        ...writeTableConfig(widget.config || {}, current.storage, nextColumns, rows),
        fieldSettings: nextFieldSettings,
        sort: nextFieldSettings.sort,
        filter: nextFieldSettings.filter
      }
    };
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
          const next = mutate({ columns: current.columns, rows: current.rows });
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
 *     valueField?:     string,   // column on TARGET row used as stored FK value (default integrationId)
 *     labelField?:     string,   // primary label column on target (default Name)
 *     secondaryLabelField?: string,
 *     statusField?:    string,   // default status
 *     statusAllowlist?: string[] // when set, only rows whose status matches (case-insensitive) appear
 *     searchable?:     boolean,
 *     pageSize?:       number,
 *     resolver?:       { integrationId: string } // optional listEntities-backed option source
 *     referenceSource?: "workspace-rows" | "source-records" // default workspace-rows
 *     sidecarSourceId?: string // when referenceSource is source-records
 *   }
 */
const OBJECT_TYPE_PRESETS = {
  "data-source": {
    label: "Data Source",
    icon: "Globe",
    description: "Custom API, webhook, or external feed. References an API Registry record while credentials stay in workspace settings.",
    columns: [
      "Name",
      "registryId",
      "endpoint",
      "authRef",
      "baseUrl",
      "status",
      "lastTested",
      "lastResponse",
      "entityType",
      "sourceId",
      "sourceStorage",
      "resolverTemplateId"
    ],
    relations: [
      {
        id: "resolver-binding",
        name: "Resolver",
        field: "registryId",
        targetObjectType: "api-registry",
        type: "belongs-to",
        description: "The API Registry entry whose fetchRecords function resolves this source. Set registryId to match the resolver integrationId.",
        valueField: "integrationId",
        labelField: "Name",
        secondaryLabelField: "endpoint",
        statusField: "status",
        statusAllowlist: null,
        searchable: true,
        pageSize: 25
      }
    ]
  },
  "api-registry": {
    label: "API Registry",
    icon: "Code2",
    description: "HTTP API records with endpoint config, auth references, connection status, and stored test output.",
    columns: [
      "integrationId",
      "authRef",
      "baseUrl",
      "endpoint",
      "method",
      "status",
      "lastTested",
      "lastResponse",
      "entityTypes",
      "description",
      "connectorKind",
      "resolverTemplateId",
      "schemaVersion",
      "capabilities",
      "executionLane"
    ],
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
      "localModel",
      "localEndpoint",
      "intelligenceAdapterMode",
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
      "lastResponse",
      "resolverTemplateId",
      "connectorKind",
      "executionLane"
    ],
    relations: [
      {
        id: "scheduler-registry-binding",
        name: "Scheduler (serverless)",
        field: "schedulerRegistryId",
        targetObjectType: "api-registry",
        type: "belongs-to",
        description: "When runLocality is serverless, POST /api/workspace/sandbox-run sends growthub-sandbox-run-v1 to this API Registry record (METHOD, baseUrl, endpoint, authRef resolved server-side). Use for Supabase Edge URL, QStash forwarder, Vercel-exposed webhook, cron targets, etc.",
        valueField: "integrationId",
        labelField: "Name",
        secondaryLabelField: "endpoint",
        statusField: "status",
        statusAllowlist: ["connected", "approved", "ok", "success"],
        searchable: true,
        pageSize: 25
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
    fieldSettings: normalizeFieldSettings({}, columns)
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
    fieldSettings: normalizeFieldSettings({}, columns)
  };
  return {
    ...workspaceConfig,
    dataModel: {
      ...dataModel,
      objects: [...normalizeManualObjects(workspaceConfig), object]
    }
  };
}

function addTableField(workspaceConfig, table, fieldSpec) {
  const spec = fieldSpec && typeof fieldSpec === "object" && !Array.isArray(fieldSpec)
    ? fieldSpec
    : { name: fieldSpec };
  const name = String(spec.name || "").trim();
  const fieldType = String(spec.type || "").trim();
  if (!name || !table.mutable) return workspaceConfig;
  const nextConfig = applyTableMutation(workspaceConfig, table, ({ columns, rows }) => {
    if (columns.includes(name)) return { columns, rows };
    return { columns: [...columns, name], rows: rows.map((row) => ({ ...row, [name]: "" })) };
  });
  return updateTableFieldSettings(nextConfig, { ...table, columns: table.columns.includes(name) ? table.columns : [...table.columns, name] }, (settings) => ({
    ...settings,
    order: settings.order.includes(name) ? settings.order : [...settings.order, name],
    types: fieldType ? { ...(settings.types || {}), [name]: fieldType } : settings.types
  }));
}

function addTableRow(workspaceConfig, table) {
  if (!table.mutable) return workspaceConfig;
  return applyTableMutation(workspaceConfig, table, ({ columns, rows }) => ({
    columns,
    rows: [...rows, Object.fromEntries(columns.map((column) => [column, ""]))]
  }));
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

/**
 * Normalize a reference option for API/UI interchange.
 */
function normalizeReferenceOption(option) {
  if (!option || typeof option !== "object") return null;
  const value = String(option.value ?? "").trim();
  if (!value) return null;
  const source = ["workspace-config", "source-records", "resolver"].includes(option.source)
    ? option.source
    : "workspace-config";
  const out = {
    value,
    label: String(option.label ?? value).trim() || value,
    source,
    objectType: typeof option.objectType === "string" && option.objectType.trim() ? option.objectType.trim() : undefined,
    provider: typeof option.provider === "string" && option.provider.trim() ? option.provider.trim() : undefined,
    status: typeof option.status === "string" && option.status.trim() ? option.status.trim() : undefined
  };
  if (option.secondaryLabel !== undefined && option.secondaryLabel !== null && String(option.secondaryLabel).trim()) {
    out.secondaryLabel = String(option.secondaryLabel).trim();
  }
  if (option.metadata && typeof option.metadata === "object" && !Array.isArray(option.metadata)) {
    out.metadata = option.metadata;
  }
  return out;
}

/**
 * Merge preset relation defaults with stored `object.relations[]` so older rows
 * pick up new optional metadata (valueField, statusAllowlist, …).
 */
function effectiveRelations(object) {
  const stored = Array.isArray(object?.relations) ? object.relations : [];
  const presets =
    object?.objectType && OBJECT_TYPE_PRESETS[object.objectType]?.relations
      ? OBJECT_TYPE_PRESETS[object.objectType].relations
      : [];
  const presetFields = new Set(presets.map((p) => p.field).filter(Boolean));
  const mergedByField = new Map();
  for (const preset of presets) {
    if (!preset?.field) continue;
    const storedMatch = stored.find((s) => s?.field === preset.field);
    mergedByField.set(preset.field, { ...preset, ...(storedMatch || {}) });
  }
  const extras = stored.filter((s) => s?.field && !presetFields.has(s.field));
  return [...Array.from(mergedByField.values()), ...extras];
}

function findRelationForField(object, field) {
  if (!field) return null;
  return effectiveRelations(object).find((r) => r.field === field) || null;
}

function listReferenceFields(object) {
  return effectiveRelations(object).map((r) => r.field).filter(Boolean);
}

function decodeRefCursor(cursor) {
  if (typeof cursor !== "string" || !cursor.startsWith("o:")) return 0;
  const n = Number(cursor.slice(2));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function encodeRefCursor(offset) {
  return `o:${offset}`;
}

/**
 * Resolve reference options from local `dataModel.objects[]` rows (workspace-config source).
 */
function resolveLocalReferenceOptions(workspaceConfig, {
  objectId,
  field,
  query = "",
  cursor = null,
  limit = 25,
  relation: relationOverride = null
} = {}) {
  const objects = normalizeManualObjects(workspaceConfig);
  const objectItem = objects.find((o) => o.id === objectId) || null;
  const relation = relationOverride || (objectItem && field ? findRelationForField(objectItem, field) : null);
  if (!relation || !relation.targetObjectType) {
    return { options: [], nextCursor: null, reason: objectItem ? "unknown-field" : "unknown-object" };
  }

  const valueField = typeof relation.valueField === "string" && relation.valueField.trim()
    ? relation.valueField.trim()
    : "integrationId";
  const labelField = typeof relation.labelField === "string" && relation.labelField.trim()
    ? relation.labelField.trim()
    : "Name";
  const secondaryLabelField =
    typeof relation.secondaryLabelField === "string" && relation.secondaryLabelField.trim()
      ? relation.secondaryLabelField.trim()
      : "";
  const statusField =
    typeof relation.statusField === "string" && relation.statusField.trim()
      ? relation.statusField.trim()
      : "status";
  const allowlist = Array.isArray(relation.statusAllowlist)
    ? relation.statusAllowlist.map((s) => String(s).toLowerCase())
    : null;

  const pageSize = Math.min(100, Math.max(1, Number(relation.pageSize) || Number(limit) || 25));
  const offset = decodeRefCursor(cursor);

  const targetObjectId = typeof relation.targetObjectId === "string" && relation.targetObjectId.trim()
    ? relation.targetObjectId.trim()
    : "";
  const targets = objects.filter((o) => (
    o.objectType === relation.targetObjectType
    && (!targetObjectId || o.id === targetObjectId)
  ));
  const needle = String(query || "").trim().toLowerCase();

  const candidates = [];
  for (const target of targets) {
    const rows = Array.isArray(target.rows) ? target.rows : [];
    rows.forEach((row, index) => {
      if (!row || typeof row !== "object") return;
      const rawValue =
        row[valueField] ??
        row.integrationId ??
        row.id ??
        row.Name ??
        `${target.id}:${index}`;
      const value = String(rawValue ?? "").trim();
      if (!value) return;
      const label = String(row[labelField] ?? row.Name ?? row.integrationId ?? value).trim() || value;
      const secondaryLabel = secondaryLabelField
        ? String(row[secondaryLabelField] ?? "").trim()
        : "";
      const status = String(row[statusField] ?? "").trim();
      if (allowlist && allowlist.length) {
        const st = status.toLowerCase();
        if (!st || !allowlist.includes(st)) return;
      }
      if (needle) {
        const hay = `${value} ${label} ${secondaryLabel} ${status}`.toLowerCase();
        if (!hay.includes(needle)) return;
      }
      candidates.push(
        normalizeReferenceOption({
          value,
          label,
          secondaryLabel: secondaryLabel || undefined,
          source: "workspace-config",
          objectType: relation.targetObjectType,
          status: status || undefined,
          metadata: { objectLabel: target.label || target.source }
        })
      );
    });
  }

  const filtered = candidates.filter(Boolean);
  const page = filtered.slice(offset, offset + pageSize);
  const nextOffset = offset + page.length;
  const nextCursor = nextOffset < filtered.length ? encodeRefCursor(nextOffset) : null;

  return { options: page, nextCursor, reason: null, total: filtered.length };
}

export {
  OBJECT_TYPE_PRESETS,
  addTableField,
  addTableRow,
  appendRowsToTable,
  createManualBusinessObject,
  createTypedBusinessObject,
  deleteTableRow,
  describeBindingLane,
  describeBindingMode,
  duplicateTableRow,
  effectiveRelations,
  exportTableAsCsv,
  findRelationForField,
  importTableFromCsv,
  listReferenceFields,
  listSavedEnvRefs,
  listWorkspaceDataModelTables,
  normalizeManualObjects,
  normalizeReferenceOption,
  parseSandboxAllowList,
  parseSandboxEnvRefs,
  replaceTableContent,
  resolveLocalReferenceOptions,
  sandboxRunSourceId,
  snapshotTableViewState,
  transformTableSchema,
  normalizeFieldSettings,
  updateTableFieldSettings,
  updateTableCell
};
