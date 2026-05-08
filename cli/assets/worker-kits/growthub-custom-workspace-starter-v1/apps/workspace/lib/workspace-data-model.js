/**
 * Workspace Data Model — config derivation and mutation helpers.
 *
 * Exposes the database-like model already embedded inside view widget configs
 * without adding new top-level config keys. The PATCH allowlist stays:
 *   dashboards | widgetTypes | canvas
 *
 * Anatomy:
 *   object/table  → view.config.source
 *   fields        → view.config.columns
 *   records       → view.config.rows
 *   visibility    → view.config.fieldSettings
 *   query         → view.config.sort + view.config.filter
 *   integration   → view.config.binding
 */

const GRID_COLUMNS = 12;
const GRID_ROWS = 16;
const DEFAULT_TABLE_POSITION = { x: 0, y: 0, w: 6, h: 5 };

// ─── ID factory ───────────────────────────────────────────────────────────────

function generateId(prefix) {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

// ─── Traversal ────────────────────────────────────────────────────────────────

/**
 * Collect all { widget, location } pairs from dashboards then canvas.
 * Deduplicates by widget ID so canvas mirrors of dashboard tabs are not double-counted.
 */
function getWidgetsFromWorkspaceConfig(workspaceConfig) {
  const seen = new Set();
  const results = [];

  function push(widget, location) {
    if (!widget?.id || seen.has(widget.id)) return;
    seen.add(widget.id);
    results.push({ widget, location });
  }

  // Dashboards are the persistent store; scan them first.
  for (const dashboard of (workspaceConfig?.dashboards || [])) {
    if (!Array.isArray(dashboard.tabs)) continue;
    for (const tab of dashboard.tabs) {
      if (!Array.isArray(tab.widgets)) continue;
      for (const widget of tab.widgets) {
        push(widget, {
          source: "dashboard",
          dashboardId: dashboard.id,
          dashboardName: dashboard.name,
          tabId: tab.id,
          tabName: tab.name,
          widgetId: widget.id
        });
      }
    }
  }

  // Canvas may contain widgets not yet synced to any dashboard.
  const canvas = workspaceConfig?.canvas;
  if (canvas) {
    if (Array.isArray(canvas.tabs)) {
      for (const tab of canvas.tabs) {
        if (!Array.isArray(tab.widgets)) continue;
        for (const widget of tab.widgets) {
          push(widget, {
            source: "canvas-tab",
            dashboardId: null,
            dashboardName: null,
            tabId: tab.id,
            tabName: tab.name,
            widgetId: widget.id
          });
        }
      }
    } else if (Array.isArray(canvas.widgets)) {
      for (const widget of canvas.widgets) {
        push(widget, {
          source: "canvas",
          dashboardId: null,
          dashboardName: null,
          tabId: null,
          tabName: canvas.name || "Tab 1",
          widgetId: widget.id
        });
      }
    }
  }

  return results;
}

// ─── Table derivation ─────────────────────────────────────────────────────────

function buildTableId({ source, columns }) {
  const colKey = (columns || []).slice().sort().join("\x00");
  return `table:${source}:${colKey}`;
}

function columnsAreCompatible(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  for (const col of b) {
    if (!setA.has(col)) return false;
  }
  return true;
}

function deriveDataModelTableFromWidget(widget, location) {
  const config = widget.config || {};
  const source = typeof config.source === "string" && config.source ? config.source : widget.title || "Untitled";
  const columns = Array.isArray(config.columns) ? config.columns : [];
  const rows = Array.isArray(config.rows) ? config.rows : [];
  const fs = config.fieldSettings && typeof config.fieldSettings === "object" && !Array.isArray(config.fieldSettings)
    ? config.fieldSettings
    : {};
  const sort = Array.isArray(config.sort) ? config.sort : [];
  const filter = config.filter && typeof config.filter === "object" && !Array.isArray(config.filter)
    ? config.filter
    : { op: "and", clauses: [] };
  const binding = config.binding && typeof config.binding === "object" && !Array.isArray(config.binding)
    ? config.binding
    : { mode: "manual", source: "Manual rows", rows: [] };

  return {
    id: buildTableId({ source, columns }),
    source,
    label: source,
    origin: "widget-config",
    widgetRefs: [{
      dashboardId: location.dashboardId,
      dashboardName: location.dashboardName,
      tabId: location.tabId,
      tabName: location.tabName,
      widgetId: widget.id,
      widgetTitle: widget.title,
      widgetKind: widget.kind
    }],
    columns,
    rows,
    fieldSettings: {
      hidden: Array.isArray(fs.hidden) ? fs.hidden : [],
      order: Array.isArray(fs.order) ? fs.order : []
    },
    sort,
    filter,
    binding,
    lane: typeof binding.lane === "string" ? binding.lane : null,
    objectType: typeof binding.objectType === "string" ? binding.objectType : null,
    entityId: typeof binding.entityId === "string" ? binding.entityId : null,
    entityType: typeof binding.entityType === "string" ? binding.entityType : null,
    entityLabel: typeof binding.entityLabel === "string" ? binding.entityLabel : null
  };
}

/**
 * Derive all Data Model tables from view widgets in the config.
 *
 * Grouping: widgets sharing the same source name AND compatible column sets
 * are merged into one table descriptor with multiple widgetRefs. Incompatible
 * schemas under the same source name produce separate entries labelled
 * "Source · Widget Title".
 */
function listWorkspaceDataModelTables(workspaceConfig) {
  const allWidgets = getWidgetsFromWorkspaceConfig(workspaceConfig);
  const viewWidgets = allWidgets.filter(({ widget }) => widget.kind === "view");

  // Group by source name.
  const bySource = new Map();
  for (const entry of viewWidgets) {
    const source = entry.widget.config?.source || entry.widget.title || "Untitled";
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source).push(entry);
  }

  const tables = [];

  for (const [source, entries] of bySource) {
    // Sub-group entries by compatible column sets.
    const groups = [];
    for (const { widget, location } of entries) {
      const columns = Array.isArray(widget.config?.columns) ? widget.config.columns : [];
      let matched = false;
      for (const group of groups) {
        if (columnsAreCompatible(group.columns, columns)) {
          group.entries.push({ widget, location });
          matched = true;
          break;
        }
      }
      if (!matched) groups.push({ columns, entries: [{ widget, location }] });
    }

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const representativeEntry = group.entries[0];
      const table = deriveDataModelTableFromWidget(
        representativeEntry.widget,
        representativeEntry.location
      );

      if (groups.length > 1) {
        const suffix = representativeEntry.widget.title;
        table.label = `${source} · ${suffix}`;
        table.id = buildTableId({ source: table.label, columns: group.columns });
      }

      // Collect all widgetRefs from the group.
      table.widgetRefs = group.entries.map(({ widget, location }) => ({
        dashboardId: location.dashboardId,
        dashboardName: location.dashboardName,
        tabId: location.tabId,
        tabName: location.tabName,
        widgetId: widget.id,
        widgetTitle: widget.title,
        widgetKind: widget.kind
      }));

      tables.push(table);
    }
  }

  return tables;
}

