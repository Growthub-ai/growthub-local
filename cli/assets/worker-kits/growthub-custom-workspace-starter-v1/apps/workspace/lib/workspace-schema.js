const GRID_COLUMNS = 12;
const GRID_ROWS = 16;
const KNOWN_WIDGET_KINDS = ["chart", "view", "iframe", "rich-text"];
const KNOWN_FIELDS = ["dashboards", "widgetTypes", "canvas"];
const KNOWN_DATA_BINDING_MODES = ["manual", "json", "csv"];

const WIDGET_SCHEMA_CONTRACTS = {
  WidgetPosition: {
    x: "integer >= 0",
    y: "integer >= 0",
    w: "integer >= 1",
    h: "integer >= 1",
    invariant: `x + w <= ${GRID_COLUMNS}; y + h <= ${GRID_ROWS}; no cell overlap`
  },
  WidgetBase: {
    id: "non-empty string",
    kind: KNOWN_WIDGET_KINDS.join(" | "),
    title: "non-empty string",
    position: "WidgetPosition",
    config: "kind-specific config object"
  },
  ChartWidgetConfig: {
    values: "number[]",
    binding: "StaticDataBinding optional"
  },
  ViewWidgetConfig: {
    source: "string",
    layout: "Table",
    columns: "string[]",
    rows: "record[]",
    binding: "StaticDataBinding optional"
  },
  IframeWidgetConfig: {
    url: "string"
  },
  RichTextWidgetConfig: {
    text: "string",
    binding: "StaticDataBinding optional"
  },
  DashboardConfig: {
    id: "non-empty string",
    name: "non-empty string",
    createdBy: "string",
    updatedAt: "string",
    status: "draft | active | archived"
  },
  CanvasConfig: {
    layout: `{ columns: ${GRID_COLUMNS}, rowHeight: number, gap: number, responsive: boolean }`,
    widgets: "WidgetBase[] for single-tab canvases only",
    tabs: "optional tab array for multi-tab canvases; each tab owns WidgetBase[] and replaces canvas.widgets",
    activeTabId: "optional active tab id",
    bindings: "workspace-level boolean/config bindings"
  },
  StaticDataBinding: {
    mode: KNOWN_DATA_BINDING_MODES.join(" | "),
    source: "string",
    rows: "manual record[] optional",
    json: "JSON string optional",
    csv: "CSV string optional"
  }
};

const SAMPLE_VIEW_ROWS = [
  { Name: "CMWL Direct", "Domain Name": "centerformedica" },
  { Name: "Medi-Weightloss", "Domain Name": "mediweightloss.com" },
  { Name: "Optima Tyler", "Domain Name": "optimatyler.com" },
  { Name: "Balanced Hormone He...", "Domain Name": "balancedhormor" },
  { Name: "Jolie Aesthetics RVA", "Domain Name": "jolie-aesthetics.c" },
  { Name: "Livea Centers", "Domain Name": "livea.com" }
];

const SAMPLE_DATA_BINDINGS = {
  companiesManual: {
    mode: "manual",
    source: "Manual rows",
    rows: SAMPLE_VIEW_ROWS
  },
  reportingJson: {
    mode: "json",
    source: "Sample JSON",
    json: JSON.stringify([
      { metric: "Leads", value: 42 },
      { metric: "Qualified", value: 18 },
      { metric: "Booked", value: 7 }
    ], null, 2)
  },
  contentCsv: {
    mode: "csv",
    source: "Sample CSV",
    csv: "channel,status,count\nBlog,Draft,4\nEmail,Review,3\nSocial,Scheduled,9"
  }
};

function defaultConfigFor(kind) {
  switch (kind) {
    case "chart":
      return { values: [58, 36, 72, 48, 64], binding: SAMPLE_DATA_BINDINGS.reportingJson };
    case "view":
      return {
        source: "Companies",
        layout: "Table",
        columns: ["Name", "Domain Name"],
        rows: SAMPLE_VIEW_ROWS,
        binding: SAMPLE_DATA_BINDINGS.companiesManual
      };
    case "iframe":
      return { url: "" };
    case "rich-text":
      return { text: "", binding: { mode: "manual", source: "Manual text", rows: [] } };
    default:
      return {};
  }
}

