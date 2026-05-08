/**
 * Workspace Config Contract V1 — local source of truth.
 *
 * Authoritative reference: `docs/WORKSPACE_CONFIG_CONTRACT_V1.md`.
 * Companion runtime doc: `docs/WORKSPACE_BUILDER_RUNTIME_V1.md`.
 *
 * This file owns the workspace config validator. The persisted file lives at
 * `<workspace>/growthub.config.json`. The PATCH allowlist on `/api/workspace`
 * is permanently restricted to:
 *
 *   - `dashboards`     dashboard rows (id, name, status, tabs, activeTabId)
 *   - `widgetTypes`    palette of allowed widget kinds (label/icon)
 *   - `canvas`         active canvas: layout, single-tab `widgets[]`, or
 *                      multi-tab `tabs[]` + `activeTabId`, plus `bindings`
 *   - `dataModel`      governed manual data objects, never dashboard widgets
 *
 * Other top-level fields (`id`, `name`, `description`, `capabilities`,
 * `branding`, `pipelines`, `integrations`, `provenance`) are preserved
 * round-trip but cannot be mutated through PATCH. The validator rejects
 * unknown fields inside the allowlisted sections.
 *
 * Canonical canvas shape (mutually exclusive — never both at once):
 *
 *   single-tab → `canvas.widgets[]`           (DO NOT also serialize tabs)
 *   multi-tab  → `canvas.tabs[]` + `activeTabId` (DO NOT also serialize widgets)
 *
 * Import/export envelope: `{ version: 1, kind: "growthub-workspace-template",
 * exportedAt, source, name, description, payload }`. Raw `{dashboards,
 * widgetTypes, canvas}` payloads are also accepted for back-compat.
 *
 * Widget grid is a strict 12-column × 16-row fixed lattice with
 * non-overlapping integer rectangles. Widget IDs are minted at clone time —
 * template widgets intentionally omit `id`.
 *
 * Validation errors are surfaced as readable strings on the thrown error
 * (`error.details: string[]`) so agents and the no-code Save UI can round-trip
 * them without parsing a stack trace.
 */

const GRID_COLUMNS = 12;
const GRID_ROWS = 16;
const KNOWN_WIDGET_KINDS = ["chart", "view", "iframe", "rich-text"];
const KNOWN_FIELDS = ["dashboards", "widgetTypes", "canvas", "dataModel"];
const KNOWN_DATA_BINDING_MODES = ["manual", "json", "csv", "integration"];
const KNOWN_CHART_TYPES = ["bar-vertical", "bar-horizontal", "line", "pie", "sum", "gauge"];
const KNOWN_FILTER_OPERATORS = ["eq", "ne", "contains", "gt", "lt", "isEmpty", "isNotEmpty"];
const KNOWN_FILTER_CONJUNCTIONS = ["and", "or"];
const KNOWN_SORT_DIRECTIONS = ["asc", "desc"];
const KNOWN_AGGREGATIONS = ["sum", "avg", "count", "min", "max"];