// ─── Mutation engine ──────────────────────────────────────────────────────────

/**
 * Apply mutationFn to every widget whose ID is in widgetRefs.
 * Returns { canvas, dashboards } — the only PATCH-allowed top-level fields
 * that contain widget state.
 */
function applyTableMutation(workspaceConfig, widgetRefs, mutationFn) {
  const refIds = new Set((widgetRefs || []).map((ref) => ref.widgetId));

  function mutateWidgets(widgets) {
    if (!Array.isArray(widgets)) return widgets;
    return widgets.map((widget) => {
      if (!refIds.has(widget.id)) return widget;
      return { ...widget, config: mutationFn(widget.config || {}, widget) };
    });
  }

  // Update canvas.
  let canvas = workspaceConfig.canvas ? { ...workspaceConfig.canvas } : {};
  if (Array.isArray(canvas.widgets)) {
    canvas = { ...canvas, widgets: mutateWidgets(canvas.widgets) };
  }
  if (Array.isArray(canvas.tabs)) {
    canvas = {
      ...canvas,
      tabs: canvas.tabs.map((tab) => ({ ...tab, widgets: mutateWidgets(tab.widgets || []) }))
    };
  }

  // Update dashboards.
  const dashboards = (workspaceConfig.dashboards || []).map((dashboard) => {
    if (!Array.isArray(dashboard.tabs)) return dashboard;
    return {
      ...dashboard,
      tabs: dashboard.tabs.map((tab) => ({ ...tab, widgets: mutateWidgets(tab.widgets || []) }))
    };
  });

  return { canvas, dashboards };
}

// ─── Field mutations ──────────────────────────────────────────────────────────

