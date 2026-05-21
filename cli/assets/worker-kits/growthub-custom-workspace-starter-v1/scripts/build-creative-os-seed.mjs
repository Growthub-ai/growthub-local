/**
 * One-shot builder for Creative OS starter seed in apps/workspace/growthub.config.json.
 * Run: node scripts/build-creative-os-seed.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateWorkspaceConfig } from "../apps/workspace/lib/workspace-schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "../apps/workspace/growthub.config.json");

function view(id, name, columns, { hidden = [], sort = [], filter, favorite = false } = {}) {
  const base = { id, name, hidden, order: columns, sort, favorite, locked: false };
  if (filter) base.filter = filter;
  return base;
}

function dmBinding(label) {
  return { mode: "manual", source: label };
}

function widgetBinding(objectId, label) {
  return {
    mode: "manual",
    source: label,
    sourceType: "workspace-data-model",
    sourceAuthority: "workspace-config",
    objectId,
  };
}

const clientsColumns = ["Name", "Type", "Status", "Owner", "Industry", "ARR", "Notes"];
const campaignsColumns = ["Name", "Client", "Status", "Channel", "LaunchDate", "Budget", "Owner"];
const tasksColumns = ["Name", "Status", "DueDate", "Assignee", "Priority"];
const assetsColumns = ["Name", "Type", "Campaign", "Status", "Format", "Owner", "URL"];
const metricsColumns = [
  "Name",
  "Campaign",
  "Channel",
  "Period",
  "Impressions",
  "Clicks",
  "Conversions",
  "Spend",
  "ROAS",
];
const reportsColumns = ["Name", "Type", "Client", "Date", "Owner", "Status", "Summary"];

const config = {
  id: "workspace-creative-os-starter",
  name: "Creative OS Workspace",
  description:
    "Governed Creative OS starter workspace with seeded clients, campaigns, production tasks, assets, performance metrics, reports, folders, and a command-center dashboard.",
  branding: {
    name: "Creative OS",
    logoUrl: "",
    accent: "#3f68ff",
  },
  capabilities: ["dashboards", "canvas", "widgets", "bindings", "integrations", "settings"],
  pipelines: [],
  integrations: [],
  dashboards: [
    {
      id: "creative-os-command-center",
      name: "Creative OS Command Center",
      createdBy: "Workspace owner",
      updatedAt: "seeded",
      status: "active",
      activeTabId: "tab-command-center",
      tabs: [
        {
          id: "tab-command-center",
          name: "Overview",
          widgets: [
            {
              id: "widget-welcome-creative-os",
              kind: "rich-text",
              title: "Welcome to Creative OS",
              position: { x: 0, y: 0, w: 12, h: 2 },
              config: {
                text: "## Welcome to Creative OS\n\nThis workspace is seeded with governed business objects for clients, campaigns, production, assets, performance, and decisions. Use the sidebar folders to navigate, or open **Data Model** to customize the substrate.",
                binding: { mode: "manual", source: "", rows: [] },
              },
            },
            {
              id: "widget-campaigns-overview",
              kind: "view",
              title: "Active Campaigns",
              position: { x: 0, y: 2, w: 6, h: 5 },
              config: {
                source: "Campaigns",
                layout: "Table",
                columns: campaignsColumns,
                rows: [],
                binding: widgetBinding("campaigns", "Campaigns"),
                fieldSettings: { hidden: [], order: campaignsColumns },
              },
            },
            {
              id: "widget-production-overview",
              kind: "view",
              title: "Production Tasks",
              position: { x: 6, y: 2, w: 6, h: 5 },
              config: {
                source: "Production Tasks",
                layout: "Table",
                columns: tasksColumns,
                rows: [],
                binding: widgetBinding("production-tasks", "Production Tasks"),
                fieldSettings: { hidden: [], order: tasksColumns },
              },
            },
          ],
        },
      ],
    },
  ],
  widgetTypes: [
    { kind: "chart", label: "Chart", icon: "C" },
    { kind: "view", label: "View", icon: "V" },
    { kind: "iframe", label: "iFrame", icon: "I" },
    { kind: "rich-text", label: "Rich Text", icon: "T" },
  ],
  canvas: {
    id: "workspace-canvas",
    name: "Tab 1",
    scope: "workspace",
    layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
    widgets: [],
    bindings: {
      chatToCanvas: true,
      workflowOutputsToArtifacts: true,
      sessionContext: true,
      configDrivenCanvas: true,
    },
  },
  provenance: {
    createdBy: "cli",
    mirrors: "growthub-custom-workspace-starter-v1",
    note: "Shipped with growthub-custom-workspace-starter-v1 Creative OS seed (CREATIVE_OS_STARTER_SEED_V1).",
  },
  dataModel: {
    objects: [
      {
        id: "clients",
        label: "Clients",
        source: "Clients",
        objectType: "custom",
        icon: "Building2",
        columns: clientsColumns,
        rows: [
          {
            Name: "Northwind Studio",
            Type: "Retainer",
            Status: "Active Retainer",
            Owner: "Alex Morgan",
            Industry: "SaaS",
            ARR: "$240,000",
            Notes: "Q3 brand refresh in planning.",
          },
          {
            Name: "Brightline Health",
            Type: "Project",
            Status: "Active Project",
            Owner: "Jordan Lee",
            Industry: "Healthcare",
            ARR: "$85,000",
            Notes: "Performance reporting due monthly.",
          },
          {
            Name: "Summit Outdoor",
            Type: "Retainer",
            Status: "Prospect",
            Owner: "Alex Morgan",
            Industry: "Retail",
            ARR: "$0",
            Notes: "Awaiting signed SOW.",
          },
        ],
        binding: dmBinding("Clients"),
        fieldSettings: {
          hidden: [],
          order: clientsColumns,
          types: {
            Name: "text",
            Type: "select",
            Status: "select",
            Owner: "text",
            Industry: "text",
            ARR: "text",
            Notes: "text",
          },
          activeViewId: "clients-all",
          favorite: true,
          views: [
            view("clients-all", "All Clients", clientsColumns, { favorite: true }),
            view("clients-retainers", "Active Retainers", clientsColumns, {
              filter: {
                op: "and",
                clauses: [{ fieldId: "Status", operator: "eq", value: "Active Retainer" }],
              },
            }),
            view("clients-enterprise", "Enterprise / High Priority", clientsColumns, {
              filter: {
                op: "and",
                clauses: [{ fieldId: "ARR", operator: "contains", value: "$" }],
              },
            }),
          ],
        },
      },
      {
        id: "campaigns",
        label: "Campaigns",
        source: "Campaigns",
        objectType: "custom",
        icon: "Megaphone",
        columns: campaignsColumns,
        rows: [
          {
            Name: "Spring Launch 2026",
            Client: "Northwind Studio",
            Status: "Active",
            Channel: "Paid Social",
            LaunchDate: "2026-03-15",
            Budget: "$45,000",
            Owner: "Jordan Lee",
          },
          {
            Name: "Patient Stories Q2",
            Client: "Brightline Health",
            Status: "In Review",
            Channel: "Video",
            LaunchDate: "2026-04-01",
            Budget: "$28,000",
            Owner: "Alex Morgan",
          },
          {
            Name: "Trail Season Teaser",
            Client: "Summit Outdoor",
            Status: "Planning",
            Channel: "Organic",
            LaunchDate: "2026-05-10",
            Budget: "$12,000",
            Owner: "Jordan Lee",
          },
        ],
        binding: dmBinding("Campaigns"),
        fieldSettings: {
          hidden: [],
          order: campaignsColumns,
          activeViewId: "campaigns-active",
          favorite: true,
          views: [
            view("campaigns-active", "Active Campaigns", campaignsColumns, {
              filter: {
                op: "and",
                clauses: [{ fieldId: "Status", operator: "eq", value: "Active" }],
              },
              favorite: true,
            }),
            view("campaigns-launch-queue", "Launch Queue", campaignsColumns, {
              sort: [{ fieldId: "LaunchDate", direction: "asc" }],
            }),
            view("campaigns-recent", "Recently Updated", campaignsColumns, {
              sort: [{ fieldId: "Name", direction: "asc" }],
            }),
          ],
        },
      },
      {
        id: "production-tasks",
        label: "Production Tasks",
        source: "Production Tasks",
        objectType: "tasks",
        icon: "CheckSquare",
        columns: tasksColumns,
        rows: [
          {
            Name: "Hero video rough cut",
            Status: "In Progress",
            DueDate: "2026-03-20",
            Assignee: "Sam Rivera",
            Priority: "High",
          },
          {
            Name: "Paid social asset resize",
            Status: "Blocked",
            DueDate: "2026-03-18",
            Assignee: "Casey Park",
            Priority: "Medium",
          },
          {
            Name: "Landing page copy review",
            Status: "To Do",
            DueDate: "2026-03-22",
            Assignee: "Alex Morgan",
            Priority: "High",
          },
        ],
        binding: dmBinding("Production Tasks"),
        fieldSettings: {
          hidden: [],
          order: tasksColumns,
          activeViewId: "tasks-active",
          favorite: true,
          views: [
            view("tasks-active", "Active Tasks", tasksColumns, {
              filter: {
                op: "or",
                clauses: [
                  { fieldId: "Status", operator: "eq", value: "In Progress" },
                  { fieldId: "Status", operator: "eq", value: "To Do" },
                ],
              },
              favorite: true,
            }),
            view("tasks-blocked", "Blocked", tasksColumns, {
              filter: {
                op: "and",
                clauses: [{ fieldId: "Status", operator: "eq", value: "Blocked" }],
              },
            }),
            view("tasks-due-week", "Due This Week", tasksColumns, {
              sort: [{ fieldId: "DueDate", direction: "asc" }],
            }),
          ],
        },
      },
      {
        id: "creative-assets",
        label: "Creative Assets",
        source: "Creative Assets",
        objectType: "custom",
        icon: "Image",
        columns: assetsColumns,
        rows: [
          {
            Name: "Spring Launch Hero",
            Type: "Video",
            Campaign: "Spring Launch 2026",
            Status: "Needs Review",
            Format: "16:9",
            Owner: "Sam Rivera",
            URL: "https://example.com/assets/spring-hero",
          },
          {
            Name: "Patient Story Cut 1",
            Type: "Video",
            Campaign: "Patient Stories Q2",
            Status: "Approved",
            Format: "9:16",
            Owner: "Casey Park",
            URL: "https://example.com/assets/patient-story-1",
          },
          {
            Name: "Trail Teaser Still",
            Type: "Image",
            Campaign: "Trail Season Teaser",
            Status: "Draft",
            Format: "1:1",
            Owner: "Jordan Lee",
            URL: "https://example.com/assets/trail-still",
          },
        ],
        binding: dmBinding("Creative Assets"),
        fieldSettings: {
          hidden: [],
          order: assetsColumns,
          activeViewId: "assets-library",
          favorite: true,
          views: [
            view("assets-library", "Asset Library", assetsColumns, { favorite: true }),
            view("assets-needs-review", "Needs Review", assetsColumns, {
              filter: {
                op: "and",
                clauses: [{ fieldId: "Status", operator: "eq", value: "Needs Review" }],
              },
            }),
            view("assets-approved", "Approved", assetsColumns, {
              filter: {
                op: "and",
                clauses: [{ fieldId: "Status", operator: "eq", value: "Approved" }],
              },
            }),
          ],
        },
      },
      {
        id: "performance-metrics",
        label: "Performance Metrics",
        source: "Performance Metrics",
        objectType: "custom",
        icon: "LineChart",
        columns: metricsColumns,
        rows: [
          {
            Name: "Spring Launch — Week 1",
            Campaign: "Spring Launch 2026",
            Channel: "Paid Social",
            Period: "2026-03-10",
            Impressions: "420000",
            Clicks: "12600",
            Conversions: "840",
            Spend: "$8,200",
            ROAS: "3.2",
          },
          {
            Name: "Patient Stories — Preview",
            Campaign: "Patient Stories Q2",
            Channel: "Video",
            Period: "2026-03-08",
            Impressions: "98000",
            Clicks: "4100",
            Conversions: "210",
            Spend: "$2,400",
            ROAS: "2.1",
          },
        ],
        binding: dmBinding("Performance Metrics"),
        fieldSettings: {
          hidden: [],
          order: metricsColumns,
          activeViewId: "metrics-latest",
          favorite: true,
          views: [
            view("metrics-latest", "Latest Metrics", metricsColumns, {
              sort: [{ fieldId: "Period", direction: "desc" }],
              favorite: true,
            }),
            view("metrics-by-channel", "By Channel", metricsColumns, {
              sort: [{ fieldId: "Channel", direction: "asc" }],
            }),
            view("metrics-needs-analysis", "Needs Analysis", metricsColumns, {
              filter: {
                op: "and",
                clauses: [{ fieldId: "ROAS", operator: "lt", value: "2.5" }],
              },
            }),
          ],
        },
      },
      {
        id: "reports-decisions",
        label: "Reports & Decisions",
        source: "Reports & Decisions",
        objectType: "custom",
        icon: "FileText",
        columns: reportsColumns,
        rows: [
          {
            Name: "Northwind Q1 Performance",
            Type: "Client Report",
            Client: "Northwind Studio",
            Date: "2026-03-01",
            Owner: "Jordan Lee",
            Status: "Sent",
            Summary: "ROAS up 18% vs prior quarter; recommend scaling paid social.",
          },
          {
            Name: "Approve Spring Launch budget shift",
            Type: "Decision",
            Client: "Northwind Studio",
            Date: "2026-03-12",
            Owner: "Alex Morgan",
            Status: "Open",
            Summary: "Move $5k from organic to paid social for launch week.",
          },
          {
            Name: "Brightline compliance review",
            Type: "Follow-up",
            Client: "Brightline Health",
            Date: "2026-03-14",
            Owner: "Casey Park",
            Status: "Open",
            Summary: "Legal sign-off needed before publishing patient story cut.",
          },
        ],
        binding: dmBinding("Reports & Decisions"),
        fieldSettings: {
          hidden: [],
          order: reportsColumns,
          activeViewId: "reports-client",
          favorite: true,
          views: [
            view("reports-client", "Client Reports", reportsColumns, {
              filter: {
                op: "and",
                clauses: [{ fieldId: "Type", operator: "eq", value: "Client Report" }],
              },
              favorite: true,
            }),
            view("reports-decisions-log", "Decisions Log", reportsColumns, {
              filter: {
                op: "and",
                clauses: [{ fieldId: "Type", operator: "eq", value: "Decision" }],
              },
            }),
            view("reports-followups", "Open Follow-ups", reportsColumns, {
              filter: {
                op: "and",
                clauses: [{ fieldId: "Status", operator: "eq", value: "Open" }],
              },
            }),
          ],
        },
      },
      {
        id: "nav-folders",
        label: "Custom Folders",
        source: "Custom Folders",
        objectType: "custom",
        icon: "Folder",
        columns: ["name", "order", "collapsed", "items"],
        rows: [
          {
            id: "folder-overview",
            name: "Overview",
            order: 0,
            collapsed: false,
            icon: "LayoutDashboard",
            color: "#3b82f6",
            iconBg: "#eff6ff",
            items: [
              {
                id: "item-command-center",
                type: "dashboard",
                refId: "creative-os-command-center",
                label: "Creative OS Command Center",
                icon: "LayoutDashboard",
                color: "#3b82f6",
                iconBg: "#eff6ff",
              },
              {
                id: "item-clients",
                type: "view",
                objectId: "clients",
                label: "Clients",
                icon: "Building2",
                color: "#8b5cf6",
                iconBg: "#f5f3ff",
              },
            ],
          },
          {
            id: "folder-creative-production",
            name: "Creative Production",
            order: 1,
            collapsed: false,
            icon: "Folder",
            color: "#f97316",
            iconBg: "#fff7ed",
            items: [
              {
                id: "item-production-tasks",
                type: "view",
                objectId: "production-tasks",
                label: "Production Tasks",
                icon: "CheckSquare",
                color: "#14b8a6",
                iconBg: "#f0fdfa",
              },
            ],
          },
          {
            id: "folder-campaigns",
            name: "Campaigns",
            order: 2,
            collapsed: false,
            icon: "Megaphone",
            color: "#ec4899",
            iconBg: "#fdf2f8",
            items: [
              {
                id: "item-campaigns",
                type: "view",
                objectId: "campaigns",
                label: "Campaigns",
                icon: "Megaphone",
                color: "#ec4899",
                iconBg: "#fdf2f8",
              },
            ],
          },
          {
            id: "folder-assets",
            name: "Assets",
            order: 3,
            collapsed: false,
            icon: "Image",
            color: "#14b8a6",
            iconBg: "#f0fdfa",
            items: [
              {
                id: "item-creative-assets",
                type: "view",
                objectId: "creative-assets",
                label: "Creative Assets",
                icon: "Image",
                color: "#14b8a6",
                iconBg: "#f0fdfa",
              },
            ],
          },
          {
            id: "folder-performance",
            name: "Performance",
            order: 4,
            collapsed: false,
            icon: "LineChart",
            color: "#64748b",
            iconBg: "#f8fafc",
            items: [
              {
                id: "item-performance-metrics",
                type: "view",
                objectId: "performance-metrics",
                label: "Performance Metrics",
                icon: "LineChart",
                color: "#64748b",
                iconBg: "#f8fafc",
              },
            ],
          },
          {
            id: "folder-reports-decisions",
            name: "Reports & Decisions",
            order: 5,
            collapsed: false,
            icon: "FileText",
            color: "#8b5cf6",
            iconBg: "#f5f3ff",
            items: [
              {
                id: "item-reports-decisions",
                type: "view",
                objectId: "reports-decisions",
                label: "Reports & Decisions",
                icon: "FileText",
                color: "#8b5cf6",
                iconBg: "#f5f3ff",
              },
            ],
          },
        ],
        binding: dmBinding("Custom Folders"),
      },
    ],
  },
};

const patchFragment = {
  dashboards: config.dashboards,
  widgetTypes: config.widgetTypes,
  canvas: config.canvas,
  dataModel: config.dataModel,
};

try {
  validateWorkspaceConfig(patchFragment);
  console.log("validateWorkspaceConfig (PATCH allowlist): ok");
} catch (err) {
  console.error("validateWorkspaceConfig failed:");
  console.error(err?.details || err?.message || err);
  process.exit(1);
}

fs.writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);