const NORMALIZED_OBJECT_FIELD_IDS = ["id", "label", "secondaryLabel", "entityType", "provider", "lane", "status"];
const WORKSPACE_TEMPLATE_KIND = "growthub-workspace-template";
const WORKSPACE_TEMPLATE_VERSION = 1;
const WORKSPACE_TEMPLATE_SOURCE = "growthub-custom-workspace-starter-v1";

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
    values: "number[] (legacy preserved)",
    chartType: `${KNOWN_CHART_TYPES.join(" | ")} optional, defaults to bar-vertical`,
    xAxis: "ChartAxisConfig optional",
    yAxis: "ChartAxisConfig optional",
    style: "ChartStyleConfig optional",
    filter: "FilterConfig optional",
    binding: "StaticDataBinding optional"
  },
  ViewWidgetConfig: {
    source: "string",
    layout: "Table",
    columns: "string[]",
    rows: "record[]",
    fieldSettings: "FieldSettingsConfig optional (hidden[], order[])",
    sort: "SortClause[] optional ({ fieldId, direction })",
    filter: "FilterConfig optional ({ op, clauses[] })",
    binding: "StaticDataBinding optional"
  },
  ChartAxisConfig: {
    field: "string optional",
    sort: "string optional (asc | desc | position)",
    aggregation: `${KNOWN_AGGREGATIONS.join(" | ")} optional`,
    groupBy: "string optional",
    omitZero: "boolean optional",
    min: "string | number optional",
    max: "string | number optional"
  },
  ChartStyleConfig: {
    colors: "string optional (auto | manual swatch label)",
    axisName: "string optional",
    dataLabels: "boolean optional"
  },
  FieldSettingsConfig: {
    hidden: "string[] of column names hidden from preview",
    order: "string[] of column names defining custom order"
  },
  SortClause: {
    fieldId: "non-empty string (column name)",
    direction: KNOWN_SORT_DIRECTIONS.join(" | ")
  },
  FilterConfig: {
    op: KNOWN_FILTER_CONJUNCTIONS.join(" | "),
    clauses: "FilterClause[]"
  },
  FilterClause: {
    fieldId: "non-empty string (column name)",
    operator: KNOWN_FILTER_OPERATORS.join(" | "),
    value: "string | number | boolean optional"
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
    csv: "CSV string optional",
    sourceType: "managed-integrations | custom-api-webhooks optional",
    sourceAuthority: "string optional — adapter authority label, never a secret",
    endpointRef: "string optional — stable custom API/webhook reference, never a token",
    integrationId: "string optional (when mode === 'integration')",
    lane: "string optional (when mode === 'integration')",
    entityId: "string optional — stable source object ID (never a token or credential)",
    entityType: "string optional — adapter-provided object type",
    entityLabel: "string optional — display-only resolved label, not authoritative"
  },
  NormalizedIntegrationEntity: {
    id: "non-empty string — stable source object ID",
    label: "non-empty string — primary display name",
    secondaryLabel: "string optional — muted subtitle (ID, domain, or type hint)",
    entityType: "string optional — adapter-provided object type",
    provider: "string optional — adapter/provider slug",
    lane: "string optional — adapter-provided lane",
    status: "string optional — adapter-provided status",
    metadata: "record optional — additional adapter metadata"
  }
};