function addTableField(workspaceConfig, table, fieldName) {
  const trimmed = (fieldName || "").trim();
  if (!trimmed) return workspaceConfig;

  const { canvas, dashboards } = applyTableMutation(
    workspaceConfig,
    table.widgetRefs,
    (config) => {
      const columns = Array.isArray(config.columns) ? config.columns : [];
      if (columns.includes(trimmed)) return config;
      const nextColumns = [...columns, trimmed];
      const order = Array.isArray(config.fieldSettings?.order) ? config.fieldSettings.order : [];
      const nextOrder = order.includes(trimmed) ? order : [...order, trimmed];
      const rows = Array.isArray(config.rows) ? config.rows : [];
      const nextRows = rows.map((row) => ({ ...row, [trimmed]: "" }));
      return {
        ...config,
        columns: nextColumns,
        rows: nextRows,
        fieldSettings: {
          hidden: Array.isArray(config.fieldSettings?.hidden) ? config.fieldSettings.hidden : [],
          order: nextOrder
        }
      };
    }
  );

  return { ...workspaceConfig, canvas, dashboards };
}

function renameTableField(workspaceConfig, table, oldName, newName) {
  const trimmed = (newName || "").trim();
  if (!trimmed || !oldName || trimmed === oldName) return workspaceConfig;

  const { canvas, dashboards } = applyTableMutation(
    workspaceConfig,
    table.widgetRefs,
    (config) => {
      const columns = Array.isArray(config.columns) ? config.columns : [];
      if (!columns.includes(oldName) || columns.includes(trimmed)) return config;

      const nextColumns = columns.map((col) => (col === oldName ? trimmed : col));
      const rows = Array.isArray(config.rows) ? config.rows : [];
      const nextRows = rows.map((row) => {
        const next = { ...row };
        if (oldName in next) {
          next[trimmed] = next[oldName];
          delete next[oldName];
        }
        return next;
      });

      const hidden = Array.isArray(config.fieldSettings?.hidden) ? config.fieldSettings.hidden : [];
      const order = Array.isArray(config.fieldSettings?.order) ? config.fieldSettings.order : [];
      const sort = Array.isArray(config.sort) ? config.sort : [];
      const filter = config.filter || {};
      const clauses = Array.isArray(filter.clauses) ? filter.clauses : [];

      return {
        ...config,
        columns: nextColumns,
        rows: nextRows,
        fieldSettings: {
          hidden: hidden.map((h) => (h === oldName ? trimmed : h)),
          order: order.map((o) => (o === oldName ? trimmed : o))
        },
        sort: sort.map((clause) =>
          clause.fieldId === oldName ? { ...clause, fieldId: trimmed } : clause
        ),
        filter: {
          ...filter,
          clauses: clauses.map((clause) =>
            clause.fieldId === oldName ? { ...clause, fieldId: trimmed } : clause
          )
        }
      };
    }
  );

  return { ...workspaceConfig, canvas, dashboards };
}

function deleteTableField(workspaceConfig, table, fieldName) {
  if (!fieldName) return workspaceConfig;

  const { canvas, dashboards } = applyTableMutation(
    workspaceConfig,
    table.widgetRefs,
    (config) => {
      const columns = Array.isArray(config.columns) ? config.columns : [];
      const nextColumns = columns.filter((col) => col !== fieldName);
      const rows = Array.isArray(config.rows) ? config.rows : [];
      const nextRows = rows.map((row) => {
        const next = { ...row };
        delete next[fieldName];
        return next;
      });

      const hidden = Array.isArray(config.fieldSettings?.hidden) ? config.fieldSettings.hidden : [];
      const order = Array.isArray(config.fieldSettings?.order) ? config.fieldSettings.order : [];
      const sort = Array.isArray(config.sort) ? config.sort : [];
      const filter = config.filter || {};
      const clauses = Array.isArray(filter.clauses) ? filter.clauses : [];

      return {
        ...config,
        columns: nextColumns,
        rows: nextRows,
        fieldSettings: {
          hidden: hidden.filter((h) => h !== fieldName),
          order: order.filter((o) => o !== fieldName)
        },
        sort: sort.filter((clause) => clause.fieldId !== fieldName),
        filter: {
          ...filter,
          clauses: clauses.filter((clause) => clause.fieldId !== fieldName)
        }
      };
    }
  );

  return { ...workspaceConfig, canvas, dashboards };
}