function createWidget(kind, title, position, config = defaultConfigFor(kind)) {
  return { kind, title, position, config };
}

const DASHBOARD_TEMPLATES = [
  {
    id: "blank",
    name: "Blank",
    description: "Empty governed canvas",
    widgets: []
  },
  {
    id: "client-portal",
    name: "Client Portal",
    description: "Client status, documents, and embedded portal area",
    widgets: [
      createWidget("rich-text", "Client Summary", { x: 0, y: 0, w: 4, h: 4 }, { text: "Current client priorities, owner notes, and next milestone.", binding: { mode: "manual", source: "Manual text", rows: [] } }),
      createWidget("view", "Companies", { x: 4, y: 0, w: 5, h: 5 }),
      createWidget("iframe", "Client Portal Embed", { x: 9, y: 0, w: 3, h: 5 }, { url: "" }),
      createWidget("chart", "Delivery Health", { x: 0, y: 4, w: 4, h: 4 }, { values: [72, 64, 81, 58, 76], binding: SAMPLE_DATA_BINDINGS.reportingJson })
    ]
  },
  {
    id: "content-ops",
    name: "Content Ops",
    description: "Editorial pipeline and review snapshot",
    widgets: [
      createWidget("view", "Content Queue", { x: 0, y: 0, w: 5, h: 5 }, {
        source: "Content",
        layout: "Table",
        columns: ["Channel", "Status"],
        rows: [
          { Channel: "Blog", Status: "Draft" },
          { Channel: "Email", Status: "Review" },
          { Channel: "Social", Status: "Scheduled" }
        ],
        binding: SAMPLE_DATA_BINDINGS.contentCsv
      }),
      createWidget("chart", "Publishing Mix", { x: 5, y: 0, w: 4, h: 4 }, { values: [34, 52, 45, 61, 38], binding: SAMPLE_DATA_BINDINGS.contentCsv }),
      createWidget("rich-text", "Review Notes", { x: 9, y: 0, w: 3, h: 4 }, { text: "Open creative review notes and approval blockers.", binding: { mode: "manual", source: "Manual text", rows: [] } })
    ]
  },
  {
    id: "reporting-dashboard",
    name: "Reporting Dashboard",
    description: "KPIs, table, and executive readout",
    widgets: [
      createWidget("chart", "Pipeline Trend", { x: 0, y: 0, w: 4, h: 5 }, { values: [42, 58, 63, 71, 86], binding: SAMPLE_DATA_BINDINGS.reportingJson }),
      createWidget("chart", "Conversion", { x: 4, y: 0, w: 4, h: 5 }, { values: [28, 36, 44, 39, 52], binding: SAMPLE_DATA_BINDINGS.reportingJson }),
      createWidget("view", "Performance Table", { x: 8, y: 0, w: 4, h: 5 }),
      createWidget("rich-text", "Executive Summary", { x: 0, y: 5, w: 6, h: 3 }, { text: "Weekly readout, risks, and decisions.", binding: { mode: "manual", source: "Manual text", rows: [] } })
    ]
  },
  {
    id: "creative-review",
    name: "Creative Review",
    description: "Creative artifact embed and approval notes",
    widgets: [
      createWidget("iframe", "Creative Preview", { x: 0, y: 0, w: 7, h: 6 }, { url: "" }),
      createWidget("rich-text", "Approval Notes", { x: 7, y: 0, w: 5, h: 3 }, { text: "Feedback, approvals, and revision requests.", binding: { mode: "manual", source: "Manual text", rows: [] } }),
      createWidget("view", "Review Queue", { x: 7, y: 3, w: 5, h: 4 }, {
        source: "Creative",
        layout: "Table",
        columns: ["Asset", "Status"],
        rows: [
          { Asset: "Landing Page", Status: "Review" },
          { Asset: "Email Hero", Status: "Approved" },
          { Asset: "Social Set", Status: "Revision" }
        ],
        binding: { mode: "manual", source: "Manual rows", rows: [] }
      })
    ]
  },
  {
    id: "agency-delivery",
    name: "Agency Delivery",
    description: "Agency workstream, KPI, and delivery notes",
    widgets: [
      createWidget("view", "Delivery Board", { x: 0, y: 0, w: 5, h: 5 }, {
        source: "Tasks",
        layout: "Table",
        columns: ["Workstream", "Owner"],
        rows: [
          { Workstream: "Strategy", Owner: "Agency" },
          { Workstream: "Creative", Owner: "Design" },
          { Workstream: "Launch", Owner: "Ops" }
        ],
        binding: { mode: "manual", source: "Manual rows", rows: [] }
      }),
      createWidget("chart", "Utilization", { x: 5, y: 0, w: 3, h: 4 }, { values: [62, 74, 69, 82, 77], binding: SAMPLE_DATA_BINDINGS.reportingJson }),
      createWidget("rich-text", "Client Commitments", { x: 8, y: 0, w: 4, h: 4 }, { text: "Committed scope, launch date, and open risks.", binding: { mode: "manual", source: "Manual text", rows: [] } }),
      createWidget("iframe", "Delivery Portal", { x: 0, y: 5, w: 6, h: 4 }, { url: "" })
    ]
  }
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteInt(value) {
  return typeof value === "number" && Number.isFinite(value) && Math.floor(value) === value;
}

function validateStringArray(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== "string") errors.push(`${path}[${index}] must be a string`);
  });
}