const SAMPLE_VIEW_ROWS = [
  { Name: "Example Company A", "Domain Name": "example-a.test" },
  { Name: "Example Company B", "Domain Name": "example-b.test" },
  { Name: "Example Company C", "Domain Name": "example-c.test" },
  { Name: "Example Company D", "Domain Name": "example-d.test" },
  { Name: "Example Company E", "Domain Name": "example-e.test" },
  { Name: "Example Company F", "Domain Name": "example-f.test" }
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
        source: "",
        layout: "Table",
        columns: [],
        rows: [],
        binding: { mode: "manual", source: "Static rows", rows: [] }
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
    category: "blank",
    bestFor: ["Custom layouts", "Fresh starts"],
    tags: ["blank", "starter"],
    preview: { layout: "empty", summary: "Start from an empty fixed-grid canvas" },
    dashboard: { name: "Blank", status: "draft" },
    widgets: []
  },
  {
    id: "client-portal",
    name: "Client Portal",
    description: "Client status, documents, and embedded portal area",
    category: "agency",
    bestFor: ["Agencies", "Consultants", "Client delivery"],
    tags: ["client", "portal", "delivery"],
    preview: {
      layout: "multi-panel",
      summary: "Client summary, companies table, portal embed, and delivery health"
    },
    dashboard: { name: "Client Portal", status: "draft" },
    widgets: [
      createWidget("rich-text", "Client Summary", { x: 0, y: 0, w: 4, h: 4 }, { text: "Current client priorities, owner notes, and next milestone.", binding: { mode: "manual", source: "Manual text", rows: [] } }),
      createWidget("view", "Companies", { x: 4, y: 0, w: 5, h: 5 }, {
        source: "Companies",
        layout: "Table",
        columns: ["Name", "Domain Name"],
        rows: SAMPLE_VIEW_ROWS,
        binding: SAMPLE_DATA_BINDINGS.companiesManual
      }),
      createWidget("iframe", "Client Portal Embed", { x: 9, y: 0, w: 3, h: 5 }, { url: "" }),
      createWidget("chart", "Delivery Health", { x: 0, y: 4, w: 4, h: 4 }, { values: [72, 64, 81, 58, 76], binding: SAMPLE_DATA_BINDINGS.reportingJson })
    ]
  },
  {
    id: "content-ops",
    name: "Content Ops",
    description: "Editorial pipeline and review snapshot",
    category: "content",
    bestFor: ["Editorial teams", "Content marketers", "Content reviewers"],
    tags: ["content", "editorial", "review"],
    preview: {
      layout: "queue-and-mix",
      summary: "Content queue, publishing mix chart, and review notes"
    },
    dashboard: { name: "Content Ops", status: "draft" },
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
    category: "reporting",
    bestFor: ["Executives", "Analytics teams", "Operations"],
    tags: ["kpi", "reporting", "analytics"],
    preview: {
      layout: "kpi-grid",
      summary: "Pipeline trend, conversion chart, performance table, executive summary"
    },
    dashboard: { name: "Reporting Dashboard", status: "draft" },
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
    category: "creative",
    bestFor: ["Creative leads", "Designers", "Account managers"],
    tags: ["creative", "review", "approvals"],
    preview: {
      layout: "embed-and-queue",
      summary: "Creative preview embed, approval notes, and review queue"
    },
    dashboard: { name: "Creative Review", status: "draft" },
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
    category: "agency",
    bestFor: ["Agencies", "Delivery leads", "Producers"],
    tags: ["agency", "delivery", "ops"],
    preview: {
      layout: "delivery-grid",
      summary: "Delivery board, utilization chart, client commitments, delivery portal"
    },
    dashboard: { name: "Agency Delivery", status: "draft" },
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
  if (binding.mode === "integration") {
    if (typeof binding.integrationId !== "string" || !binding.integrationId.trim()) {
      errors.push(`${path}.integrationId is required when mode is integration`);
    }
    if (typeof binding.lane !== "string" || !binding.lane.trim()) {
      errors.push(`${path}.lane is required when mode is integration`);
    }
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
  if (binding.sourceType !== undefined && typeof binding.sourceType !== "string") {
    errors.push(`${path}.sourceType must be a string`);
  }
  if (binding.sourceAuthority !== undefined && typeof binding.sourceAuthority !== "string") {
    errors.push(`${path}.sourceAuthority must be a string`);
  }
  if (binding.endpointRef !== undefined && typeof binding.endpointRef !== "string") {
    errors.push(`${path}.endpointRef must be a string`);
  }
  if (binding.objectId !== undefined && typeof binding.objectId !== "string") {
    errors.push(`${path}.objectId must be a string`);
  }
  if (binding.integrationId !== undefined && typeof binding.integrationId !== "string") {
    errors.push(`${path}.integrationId must be a string`);
  }
  if (binding.lane !== undefined && typeof binding.lane !== "string") {
    errors.push(`${path}.lane must be a string`);
  }
  if (binding.entityId !== undefined && typeof binding.entityId !== "string") {
    errors.push(`${path}.entityId must be a string`);
  }
  if (binding.entityType !== undefined && typeof binding.entityType !== "string") {
    errors.push(`${path}.entityType must be a string`);
  }
  if (binding.entityLabel !== undefined && typeof binding.entityLabel !== "string") {
    errors.push(`${path}.entityLabel must be a string`);
  }
}

function validateFieldSettings(fieldSettings, path, errors) {
  if (fieldSettings === undefined) return;
  if (!isPlainObject(fieldSettings)) {
    errors.push(`${path} must be a plain object`);
    return;
  }
  if (fieldSettings.hidden !== undefined) validateStringArray(fieldSettings.hidden, `${path}.hidden`, errors);
  if (fieldSettings.order !== undefined) validateStringArray(fieldSettings.order, `${path}.order`, errors);
}

function validateSortClauses(sort, path, errors) {
  if (sort === undefined) return;
  if (!Array.isArray(sort)) {
    errors.push(`${path} must be an array`);
    return;
  }
  sort.forEach((clause, index) => {
    const prefix = `${path}[${index}]`;
    if (!isPlainObject(clause)) {
      errors.push(`${prefix} must be a plain object`);
      return;
    }
    if (typeof clause.fieldId !== "string" || !clause.fieldId) {
      errors.push(`${prefix}.fieldId must be a non-empty string`);
    }
    if (clause.direction !== undefined && !KNOWN_SORT_DIRECTIONS.includes(clause.direction)) {
      errors.push(`${prefix}.direction must be one of ${KNOWN_SORT_DIRECTIONS.join(", ")}`);
    }
  });
}

function validateFilterClauses(filter, path, errors) {
  if (filter === undefined) return;
  if (!isPlainObject(filter)) {
    errors.push(`${path} must be a plain object`);
    return;
  }
  if (filter.op !== undefined && !KNOWN_FILTER_CONJUNCTIONS.includes(filter.op)) {
    errors.push(`${path}.op must be one of ${KNOWN_FILTER_CONJUNCTIONS.join(", ")}`);
  }
  if (filter.clauses !== undefined) {
    if (!Array.isArray(filter.clauses)) {
      errors.push(`${path}.clauses must be an array`);
    } else {
      filter.clauses.forEach((clause, index) => {
        const prefix = `${path}.clauses[${index}]`;
        if (!isPlainObject(clause)) {
          errors.push(`${prefix} must be a plain object`);
          return;
        }
        if (typeof clause.fieldId !== "string" || !clause.fieldId) {
          errors.push(`${prefix}.fieldId must be a non-empty string`);
        }
        if (clause.operator !== undefined && !KNOWN_FILTER_OPERATORS.includes(clause.operator)) {
          errors.push(`${prefix}.operator must be one of ${KNOWN_FILTER_OPERATORS.join(", ")}`);
        }
        if (
          clause.value !== undefined &&
          typeof clause.value !== "string" &&
          typeof clause.value !== "number" &&
          typeof clause.value !== "boolean"
        ) {
          errors.push(`${prefix}.value must be a string, number, or boolean`);
        }
      });
    }
  }
}

function validateChartAxis(axis, path, errors) {
  if (axis === undefined) return;
  if (!isPlainObject(axis)) {
    errors.push(`${path} must be a plain object`);
    return;
  }
  if (axis.field !== undefined && typeof axis.field !== "string") {
    errors.push(`${path}.field must be a string`);
  }
  if (axis.sort !== undefined && typeof axis.sort !== "string") {
    errors.push(`${path}.sort must be a string`);
  }
  if (axis.aggregation !== undefined && !KNOWN_AGGREGATIONS.includes(axis.aggregation)) {
    errors.push(`${path}.aggregation must be one of ${KNOWN_AGGREGATIONS.join(", ")}`);
  }
  if (axis.groupBy !== undefined && typeof axis.groupBy !== "string") {
    errors.push(`${path}.groupBy must be a string`);
  }
  if (axis.omitZero !== undefined && typeof axis.omitZero !== "boolean") {
    errors.push(`${path}.omitZero must be a boolean`);
  }
  if (axis.min !== undefined && typeof axis.min !== "string" && typeof axis.min !== "number") {
    errors.push(`${path}.min must be a string or number`);
  }
  if (axis.max !== undefined && typeof axis.max !== "string" && typeof axis.max !== "number") {
    errors.push(`${path}.max must be a string or number`);
  }
}

function validateChartStyle(style, path, errors) {
  if (style === undefined) return;
  if (!isPlainObject(style)) {
    errors.push(`${path} must be a plain object`);
    return;
  }
  if (style.colors !== undefined && typeof style.colors !== "string") {
    errors.push(`${path}.colors must be a string`);
  }
  if (style.axisName !== undefined && typeof style.axisName !== "string") {
    errors.push(`${path}.axisName must be a string`);
  }
  if (style.dataLabels !== undefined && typeof style.dataLabels !== "boolean") {
    errors.push(`${path}.dataLabels must be a boolean`);
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
    if (config.chartType !== undefined && !KNOWN_CHART_TYPES.includes(config.chartType)) {
      errors.push(`${path}.chartType must be one of ${KNOWN_CHART_TYPES.join(", ")}`);
    }
    validateChartAxis(config.xAxis, `${path}.xAxis`, errors);
    validateChartAxis(config.yAxis, `${path}.yAxis`, errors);
    validateChartStyle(config.style, `${path}.style`, errors);
    validateFilterClauses(config.filter, `${path}.filter`, errors);
    validateStaticDataBinding(config.binding, `${path}.binding`, errors);
  }
  if (kind === "view") {
    if (config.source !== undefined && typeof config.source !== "string") errors.push(`${path}.source must be a string`);
    if (config.layout !== undefined && config.layout !== "Table") errors.push(`${path}.layout must be Table`);
    if (config.columns !== undefined) validateStringArray(config.columns, `${path}.columns`, errors);
    if (config.rows !== undefined && !Array.isArray(config.rows)) errors.push(`${path}.rows must be an array`);
    validateFieldSettings(config.fieldSettings, `${path}.fieldSettings`, errors);
    validateSortClauses(config.sort, `${path}.sort`, errors);
    validateFilterClauses(config.filter, `${path}.filter`, errors);
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
    if (dashboard.tabs !== undefined) {
      validateDashboardTabs(dashboard.tabs, dashboard.activeTabId, `${prefix}.tabs`, errors, new Set());
    }
    if (dashboard.activeTabId !== undefined && typeof dashboard.activeTabId !== "string") {
      errors.push(`${prefix}.activeTabId must be a string`);
    }
  });
}