function toggleTableFieldHidden(workspaceConfig, table, fieldName) {
  const { canvas, dashboards } = applyTableMutation(
    workspaceConfig,
    table.widgetRefs,
    (config) => {
      const hidden = new Set(
        Array.isArray(config.fieldSettings?.hidden) ? config.fieldSettings.hidden : []
      );
      if (hidden.has(fieldName)) hidden.delete(fieldName);
      else hidden.add(fieldName);
      return {
        ...config,
        fieldSettings: {
          ...(config.fieldSettings || {}),
          hidden: Array.from(hidden)
        }
      };
    }
  );

  return { ...workspaceConfig, canvas, dashboards };
}

function reorderTableField(workspaceConfig, table, fieldName, direction) {
  const { canvas, dashboards } = applyTableMutation(
    workspaceConfig,
    table.widgetRefs,
    (config) => {
      const columns = Array.isArray(config.columns) ? config.columns : [];
      const order = Array.isArray(config.fieldSettings?.order) ? config.fieldSettings.order : [];

      // Build effective order from existing order + remaining columns.
      const known = new Set(columns);
      const ordered = order.filter((name) => known.has(name));
      const remaining = columns.filter((name) => !ordered.includes(name));
      const effective = [...ordered, ...remaining];

      const index = effective.indexOf(fieldName);
      if (index < 0) return config;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= effective.length) return config;

      const next = [...effective];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);

      return {
        ...config,
        fieldSettings: {
          hidden: Array.isArray(config.fieldSettings?.hidden) ? config.fieldSettings.hidden : [],
          order: next
        }
      };
    }
  );

  return { ...workspaceConfig, canvas, dashboards };
}

// ─── Row mutations ────────────────────────────────────────────────────────────

function addTableRow(workspaceConfig, table) {
  const emptyRow = Object.fromEntries((table.columns || []).map((col) => [col, ""]));

  const { canvas, dashboards } = applyTableMutation(
    workspaceConfig,
    table.widgetRefs,
    (config) => {
      const rows = Array.isArray(config.rows) ? config.rows : [];
      return { ...config, rows: [...rows, { ...emptyRow }] };
    }
  );

  return { ...workspaceConfig, canvas, dashboards };
}

function updateTableCell(workspaceConfig, table, rowIndex, fieldName, value) {
  const { canvas, dashboards } = applyTableMutation(
    workspaceConfig,
    table.widgetRefs,
    (config) => {
      const rows = Array.isArray(config.rows) ? [...config.rows] : [];
      if (rowIndex < 0 || rowIndex >= rows.length) return config;
      rows[rowIndex] = { ...rows[rowIndex], [fieldName]: value };
      return { ...config, rows };
    }
  );

  return { ...workspaceConfig, canvas, dashboards };
}

function deleteTableRow(workspaceConfig, table, rowIndex) {
  const { canvas, dashboards } = applyTableMutation(
    workspaceConfig,
    table.widgetRefs,
    (config) => {
      const rows = Array.isArray(config.rows) ? config.rows : [];
      return { ...config, rows: rows.filter((_, i) => i !== rowIndex) };
    }
  );

  return { ...workspaceConfig, canvas, dashboards };
}

function duplicateTableRow(workspaceConfig, table, rowIndex) {
  const { canvas, dashboards } = applyTableMutation(
    workspaceConfig,
    table.widgetRefs,
    (config) => {
      const rows = Array.isArray(config.rows) ? config.rows : [];
      if (rowIndex < 0 || rowIndex >= rows.length) return config;
      const clone = { ...rows[rowIndex] };
      const next = [...rows];
      next.splice(rowIndex + 1, 0, clone);
      return { ...config, rows: next };
    }
  );

  return { ...workspaceConfig, canvas, dashboards };
}

// ─── Create table ─────────────────────────────────────────────────────────────

function findFreePosition(widgets) {
  const occupied = new Set();
  for (const widget of (widgets || [])) {
    if (!widget?.position) continue;
    for (let dx = 0; dx < widget.position.w; dx++) {
      for (let dy = 0; dy < widget.position.h; dy++) {
        occupied.add(`${widget.position.x + dx}:${widget.position.y + dy}`);
      }
    }
  }
  const { w, h } = DEFAULT_TABLE_POSITION;
  for (let y = 0; y <= GRID_ROWS - h; y++) {
    for (let x = 0; x <= GRID_COLUMNS - w; x++) {
      let collides = false;
      for (let dx = 0; dx < w && !collides; dx++) {
        for (let dy = 0; dy < h && !collides; dy++) {
          if (occupied.has(`${x + dx}:${y + dy}`)) collides = true;
        }
      }
      if (!collides) return { x, y, w, h };
    }
  }
  return { ...DEFAULT_TABLE_POSITION };
}