function validateStaticDataBinding(binding, path, errors) {
  if (binding === undefined) return;
  if (!isPlainObject(binding)) {
    errors.push(`${path} must be a plain object`);
    return;
  }
  if (!KNOWN_DATA_BINDING_MODES.includes(binding.mode)) {
    errors.push(`${path}.mode must be one of ${KNOWN_DATA_BINDING_MODES.join(", ")}`);
  }
  if (binding.source !== undefined && typeof binding.source !== "string") {
    errors.push(`${path}.source must be a string`);
  }
  if (binding.rows !== undefined && !Array.isArray(binding.rows)) {
    errors.push(`${path}.rows must be an array`);
  }
  if (binding.json !== undefined && typeof binding.json !== "string") {
    errors.push(`${path}.json must be a string`);
  }
  if (binding.csv !== undefined && typeof binding.csv !== "string") {
    errors.push(`${path}.csv must be a string`);
  }
}

function validateWidgetConfig(kind, config, path, errors) {
  if (config === undefined) return;
  if (!isPlainObject(config)) {
    errors.push(`${path} must be a plain object`);
    return;
  }
  if (kind === "chart") {
    if (config.values !== undefined) {
      if (!Array.isArray(config.values)) {
        errors.push(`${path}.values must be an array`);
      } else {
        config.values.forEach((value, index) => {
          if (typeof value !== "number" || !Number.isFinite(value)) {
            errors.push(`${path}.values[${index}] must be a finite number`);
          }
        });
      }
    }
    validateStaticDataBinding(config.binding, `${path}.binding`, errors);
  }
  if (kind === "view") {
    if (config.source !== undefined && typeof config.source !== "string") errors.push(`${path}.source must be a string`);
    if (config.layout !== undefined && config.layout !== "Table") errors.push(`${path}.layout must be Table`);
    if (config.columns !== undefined) validateStringArray(config.columns, `${path}.columns`, errors);
    if (config.rows !== undefined && !Array.isArray(config.rows)) errors.push(`${path}.rows must be an array`);
    validateStaticDataBinding(config.binding, `${path}.binding`, errors);
  }
  if (kind === "iframe" && config.url !== undefined && typeof config.url !== "string") {
    errors.push(`${path}.url must be a string`);
  }
  if (kind === "rich-text") {
    if (config.text !== undefined && typeof config.text !== "string") errors.push(`${path}.text must be a string`);
    validateStaticDataBinding(config.binding, `${path}.binding`, errors);
  }
}