function validateDashboardTabs(tabs, activeTabId, contextPath, errors, seenWidgetIds) {
  if (!Array.isArray(tabs)) {
    errors.push(`${contextPath} must be an array`);
    return;
  }
  if (!tabs.length) {
    errors.push(`${contextPath} must include at least one tab`);
    return;
  }
  const seenTabIds = new Set();
  tabs.forEach((tab, index) => {
    const tabPrefix = `${contextPath}[${index}]`;
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
    validateWidgetArray(tab.widgets || [], `${tabPrefix}.widgets`, errors, seenWidgetIds);
  });
  if (activeTabId !== undefined && !seenTabIds.has(activeTabId)) {
    errors.push(`${contextPath.replace(/\.tabs$/, "")}.activeTabId must match an existing tab id`);
  }
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

function validateDataModelConfig(dataModel, errors) {
  if (dataModel === undefined) return;
  if (!isPlainObject(dataModel)) {
    errors.push("dataModel must be a plain object");
    return;
  }
  if (dataModel.objects === undefined) return;
  if (!Array.isArray(dataModel.objects)) {
    errors.push("dataModel.objects must be an array");
    return;
  }
  const ids = new Set();
  dataModel.objects.forEach((object, index) => {
    const prefix = `dataModel.objects[${index}]`;
    if (!isPlainObject(object)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    if (typeof object.id !== "string" || !object.id.trim()) {
      errors.push(`${prefix}.id must be a non-empty string`);
    } else if (ids.has(object.id)) {
      errors.push(`${prefix}.id duplicates an earlier object id`);
    } else {
      ids.add(object.id);
    }
    if (typeof object.label !== "string" || !object.label.trim()) errors.push(`${prefix}.label must be a non-empty string`);
    if (object.source !== undefined && typeof object.source !== "string") errors.push(`${prefix}.source must be a string`);
    validateStringArray(object.columns, `${prefix}.columns`, errors);
    if (!Array.isArray(object.rows)) {
      errors.push(`${prefix}.rows must be an array`);
    } else {
      object.rows.forEach((row, rowIndex) => {
        if (!isPlainObject(row)) errors.push(`${prefix}.rows[${rowIndex}] must be a plain object`);
      });
    }
    validateStaticDataBinding(object.binding, `${prefix}.binding`, errors);
    validateFieldSettings(object.fieldSettings, `${prefix}.fieldSettings`, errors);
  });
}

function validateTemplateWidgetArray(widgets, contextPath, errors) {
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

function normalizeWorkspaceTemplate(template) {
  if (!isPlainObject(template)) return template;
  const widgets = Array.isArray(template.widgets) ? template.widgets : [];
  const tags = Array.isArray(template.tags) ? template.tags.filter((tag) => typeof tag === "string") : [];
  const bestFor = Array.isArray(template.bestFor) ? template.bestFor.filter((item) => typeof item === "string") : [];
  const preview = isPlainObject(template.preview)
    ? { layout: template.preview.layout || "custom", summary: template.preview.summary || "" }
    : { layout: "custom", summary: "" };
  const dashboard = isPlainObject(template.dashboard)
    ? {
        name: typeof template.dashboard.name === "string" && template.dashboard.name ? template.dashboard.name : template.name || "Untitled",
        status: ["draft", "active", "archived"].includes(template.dashboard.status) ? template.dashboard.status : "draft"
      }
    : { name: template.name || "Untitled", status: "draft" };
  return {
    id: template.id,
    name: template.name,
    description: typeof template.description === "string" ? template.description : "",
    category: typeof template.category === "string" && template.category ? template.category : "custom",
    bestFor,
    tags,
    widgetCount: widgets.length,
    preview,
    dashboard,
    widgets
  };
}

function validateWorkspaceTemplate(template) {
  if (!isPlainObject(template)) {
    const error = new Error("workspace template must be a plain object");
    error.code = "INVALID_WORKSPACE_TEMPLATE";
    error.details = ["root must be a plain object"];
    throw error;
  }
  const errors = [];
  if (typeof template.id !== "string" || !template.id) errors.push("template.id must be a non-empty string");
  if (typeof template.name !== "string" || !template.name) errors.push("template.name must be a non-empty string");
  if (template.description !== undefined && typeof template.description !== "string") {
    errors.push("template.description must be a string");
  }
  if (template.category !== undefined && typeof template.category !== "string") {
    errors.push("template.category must be a string");
  }
  if (template.bestFor !== undefined) validateStringArray(template.bestFor, "template.bestFor", errors);
  if (template.tags !== undefined) validateStringArray(template.tags, "template.tags", errors);
  if (template.preview !== undefined) {
    if (!isPlainObject(template.preview)) errors.push("template.preview must be a plain object");
  }
  if (template.dashboard !== undefined) {
    if (!isPlainObject(template.dashboard)) {
      errors.push("template.dashboard must be a plain object");
    } else {
      if (typeof template.dashboard.name !== "string" || !template.dashboard.name) {
        errors.push("template.dashboard.name must be a non-empty string");
      }
      if (template.dashboard.status !== undefined && !["draft", "active", "archived"].includes(template.dashboard.status)) {
        errors.push("template.dashboard.status must be draft, active, or archived");
      }
    }
  }
  if (template.widgets !== undefined) {
    validateTemplateWidgetArray(template.widgets, "template.widgets", errors);
  }
  if (errors.length) {
    const error = new Error(`invalid workspace template: ${errors.join("; ")}`);
    error.code = "INVALID_WORKSPACE_TEMPLATE";
    error.details = errors;
    throw error;
  }
}

function requireIdFactory(idFactory) {
  if (typeof idFactory !== "function") {
    const error = new Error("idFactory function is required to clone a template");
    error.code = "MISSING_TEMPLATE_ID_FACTORY";
    throw error;
  }
}

function cloneTemplateWidgets(template, idFactory) {
  const widgets = Array.isArray(template.widgets) ? template.widgets : [];
  return widgets.map((widget) => ({
    id: idFactory("widget"),
    kind: widget.kind,
    title: widget.title,
    position: { ...widget.position },
    config: widget.config !== undefined ? JSON.parse(JSON.stringify(widget.config)) : defaultConfigFor(widget.kind)
  }));
}

function cloneTemplateToTab(template, options = {}) {
  validateWorkspaceTemplate(template);
  requireIdFactory(options.idFactory);
  const widgets = cloneTemplateWidgets(template, options.idFactory);
  return {
    id: options.idFactory("tab"),
    name: typeof options.tabName === "string" && options.tabName ? options.tabName : template.name,
    widgets
  };
}

function cloneTemplateToDashboard(template, options = {}) {
  validateWorkspaceTemplate(template);
  requireIdFactory(options.idFactory);
  const tab = cloneTemplateToTab(template, { tabName: template.name, idFactory: options.idFactory });
  const baseDashboard = isPlainObject(template.dashboard) ? template.dashboard : {};
  return {
    dashboard: {
      id: options.idFactory("dashboard"),
      name: typeof options.dashboardName === "string" && options.dashboardName ? options.dashboardName : baseDashboard.name || template.name,
      createdBy: "Workspace owner",
      updatedAt: "new",
      status: ["draft", "active", "archived"].includes(baseDashboard.status) ? baseDashboard.status : "draft"
    },
    tab
  };
}

function unwrapWorkspaceTemplateImport(parsed) {
  if (!isPlainObject(parsed)) {
    const error = new Error("template import must be a plain object");
    error.code = "INVALID_WORKSPACE_TEMPLATE_IMPORT";
    throw error;
  }
  if (parsed.kind !== undefined && parsed.kind !== WORKSPACE_TEMPLATE_KIND) {
    const error = new Error(`unrecognized template kind: ${parsed.kind}`);
    error.code = "INVALID_WORKSPACE_TEMPLATE_IMPORT";
    throw error;
  }
  if (parsed.kind === WORKSPACE_TEMPLATE_KIND) {
    if (!isPlainObject(parsed.payload)) {
      const error = new Error("template import payload must be a plain object");
      error.code = "INVALID_WORKSPACE_TEMPLATE_IMPORT";
      throw error;
    }
    return parsed.payload;
  }
  return parsed;
}

function wrapWorkspaceTemplateExport(payload, metadata = {}) {
  return {
    version: WORKSPACE_TEMPLATE_VERSION,
    kind: WORKSPACE_TEMPLATE_KIND,
    exportedAt: new Date().toISOString(),
    source: WORKSPACE_TEMPLATE_SOURCE,
    name: typeof metadata.name === "string" && metadata.name ? metadata.name : "Workspace template",
    description: typeof metadata.description === "string" ? metadata.description : "",
    payload
  };
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
  if (nextConfig.dataModel !== undefined) validateDataModelConfig(nextConfig.dataModel, errors);
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
  KNOWN_AGGREGATIONS,
  KNOWN_CHART_TYPES,
  KNOWN_DATA_BINDING_MODES,
  KNOWN_FIELDS,
  KNOWN_FILTER_CONJUNCTIONS,
  KNOWN_FILTER_OPERATORS,
  KNOWN_SORT_DIRECTIONS,
  KNOWN_WIDGET_KINDS,
  NORMALIZED_OBJECT_FIELD_IDS,
  SAMPLE_DATA_BINDINGS,
  SAMPLE_VIEW_ROWS,
  WIDGET_SCHEMA_CONTRACTS,
  WORKSPACE_TEMPLATE_KIND,
  WORKSPACE_TEMPLATE_SOURCE,
  WORKSPACE_TEMPLATE_VERSION,
  cloneTemplateToDashboard,
  cloneTemplateToTab,
  defaultConfigFor,
  normalizeWorkspaceTemplate,
  unwrapWorkspaceTemplateImport,
  validateTemplateWidgetArray,
  validateWorkspaceConfig,
  validateWorkspaceTemplate,
  wrapWorkspaceTemplateExport
};