/**
 * Create a new view-backed table by inserting a new widget into an existing
 * dashboard tab. Options: { tableName, columns, rows, targetDashboardId, targetTabId }
 */
function createViewBackedTable(workspaceConfig, options = {}) {
  const {
    tableName,
    columns = ["Name"],
    rows = [],
    targetDashboardId,
    targetTabId
  } = options;

  if (!tableName || typeof tableName !== "string" || !tableName.trim()) {
    return workspaceConfig;
  }

  const newWidgetBase = {
    kind: "view",
    title: tableName.trim(),
    config: {
      source: tableName.trim(),
      layout: "Table",
      columns: columns.filter((c) => typeof c === "string" && c.trim()),
      rows: Array.isArray(rows) ? rows : [],
      binding: { mode: "manual", source: "Manual rows", rows: [] },
      fieldSettings: { hidden: [], order: columns.filter((c) => typeof c === "string" && c.trim()) }
    }
  };

  // Determine which dashboard to insert into.
  const dashboardList = workspaceConfig.dashboards || [];
  const targetDashboard = targetDashboardId
    ? dashboardList.find((d) => d.id === targetDashboardId)
    : dashboardList[0];

  if (!targetDashboard) {
    // No dashboard found; insert into canvas directly.
    const canvas = workspaceConfig.canvas ? { ...workspaceConfig.canvas } : {};
    const existingWidgets = Array.isArray(canvas.widgets) ? canvas.widgets : [];
    const position = findFreePosition(existingWidgets);
    const newWidget = { id: generateId("widget"), ...newWidgetBase, position };
    return {
      ...workspaceConfig,
      canvas: { ...canvas, widgets: [...existingWidgets, newWidget] }
    };
  }

  // Find target tab in dashboard.
  const existingTabs = Array.isArray(targetDashboard.tabs) && targetDashboard.tabs.length
    ? targetDashboard.tabs
    : [{ id: generateId("tab"), name: "Tab 1", widgets: [] }];

  const targetTab = targetTabId
    ? existingTabs.find((tab) => tab.id === targetTabId) || existingTabs[0]
    : existingTabs[0];

  const existingWidgets = Array.isArray(targetTab.widgets) ? targetTab.widgets : [];
  const position = findFreePosition(existingWidgets);
  const newWidget = { id: generateId("widget"), ...newWidgetBase, position };

  const nextTabs = existingTabs.map((tab) =>
    tab.id === targetTab.id
      ? { ...tab, widgets: [...existingWidgets, newWidget] }
      : tab
  );

  const updatedDashboard = {
    ...targetDashboard,
    tabs: nextTabs,
    activeTabId: targetDashboard.activeTabId || nextTabs[0]?.id
  };

  const dashboards = dashboardList.map((d) =>
    d.id === updatedDashboard.id ? updatedDashboard : d
  );

  // Sync canvas from the updated active dashboard so builder sees the change.
  let canvas = workspaceConfig.canvas ? { ...workspaceConfig.canvas } : {};
  const isActiveDashboard =
    !targetDashboardId || targetDashboardId === dashboardList[0]?.id;
  if (isActiveDashboard) {
    canvas = {
      ...canvas,
      tabs: nextTabs,
      activeTabId: updatedDashboard.activeTabId
    };
    delete canvas.widgets;
    delete canvas.name;
  }

  return { ...workspaceConfig, canvas, dashboards };
}

// ─── Validation ────────────────────────────────────────────────────────────────

function validateWorkspaceDataModel(workspaceConfig) {
  const errors = [];
  const tables = listWorkspaceDataModelTables(workspaceConfig);

  for (const table of tables) {
    if (!table.source) errors.push("A table is missing a source name");
    if (!Array.isArray(table.columns)) {
      errors.push(`Table "${table.source}" has non-array columns`);
    }
    for (let i = 0; i < (table.rows || []).length; i++) {
      const row = table.rows[i];
      if (typeof row !== "object" || Array.isArray(row) || row === null) {
        errors.push(`Table "${table.source}" row[${i}] is not a plain object`);
      }
    }
  }

  return { valid: errors.length === 0, errors, tableCount: tables.length };
}