function validateDashboardArray(dashboards, errors) {
  if (!Array.isArray(dashboards)) {
    errors.push("dashboards must be an array");
    return;
  }
  const ids = new Set();
  dashboards.forEach((dashboard, index) => {
    const prefix = `dashboards[${index}]`;
    if (!isPlainObject(dashboard)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    if (typeof dashboard.id !== "string" || !dashboard.id) errors.push(`${prefix}.id must be a non-empty string`);
    if (dashboard.id && ids.has(dashboard.id)) errors.push(`${prefix}.id duplicates an earlier dashboard id`);
    ids.add(dashboard.id);
    if (typeof dashboard.name !== "string" || !dashboard.name) errors.push(`${prefix}.name must be a non-empty string`);
    if (dashboard.createdBy !== undefined && typeof dashboard.createdBy !== "string") errors.push(`${prefix}.createdBy must be a string`);
    if (dashboard.updatedAt !== undefined && typeof dashboard.updatedAt !== "string") errors.push(`${prefix}.updatedAt must be a string`);
    if (dashboard.status !== undefined && !["draft", "active", "archived"].includes(dashboard.status)) {
      errors.push(`${prefix}.status must be draft, active, or archived`);
    }
  });
}

function validateWidgetArray(widgets, contextPath, errors, seenIds) {
  if (!Array.isArray(widgets)) {
    errors.push(`${contextPath} must be an array`);
    return;
  }
  const occupied = new Map();
  widgets.forEach((widget, index) => {
    const prefix = `${contextPath}[${index}]`;
    if (!isPlainObject(widget)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    if (typeof widget.id !== "string" || !widget.id) {
      errors.push(`${prefix}.id must be a non-empty string`);
    } else if (seenIds.has(widget.id)) {
      errors.push(`${prefix}.id duplicates an earlier widget id`);
    } else {
      seenIds.add(widget.id);
    }
    if (!KNOWN_WIDGET_KINDS.includes(widget.kind)) {
      errors.push(`${prefix}.kind must be one of ${KNOWN_WIDGET_KINDS.join(", ")}`);
    }
    if (typeof widget.title !== "string" || !widget.title) {
      errors.push(`${prefix}.title must be a non-empty string`);
    }
    if (!isPlainObject(widget.position)) {
      errors.push(`${prefix}.position must be an object`);
      return;
    }
    for (const k of ["x", "y", "w", "h"]) {
      if (!isFiniteInt(widget.position[k])) errors.push(`${prefix}.position.${k} must be a finite integer`);
    }
    if (
      isFiniteInt(widget.position.x) &&
      isFiniteInt(widget.position.w) &&
      (widget.position.x < 0 || widget.position.w < 1 || widget.position.x + widget.position.w > GRID_COLUMNS)
    ) {
      errors.push(`${prefix} x/w out of [0..${GRID_COLUMNS}] grid`);
    }
    if (
      isFiniteInt(widget.position.y) &&
      isFiniteInt(widget.position.h) &&
      (widget.position.y < 0 || widget.position.h < 1 || widget.position.y + widget.position.h > GRID_ROWS)
    ) {
      errors.push(`${prefix} y/h out of [0..${GRID_ROWS}] grid`);
    }
    if (
      isFiniteInt(widget.position.x) &&
      isFiniteInt(widget.position.y) &&
      isFiniteInt(widget.position.w) &&
      isFiniteInt(widget.position.h)
    ) {
      for (let dx = 0; dx < widget.position.w; dx += 1) {
        for (let dy = 0; dy < widget.position.h; dy += 1) {
          const cell = `${widget.position.x + dx}:${widget.position.y + dy}`;
          const previous = occupied.get(cell);
          if (previous) {
            errors.push(`${prefix} overlaps ${previous} at grid cell ${cell}`);
          } else {
            occupied.set(cell, `${prefix}.position`);
          }
        }
      }
    }
    validateWidgetConfig(widget.kind, widget.config, `${prefix}.config`, errors);
  });
}

function validateCanvasConfig(canvas, errors) {
  if (!isPlainObject(canvas)) {
    errors.push("canvas must be a plain object");
    return;
  }
  if (canvas.layout !== undefined) {
    if (!isPlainObject(canvas.layout)) {
      errors.push("canvas.layout must be a plain object");
    } else if (canvas.layout.columns !== undefined && canvas.layout.columns !== GRID_COLUMNS) {
      errors.push(`canvas.layout.columns must be ${GRID_COLUMNS}`);
    }
  }
  const seenWidgetIds = new Set();
  if (canvas.widgets !== undefined) {
    validateWidgetArray(canvas.widgets, "canvas.widgets", errors, seenWidgetIds);
  }
  if (canvas.tabs !== undefined) {
    if (!Array.isArray(canvas.tabs)) {
      errors.push("canvas.tabs must be an array");
    } else {
      const seenTabIds = new Set();
      canvas.tabs.forEach((tab, index) => {
        const tabPrefix = `canvas.tabs[${index}]`;
        if (!isPlainObject(tab)) {
          errors.push(`${tabPrefix} must be an object`);
          return;
        }
        if (typeof tab.id !== "string" || !tab.id) {
          errors.push(`${tabPrefix}.id must be a non-empty string`);
        } else if (seenTabIds.has(tab.id)) {
          errors.push(`${tabPrefix}.id duplicates an earlier tab id`);
        } else {
          seenTabIds.add(tab.id);
        }
        if (typeof tab.name !== "string" || !tab.name) errors.push(`${tabPrefix}.name must be a non-empty string`);
        if (tab.widgets !== undefined) validateWidgetArray(tab.widgets, `${tabPrefix}.widgets`, errors, seenWidgetIds);
      });
      if (canvas.activeTabId !== undefined && !seenTabIds.has(canvas.activeTabId)) {
        errors.push("canvas.activeTabId must match an existing tab id");
      }
    }
  }
  if (canvas.activeTabId !== undefined && typeof canvas.activeTabId !== "string") {
    errors.push("canvas.activeTabId must be a string");
  }
}

function validateWorkspaceConfig(nextConfig) {
  if (!isPlainObject(nextConfig)) {
    const error = new Error("workspace config must be a plain object");
    error.code = "INVALID_WORKSPACE_CONFIG";
    error.details = ["root must be a plain object"];
    throw error;
  }
  const errors = [];
  for (const key of Object.keys(nextConfig)) {
    if (!KNOWN_FIELDS.includes(key)) errors.push(`unknown top-level field: ${key}`);
  }
  if (nextConfig.dashboards !== undefined) validateDashboardArray(nextConfig.dashboards, errors);
  if (nextConfig.widgetTypes !== undefined && !Array.isArray(nextConfig.widgetTypes)) errors.push("widgetTypes must be an array");
  if (nextConfig.canvas !== undefined) validateCanvasConfig(nextConfig.canvas, errors);
  if (errors.length) {
    const error = new Error(`invalid workspace config: ${errors.join("; ")}`);
    error.code = "INVALID_WORKSPACE_CONFIG";
    error.details = errors;
    throw error;
  }
}

export {
  DASHBOARD_TEMPLATES,
  GRID_COLUMNS,
  GRID_ROWS,
  KNOWN_DATA_BINDING_MODES,
  KNOWN_FIELDS,
  KNOWN_WIDGET_KINDS,
  SAMPLE_DATA_BINDINGS,
  SAMPLE_VIEW_ROWS,
  WIDGET_SCHEMA_CONTRACTS,
  defaultConfigFor,
  validateWorkspaceConfig
};