// ─── CSV utilities ────────────────────────────────────────────────────────────

function exportTableAsCsv(table) {
  const { columns = [], rows = [] } = table;
  if (!columns.length) return "";

  const escape = (val) => {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = columns.map(escape).join(",");
  const body = rows
    .map((row) => columns.map((col) => escape(row?.[col] ?? "")).join(","))
    .join("\n");
  return body ? `${header}\n${body}` : header;
}

function importTableFromCsv(csvText) {
  const lines = (csvText || "").trim().split("\n").filter(Boolean);
  if (!lines.length) return { columns: [], rows: [] };

  const parseRow = (line) => {
    const fields = [];
    let inQuote = false;
    let field = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === "," && !inQuote) {
        fields.push(field);
        field = "";
      } else {
        field += ch;
      }
    }
    fields.push(field);
    return fields;
  };

  const columns = parseRow(lines[0]).map((col) => col.trim()).filter(Boolean);
  const rows = lines.slice(1).map((line) => {
    const values = parseRow(line);
    return columns.reduce((row, col, i) => {
      row[col] = (values[i] ?? "").trim();
      return row;
    }, {});
  });

  return { columns, rows };
}

// ─── Bulk table content operations ────────────────────────────────────────────

/**
 * Append new rows to a table without changing its columns.
 */
function appendRowsToTable(workspaceConfig, table, newRows) {
  if (!Array.isArray(newRows) || !newRows.length) return workspaceConfig;

  const { canvas, dashboards } = applyTableMutation(
    workspaceConfig,
    table.widgetRefs,
    (config) => {
      const rows = Array.isArray(config.rows) ? config.rows : [];
      return { ...config, rows: [...rows, ...newRows] };
    }
  );

  return { ...workspaceConfig, canvas, dashboards };
}

/**
 * Replace a table's columns and rows in one atomic operation.
 * Columns not already present in the widget are added first; removed columns
 * are deleted. Rows are replaced entirely.
 */
function replaceTableContent(workspaceConfig, table, { columns = [], rows = [] } = {}) {
  const { canvas, dashboards } = applyTableMutation(
    workspaceConfig,
    table.widgetRefs,
    (config) => {
      const existingHidden = Array.isArray(config.fieldSettings?.hidden) ? config.fieldSettings.hidden : [];
      const nextHidden = existingHidden.filter((h) => columns.includes(h));
      return {
        ...config,
        columns,
        rows,
        fieldSettings: { hidden: nextHidden, order: [...columns] },
        sort: [],
        filter: { op: "and", clauses: [] }
      };
    }
  );

  return { ...workspaceConfig, canvas, dashboards };
}

// ─── Binding description helpers ──────────────────────────────────────────────

function describeBindingLane(binding) {
  if (!binding || binding.mode !== "integration") return "manual";
  if (binding.lane === "data-source") return "data-source";
  if (binding.lane === "workspace-integration") return "workspace-integration";
  return "integration";
}

function describeBindingMode(binding) {
  const lane = describeBindingLane(binding);
  if (lane === "manual") return { kind: "manual", label: "Manual local table", description: "Rows live in this workspace config and travel with export/import." };
  if (lane === "data-source") return {
    kind: "data-source",
    label: "Data source scope",
    description: "This binding scopes a live pipeline entity. Local rows are starter/sample records unless a server-side resolver replaces them at query time."
  };
  if (lane === "workspace-integration") return {
    kind: "workspace-integration",
    label: "Operational scope",
    description: "This binding scopes agent/tool operations to a provider object such as a location, project, folder, channel, or database."
  };
  return { kind: "integration", label: "Integration scope", description: "Bound to an external integration context." };
}

export {
  applyTableMutation,
  appendRowsToTable,
  replaceTableContent,
  getWidgetsFromWorkspaceConfig,
  listWorkspaceDataModelTables,
  deriveDataModelTableFromWidget,
  buildTableId,
  addTableField,
  renameTableField,
  deleteTableField,
  toggleTableFieldHidden,
  reorderTableField,
  addTableRow,
  updateTableCell,
  deleteTableRow,
  duplicateTableRow,
  createViewBackedTable,
  validateWorkspaceDataModel,
  exportTableAsCsv,
  importTableFromCsv,
  describeBindingLane,
  describeBindingMode
};
