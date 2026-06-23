/**
 * growthub-custom-workspace-starter-v1 — governance and primitive contract tests.
 *
 * Test philosophy (per AGENTS.md production standard):
 *
 *   Negative probes matter more than positive ones.
 *   The worst failure in a governed workspace builder is invalid config
 *   silently persisting. Every negative probe here proves the schema layer
 *   is authoritative — not advisory.
 *
 * Coverage:
 *   1. Kit catalog registration (CLI-layer exports)
 *   2. Workspace schema — negative governance probes (invalid configs → errors)
 *   3. Workspace schema — positive probes (valid configs validate cleanly)
 *   4. New file presence: refresh-sources route, source-resolver-registry,
 *      resolver-loader, test-source route, register-resolver route,
 *      resolvers listing route, resolvers README
 *   5. kit.json frozen asset paths include all new primitives
 *   6. Source-resolver-registry module contract
 *   7. Workspace-config source records API
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach } from "vitest";

import { BUNDLED_KIT_CATALOG } from "../kits/catalog.js";
import {
  inspectBundledKit,
  listBundledKits,
  validateBundledKitAssetRoot,
} from "../kits/service.js";

const KIT_ID = "growthub-custom-workspace-starter-v1";

const KIT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  `../../assets/worker-kits/${KIT_ID}`,
);

const APP_ROOT = path.join(KIT_ROOT, "apps/workspace");

function readText(relative: string): string {
  return fs.readFileSync(path.join(KIT_ROOT, relative), "utf8");
}

function appText(relative: string): string {
  return fs.readFileSync(path.join(APP_ROOT, relative), "utf8");
}

function appExists(relative: string): boolean {
  return fs.existsSync(path.join(APP_ROOT, relative));
}

// ---------------------------------------------------------------------------
// 1. Kit catalog registration
// ---------------------------------------------------------------------------

describe("growthub-custom-workspace-starter-v1 — catalog registration", () => {
  it("is registered in the bundled kit catalog", () => {
    const entry = BUNDLED_KIT_CATALOG.find((k) => k.id === KIT_ID);
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({
      id: KIT_ID,
      type: "worker",
      executionMode: "export",
      family: "studio",
    });
  });

  it("is surfaced by listBundledKits", () => {
    const kit = listBundledKits().find((k) => k.id === KIT_ID);
    expect(kit).toBeDefined();
    expect(kit?.type).toBe("worker");
    expect(kit?.executionMode).toBe("export");
  });

  it("inspects with the expected required paths", () => {
    const info = inspectBundledKit(KIT_ID);
    expect(info.family).toBe("studio");
    expect(info.requiredPaths).toContain("apps/workspace");
  });

  it("passes bundled asset validation", () => {
    expect(() =>
      validateBundledKitAssetRoot(KIT_ROOT, { kitId: KIT_ID }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. Workspace schema — negative governance probes
// ---------------------------------------------------------------------------

describe("workspace-schema — negative governance (invalid configs must throw)", () => {
  // Dynamically import the schema module from the kit source tree.
  // Each test calls validateWorkspaceConfig with deliberately broken input
  // and asserts both the error code and that .details[] is populated.

  let validateWorkspaceConfig: (config: unknown) => void;

  beforeEach(async () => {
    const schemaPath = path.join(APP_ROOT, "lib/workspace-schema.js");
    const mod = await import(`file://${schemaPath}`) as { validateWorkspaceConfig: (c: unknown) => void };
    validateWorkspaceConfig = mod.validateWorkspaceConfig;
  });

  it("unknown top-level field → INVALID_WORKSPACE_CONFIG", () => {
    expect(() =>
      validateWorkspaceConfig({ secretToken: "x" } as never)
    ).toThrow(expect.objectContaining({ code: "INVALID_WORKSPACE_CONFIG" }));
  });

  it("off-grid widget (x + w > 12) → error detail mentions x/w", () => {
    let err: Error & { details?: string[] } | null = null;
    try {
      validateWorkspaceConfig({
        canvas: {
          layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
          widgets: [
            { id: "w1", kind: "chart", title: "T",
              position: { x: 8, w: 6, y: 0, h: 3 },
              config: { values: [1] } },
          ],
        },
      });
    } catch (e) { err = e as typeof err; }
    expect(err).not.toBeNull();
    expect(err!.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(err!.details!.some((d) => d.includes("x/w out of"))).toBe(true);
  });

  it("widget overlap → error detail mentions grid cell coordinates", () => {
    let err: Error & { details?: string[] } | null = null;
    try {
      validateWorkspaceConfig({
        canvas: {
          layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
          widgets: [
            { id: "w1", kind: "chart", title: "A", position: { x: 0, w: 4, y: 0, h: 3 }, config: { values: [1] } },
            { id: "w2", kind: "chart", title: "B", position: { x: 2, w: 4, y: 0, h: 3 }, config: { values: [2] } },
          ],
        },
      });
    } catch (e) { err = e as typeof err; }
    expect(err!.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(err!.details!.some((d) => d.includes("at grid cell"))).toBe(true);
  });

  it("duplicate widget ID → error detail mentions duplicates", () => {
    let err: Error & { details?: string[] } | null = null;
    try {
      validateWorkspaceConfig({
        canvas: {
          layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
          widgets: [
            { id: "dup", kind: "chart", title: "A", position: { x: 0, w: 4, y: 0, h: 3 }, config: { values: [1] } },
            { id: "dup", kind: "chart", title: "B", position: { x: 4, w: 4, y: 0, h: 3 }, config: { values: [2] } },
          ],
        },
      });
    } catch (e) { err = e as typeof err; }
    expect(err!.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(err!.details!.some((d) => d.includes("duplicates an earlier widget id"))).toBe(true);
  });

  it("invalid activeTabId (no matching tab) → error detail mentions activeTabId", () => {
    let err: Error & { details?: string[] } | null = null;
    try {
      validateWorkspaceConfig({
        canvas: {
          layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
          tabs: [{ id: "t1", name: "Tab 1", widgets: [] }],
          activeTabId: "ghost-tab",
        },
      });
    } catch (e) { err = e as typeof err; }
    expect(err!.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(err!.details!.some((d) => d.includes("activeTabId"))).toBe(true);
  });

  it("sourceStorage with invalid value → must be workspace-source-records", () => {
    let err: Error & { details?: string[] } | null = null;
    try {
      validateWorkspaceConfig({
        dataModel: {
          objects: [{
            id: "o1", label: "Test", columns: ["a"], rows: [],
            binding: { mode: "manual", source: "x", sourceStorage: "not-valid" },
          }],
        },
      });
    } catch (e) { err = e as typeof err; }
    expect(err!.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(err!.details!.some((d) => d.includes("workspace-source-records"))).toBe(true);
  });

  it("sourceStorage set without sourceId → sourceId is required", () => {
    let err: Error & { details?: string[] } | null = null;
    try {
      validateWorkspaceConfig({
        dataModel: {
          objects: [{
            id: "o1", label: "Test", columns: ["a"], rows: [],
            binding: { mode: "manual", source: "x", sourceStorage: "workspace-source-records" },
          }],
        },
      });
    } catch (e) { err = e as typeof err; }
    expect(err!.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(err!.details!.some((d) => d.includes("sourceId is required"))).toBe(true);
  });

  it("duplicate dataModel object ID → error detail mentions duplicate", () => {
    let err: Error & { details?: string[] } | null = null;
    try {
      validateWorkspaceConfig({
        dataModel: {
          objects: [
            { id: "same", label: "A", columns: ["x"], rows: [] },
            { id: "same", label: "B", columns: ["y"], rows: [] },
          ],
        },
      });
    } catch (e) { err = e as typeof err; }
    expect(err!.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(err!.details!.some((d) => d.includes("duplicates an earlier object id"))).toBe(true);
  });

  it("sandbox row with forbidden auth secret field (e.g. accessToken) → rejected", () => {
    let err: Error & { details?: string[] } | null = null;
    try {
      validateWorkspaceConfig({
        dataModel: {
          objects: [
            {
              id: "sandboxes",
              objectType: "sandbox-environment",
              label: "Sandboxes",
              columns: ["Name", "adapter", "agentHost"],
              rows: [
                {
                  Name: "naughty",
                  adapter: "local-agent-host",
                  agentHost: "claude_local",
                  runLocality: "local",
                  accessToken: "sk-ant-secret-leak"
                }
              ]
            }
          ]
        }
      });
    } catch (e) { err = e as typeof err; }
    expect(err).not.toBeNull();
    expect(err!.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(err!.details!.some((d) => d.includes("accessToken is not allowed"))).toBe(true);
  });

  it("sandbox row with invalid agentAuthStatus → rejected", () => {
    let err: Error & { details?: string[] } | null = null;
    try {
      validateWorkspaceConfig({
        dataModel: {
          objects: [
            {
              id: "sandboxes",
              objectType: "sandbox-environment",
              label: "Sandboxes",
              columns: ["Name"],
              rows: [
                {
                  Name: "row",
                  adapter: "local-agent-host",
                  agentHost: "claude_local",
                  runLocality: "local",
                  agentAuthStatus: "totally-made-up"
                }
              ]
            }
          ]
        }
      });
    } catch (e) { err = e as typeof err; }
    expect(err).not.toBeNull();
    expect(err!.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(err!.details!.some((d) => d.includes("agentAuthStatus must be one of"))).toBe(true);
  });

  it("sandbox row with `reachable` agentAuthStatus is accepted (new V1 value)", () => {
    expect(() =>
      validateWorkspaceConfig({
        dataModel: {
          objects: [
            {
              id: "sandboxes",
              objectType: "sandbox-environment",
              label: "Sandboxes",
              columns: ["Name"],
              rows: [
                {
                  Name: "row",
                  adapter: "local-agent-host",
                  agentHost: "claude_local",
                  runLocality: "local",
                  agentAuthStatus: "reachable",
                  agentAuthProvider: "claude_local",
                  agentAuthLastChecked: "2026-05-22T19:24:08.412Z",
                  agentAuthLastExitCode: 0,
                  agentAuthLastMessage: "Claude Code (local) reachable. Auth will be verified on next login or sandbox run.",
                  agentAuthLastLoginUrl: ""
                }
              ]
            }
          ]
        }
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. Workspace schema — positive probes
// ---------------------------------------------------------------------------

describe("workspace-schema — positive probes (valid configs pass cleanly)", () => {
  let validateWorkspaceConfig: (config: unknown) => void;

  beforeEach(async () => {
    const schemaPath = path.join(APP_ROOT, "lib/workspace-schema.js");
    const mod = await import(`file://${schemaPath}`) as { validateWorkspaceConfig: (c: unknown) => void };
    validateWorkspaceConfig = mod.validateWorkspaceConfig;
  });

  it("valid single-tab canvas with chart + view widgets passes", () => {
    expect(() =>
      validateWorkspaceConfig({
        canvas: {
          layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
          widgets: [
            { id: "wc", kind: "chart", title: "Revenue",
              position: { x: 0, y: 0, w: 6, h: 5 },
              config: { values: [42, 18, 7], binding: { mode: "json", source: "S", json: "[]" } } },
            { id: "wv", kind: "view", title: "Companies",
              position: { x: 6, y: 0, w: 6, h: 5 },
              config: { source: "Companies", layout: "Table", columns: ["Name"], rows: [] } },
          ],
        },
      })
    ).not.toThrow();
  });

  it("valid multi-tab canvas passes", () => {
    expect(() =>
      validateWorkspaceConfig({
        canvas: {
          layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
          tabs: [
            { id: "tab_A", name: "Internal Dashboard", widgets: [] },
            { id: "tab_B", name: "Tab 2", widgets: [] },
          ],
          activeTabId: "tab_A",
        },
      })
    ).not.toThrow();
  });

  it("valid live-source binding with sourceStorage + sourceId passes", () => {
    expect(() =>
      validateWorkspaceConfig({
        dataModel: {
          objects: [{
            id: "src_crm",
            label: "CRM Records",
            sourceId: "src_crm",
            columns: ["name", "status"],
            rows: [],
            binding: {
              mode: "integration",
              source: "my-crm",
              sourceStorage: "workspace-source-records",
              sourceId: "src_crm",
              integrationId: "my-crm",
            },
          }],
        },
      })
    ).not.toThrow();
  });

  it("empty dashboards + empty canvas passes", () => {
    expect(() =>
      validateWorkspaceConfig({
        dashboards: [],
        canvas: {
          layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
          widgets: [],
        },
      })
    ).not.toThrow();
  });

  it("nav-folders governed object with workflow shortcut items passes", () => {
    expect(() =>
      validateWorkspaceConfig({
        dataModel: {
          objects: [{
            id: "nav-folders",
            label: "Custom Folders",
            objectType: "custom",
            columns: ["name", "order", "collapsed", "items"],
            rows: [
              {
                id: "fld_ops",
                name: "Operations",
                order: 0,
                collapsed: false,
                items: [
                  {
                    id: "item_wf",
                    type: "workflow",
                    objectId: "sandbox-environments",
                    rowId: "LeadShark Tool",
                    fieldName: "orchestrationGraph",
                    label: "LeadShark Tool",
                  },
                ],
              },
            ],
            binding: { mode: "manual", source: "Custom Folders" },
          }],
        },
      })
    ).not.toThrow();
  });

  it("nav-folders governed object with mixed dashboard + view items passes", () => {
    expect(() =>
      validateWorkspaceConfig({
        dataModel: {
          objects: [{
            id: "nav-folders",
            label: "Custom Folders",
            objectType: "custom",
            columns: ["name", "order", "collapsed", "items"],
            rows: [
              {
                id: "fld_sales",
                name: "Sales Pipeline",
                order: 0,
                collapsed: false,
                items: [
                  { id: "item_dash", type: "dashboard", refId: "dash_overview", label: "Pipeline Overview" },
                  {
                    id: "item_view",
                    type: "view",
                    objectId: "prospects",
                    label: "Active Prospects",
                    viewConfig: {
                      columns: ["name", "status"],
                      filters: [{ field: "status", op: "eq", value: "active" }],
                      sort: { field: "name", dir: "asc" },
                    },
                  },
                ],
              },
            ],
            binding: { mode: "manual", source: "Custom Folders" },
          }],
        },
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2b. Workspace schema — nav-folders negative probes
// ---------------------------------------------------------------------------

describe("workspace-schema — nav-folders governance (invalid rows must throw)", () => {
  let validateWorkspaceConfig: (config: unknown) => void;

  beforeEach(async () => {
    const schemaPath = path.join(APP_ROOT, "lib/workspace-schema.js");
    const mod = await import(`file://${schemaPath}`) as { validateWorkspaceConfig: (c: unknown) => void };
    validateWorkspaceConfig = mod.validateWorkspaceConfig;
  });

  function tryValidate(rows: unknown[]): { code?: string; details?: string[] } {
    try {
      validateWorkspaceConfig({
        dataModel: {
          objects: [{
            id: "nav-folders",
            label: "Custom Folders",
            objectType: "custom",
            columns: ["name", "order", "collapsed", "items"],
            rows: rows as Record<string, unknown>[],
          }],
        },
      });
    } catch (e) {
      const err = e as Error & { code?: string; details?: string[] };
      return { code: err.code, details: err.details };
    }
    return {};
  }

  it("folder with empty name → name must be non-empty", () => {
    const r = tryValidate([{ id: "fld_a", name: "", items: [] }]);
    expect(r.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(r.details!.some((d) => d.includes("name"))).toBe(true);
  });

  it("item with unknown type → must be dashboard|view|workflow", () => {
    const r = tryValidate([{ id: "fld_a", name: "Ops", items: [{ id: "x", type: "iframe" }] }]);
    expect(r.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(r.details!.some((d) => d.includes("type"))).toBe(true);
  });

  it("workflow item missing rowId → rowId required", () => {
    const r = tryValidate([{
      id: "fld_a",
      name: "Ops",
      items: [{ id: "x", type: "workflow", objectId: "sandbox-env" }],
    }]);
    expect(r.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(r.details!.some((d) => d.includes("rowId"))).toBe(true);
  });

  it("workflow item must not embed orchestrationGraph", () => {
    const r = tryValidate([{
      id: "fld_a",
      name: "Ops",
      items: [{
        id: "x",
        type: "workflow",
        objectId: "sandbox-env",
        rowId: "Tool A",
        orchestrationGraph: '{"nodes":[]}',
      }],
    }]);
    expect(r.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(r.details!.some((d) => d.includes("orchestrationGraph"))).toBe(true);
  });

  it("dashboard item missing refId → refId required", () => {
    const r = tryValidate([{ id: "fld_a", name: "Ops", items: [{ id: "x", type: "dashboard" }] }]);
    expect(r.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(r.details!.some((d) => d.includes("refId"))).toBe(true);
  });

  it("view item missing objectId → objectId required", () => {
    const r = tryValidate([{ id: "fld_a", name: "Ops", items: [{ id: "x", type: "view" }] }]);
    expect(r.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(r.details!.some((d) => d.includes("objectId"))).toBe(true);
  });

  it("folder with duplicate item ids in same folder → duplicates flagged", () => {
    const r = tryValidate([{
      id: "fld_a",
      name: "Ops",
      items: [
        { id: "same", type: "dashboard", refId: "d1" },
        { id: "same", type: "dashboard", refId: "d2" },
      ],
    }]);
    expect(r.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(r.details!.some((d) => d.includes("duplicates"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. New file presence — every upstream primitive must exist in the kit tree
// ---------------------------------------------------------------------------

describe("growthub-custom-workspace-starter-v1 — new upstream primitives present", () => {
  it("source-resolver-registry.js ships in lib/adapters/integrations/", () => {
    expect(appExists("lib/adapters/integrations/source-resolver-registry.js")).toBe(true);
  });

  it("resolver-loader.js ships in lib/adapters/integrations/", () => {
    expect(appExists("lib/adapters/integrations/resolver-loader.js")).toBe(true);
  });

  it("resolvers/ directory ships in lib/adapters/integrations/", () => {
    expect(fs.existsSync(path.join(APP_ROOT, "lib/adapters/integrations/resolvers"))).toBe(true);
  });

  it("resolvers/README.md ships with operator contract documentation", () => {
    expect(appExists("lib/adapters/integrations/resolvers/README.md")).toBe(true);
    const readme = appText("lib/adapters/integrations/resolvers/README.md");
    expect(readme).toContain("registerSourceResolver");
    expect(readme).toContain("fetchRecords");
    expect(readme.toLowerCase()).toContain("tokens stay server-side");
  });

  it("app/api/workspace/refresh-sources/route.js ships", () => {
    expect(appExists("app/api/workspace/refresh-sources/route.js")).toBe(true);
  });

  it("app/api/workspace/test-source/route.js ships", () => {
    expect(appExists("app/api/workspace/test-source/route.js")).toBe(true);
  });

  it("app/api/workspace/register-resolver/route.js ships", () => {
    expect(appExists("app/api/workspace/register-resolver/route.js")).toBe(true);
  });

  it("app/api/workspace/resolvers/route.js ships", () => {
    expect(appExists("app/api/workspace/resolvers/route.js")).toBe(true);
  });

  it("lib/workspace-chart-values.js ships with computeChartValuesFromRows", () => {
    expect(appExists("lib/workspace-chart-values.js")).toBe(true);
    const source = appText("lib/workspace-chart-values.js");
    expect(source).toContain("function computeChartValuesFromRows");
    expect(source).toMatch(/export\s*\{[^}]*computeChartValuesFromRows[^}]*\}/s);
  });

  it("lib/workspace-chart-values.js exports debug + hydration-state helpers", () => {
    const source = appText("lib/workspace-chart-values.js");
    expect(source).toContain("function computeChartProjectionDebug");
    expect(source).toContain("function deriveChartHydrationState");
    expect(source).toMatch(/export\s*\{[^}]*computeChartProjectionDebug[^}]*\}/s);
    expect(source).toMatch(/export\s*\{[^}]*deriveChartHydrationState[^}]*\}/s);
  });

  it("Chart Hydration Inspector is wired into the builder shell", () => {
    const builder = appText("app/workspace-builder.jsx");
    expect(builder).toContain("function ChartHydrationInspector");
    expect(builder).toContain("Inspect computation");
    expect(builder).toContain("Source preview");
    expect(builder).toContain("Final values");
    expect(builder).toContain("Save computed values");
    // The inspector is routed via the `hydration` inspector path the Chart
    // panel surfaces — `onSubPage("hydration")`.
    expect(builder).toContain('inspectorPath === "hydration"');
    expect(builder).toContain('onSubPage("hydration")');
  });

  it("Refresh source discovery resolves Data Model-bound live sources, not just direct bindings", () => {
    const builder = appText("app/workspace-builder.jsx");
    // The liveSourceIds resolver must inspect both direct bindings and bound
    // Data Model tables (so charts pointing at live-backed objects refresh).
    expect(builder).toContain("liveSourceIds = useMemo");
    expect(builder).toMatch(/binding\.sourceType === DATA_MODEL_SOURCE_TYPE[\s\S]{0,400}table\.liveSource/);
  });

  it("Refresh recompute marks widgets unsaved instead of silently auto-saving", () => {
    const builder = appText("app/workspace-builder.jsx");
    expect(builder).toContain("unsavedChartIds");
    expect(builder).toContain("setUnsavedChartIds");
    // Save semantics: clearing the unsaved set must only happen after a
    // successful persistWorkspaceConfig response.
    expect(builder).toMatch(/setUnsavedChartIds\(new Set\(\)\)/);
  });

  it("Chart sidecar surfaces Twenty-style operation labels in the Operation dropdown", () => {
    const builder = appText("app/workspace-builder.jsx");
    expect(builder).toContain("AGGREGATION_LABELS");
    expect(builder).toContain("countAll");
    expect(builder).toContain("countNotEmpty");
    expect(builder).toContain("countUnique");
    expect(builder).toContain("percentEmpty");
    // The select must write both operation (preferred) and aggregation
    // (legacy) so existing configs continue to round-trip.
    expect(builder).toMatch(/setYAxis\(\{\s*operation:[^,]+,\s*aggregation:/);
  });

  it("Source picker only surfaces a badge when it communicates real runtime state", () => {
    const builder = appText("app/workspace-builder.jsx");
    // The picker now suppresses Manual/API/Webhook badges and only renders
    // Live when the bound object is sidecar-hydrated.
    expect(builder).toContain("workspace-source-badge badge-live");
    expect(builder).toContain("showLiveBadge");
    expect(builder).not.toMatch(/aria-label=\{`Source type: \$\{badgeLabel\}`\}/);
  });

  it("Inspect computation surfaces as a single compact row in the chart panel", () => {
    const builder = appText("app/workspace-builder.jsx");
    // The verbose inline status block was collapsed into one row.
    expect(builder).toContain("Inspect computation");
    expect(builder).not.toContain("Computed values updated · Unsaved");
    expect(builder).not.toContain("Computed values are unsaved. Save persists them");
  });

  it("workspace-data-model attaches fieldMetadata and sourceBadge to tables", () => {
    const dm = appText("lib/workspace-data-model.js");
    expect(dm).toContain("function inferFieldType");
    expect(dm).toContain("function buildFieldMetadata");
    expect(dm).toContain("fieldMetadata: buildFieldMetadata");
    expect(dm).toContain("sourceBadge");
  });
});

describe("workspace-data-model — runtime field metadata inference", () => {
  type Table = {
    objectId?: string;
    columns: string[];
    rows: Record<string, unknown>[];
    sourceBadge?: string;
    fieldMetadata?: Array<{ id: string; type: string; isNumeric: boolean; isDate: boolean; isBoolean: boolean }>;
  };
  let listWorkspaceDataModelTables: (
    config: unknown,
    options?: { sourceRecords?: Record<string, unknown> }
  ) => Table[];

  beforeEach(async () => {
    const modPath = path.join(APP_ROOT, "lib/workspace-data-model.js");
    const mod = await import(`file://${modPath}?t=${Date.now()}`) as {
      listWorkspaceDataModelTables: typeof listWorkspaceDataModelTables;
    };
    listWorkspaceDataModelTables = mod.listWorkspaceDataModelTables;
  });

  it("infers numeric/text/date/boolean field types from rows when no hints exist", () => {
    const config = {
      dataModel: {
        objects: [{
          id: "opps",
          label: "Opportunities",
          columns: ["name", "arr", "won", "closeDate"],
          rows: [
            { name: "Acme", arr: 100, won: "true", closeDate: "2026-05-01" },
            { name: "Beta", arr: 250, won: "false", closeDate: "2026-05-15" },
            { name: "Gamma", arr: 75, won: "true", closeDate: "2026-06-01" },
          ],
          binding: { mode: "manual", source: "Opportunities" },
        }],
      },
    };
    const tables = listWorkspaceDataModelTables(config);
    const table = tables.find((t) => t.objectId === "opps");
    expect(table!.fieldMetadata).toBeDefined();
    const types = Object.fromEntries((table!.fieldMetadata || []).map((f) => [f.id, f.type]));
    expect(types.arr).toBe("number");
    expect(types.closeDate).toBe("date");
    expect(types.won).toBe("boolean");
    expect(types.name).toBe("text");
  });

  it("respects existing fieldSettings.types hints over inference", () => {
    const config = {
      dataModel: {
        objects: [{
          id: "opps",
          label: "Opportunities",
          columns: ["status"],
          rows: [{ status: "won" }, { status: "lost" }],
          fieldSettings: { types: { status: "select" }, order: ["status"] },
          binding: { mode: "manual", source: "Opportunities" },
        }],
      },
    };
    const tables = listWorkspaceDataModelTables(config);
    const meta = tables.find((t) => t.objectId === "opps")!.fieldMetadata!;
    expect(meta.find((f) => f.id === "status")!.type).toBe("select");
  });

  it("tags live-backed objects with sourceBadge === \"live\"", () => {
    const config = {
      dataModel: {
        objects: [{
          id: "src_crm",
          label: "CRM",
          objectType: "data-source",
          columns: ["name"],
          rows: [],
          binding: { mode: "integration", sourceStorage: "workspace-source-records", sourceId: "src_crm", integrationId: "my-crm" },
        }],
      },
    };
    const tables = listWorkspaceDataModelTables(config, { sourceRecords: { src_crm: { records: [{ name: "Acme" }], fetchedAt: "x", recordCount: 1 } } });
    expect(tables.find((t) => t.objectId === "src_crm")!.sourceBadge).toBe("live");
  });
});

describe("workspace-schema — chart config validates Twenty-style nested keys", () => {
  let validateWorkspaceConfig: (config: unknown) => void;

  beforeEach(async () => {
    const schemaPath = path.join(APP_ROOT, "lib/workspace-schema.js");
    const mod = await import(`file://${schemaPath}?t=${Date.now()}`) as { validateWorkspaceConfig: (c: unknown) => void };
    validateWorkspaceConfig = mod.validateWorkspaceConfig;
  });

  function chartConfig(extra: Record<string, unknown>) {
    return {
      canvas: {
        layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
        widgets: [{
          id: "w1", kind: "chart", title: "C",
          position: { x: 0, y: 0, w: 4, h: 4 },
          config: { values: [10, 20], ...extra },
        }],
      },
    };
  }

  it("accepts yAxis.operation = countNotEmpty", () => {
    expect(() => validateWorkspaceConfig(chartConfig({
      yAxis: { field: "Owner", operation: "countNotEmpty" },
    }))).not.toThrow();
  });

  it("accepts yAxis.cumulative + xAxis.dateGranularity", () => {
    expect(() => validateWorkspaceConfig(chartConfig({
      xAxis: { field: "createdAt", dateGranularity: "month" },
      yAxis: { field: "arr", operation: "sum", cumulative: true },
    }))).not.toThrow();
  });

  it("accepts style.legend / style.stacked / style.prefix / style.suffix", () => {
    expect(() => validateWorkspaceConfig(chartConfig({
      style: { legend: true, stacked: true, prefix: "$", suffix: "" },
    }))).not.toThrow();
  });

  it("rejects unknown operation values", () => {
    let err: Error & { code?: string } | null = null;
    try {
      validateWorkspaceConfig(chartConfig({ yAxis: { field: "x", operation: "bogus-op" } }));
    } catch (e) { err = e as typeof err; }
    expect(err?.code).toBe("INVALID_WORKSPACE_CONFIG");
  });

  it("rejects unknown date granularities", () => {
    let err: Error & { code?: string } | null = null;
    try {
      validateWorkspaceConfig(chartConfig({ xAxis: { field: "createdAt", dateGranularity: "century" } }));
    } catch (e) { err = e as typeof err; }
    expect(err?.code).toBe("INVALID_WORKSPACE_CONFIG");
  });
});

describe("workspace-helper — system prompt carries widget configuration rules", () => {
  it("buildStableSystemPrompt includes the verbatim widget configuration rules", () => {
    const helper = appText("lib/workspace-helper.js");
    expect(helper).toContain("When configuring dashboard widgets");
    expect(helper).toContain("Use Data Model objects as source authority.");
    expect(helper).toContain("Bind widgets by objectId and source metadata.");
    expect(helper).toContain("For charts, compute widget.config.values from rows.");
    expect(helper).toContain("Never copy source rows into chart widget config.");
    expect(helper).toContain("Never store secrets in widget config, Data Model rows, source records, browser state, localStorage, or exported templates.");
    expect(helper).toContain("Use source records for live-backed data.");
    expect(helper).toContain("Mark recomputed values as unsaved unless PATCH succeeds.");
  });
});

// ---------------------------------------------------------------------------
// 5. kit.json — frozen asset paths include all new primitives
// ---------------------------------------------------------------------------

describe("growthub-custom-workspace-starter-v1 — kit.json frozen asset coverage", () => {
  const kitJson = JSON.parse(readText("kit.json"));
  const frozen: string[] = kitJson.frozenAssetPaths ?? [];

  const requiredPaths = [
    "apps/workspace/app/api/workspace/refresh-sources/route.js",
    "apps/workspace/app/api/workspace/test-source/route.js",
    "apps/workspace/app/api/workspace/register-resolver/route.js",
    "apps/workspace/app/api/workspace/resolvers/route.js",
    "apps/workspace/lib/adapters/integrations/source-resolver-registry.js",
    "apps/workspace/lib/adapters/integrations/resolver-loader.js",
    "apps/workspace/lib/workspace-chart-values.js",
  ];

  for (const p of requiredPaths) {
    it(`frozen asset paths include: ${p}`, () => {
      expect(frozen).toContain(p);
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Source-resolver-registry module contract
// ---------------------------------------------------------------------------

describe("source-resolver-registry — module contract", () => {
  let registerSourceResolver: (r: unknown) => void;
  let getSourceResolver: (id: string) => unknown;
  let listRegisteredResolvers: () => string[];

  beforeEach(async () => {
    // Import fresh module instance to avoid cross-test registry pollution.
    const registryPath = path.join(APP_ROOT, "lib/adapters/integrations/source-resolver-registry.js");
    const mod = await import(`file://${registryPath}?t=${Date.now()}`) as {
      registerSourceResolver: typeof registerSourceResolver;
      getSourceResolver: typeof getSourceResolver;
      listRegisteredResolvers: typeof listRegisteredResolvers;
    };
    registerSourceResolver = mod.registerSourceResolver;
    getSourceResolver = mod.getSourceResolver;
    listRegisteredResolvers = mod.listRegisteredResolvers;
  });

  it("getSourceResolver returns null for unknown integrationId", () => {
    expect(getSourceResolver("no-such-integration")).toBeNull();
  });

  it("registerSourceResolver rejects resolver without integrationId", () => {
    expect(() =>
      registerSourceResolver({ fetchRecords: async () => [] })
    ).toThrow();
  });

  it("registerSourceResolver rejects resolver without fetchRecords function", () => {
    expect(() =>
      registerSourceResolver({ integrationId: "test-crm" })
    ).toThrow();
  });

  it("registered resolver is retrievable by integrationId", () => {
    registerSourceResolver({
      integrationId: "test-crm-probe",
      entityTypes: ["contacts"],
      listEntities: async () => [],
      fetchRecords: async () => [],
    });
    const r = getSourceResolver("test-crm-probe") as { integrationId: string };
    expect(r).not.toBeNull();
    expect(r.integrationId).toBe("test-crm-probe");
  });

  it("listRegisteredResolvers returns array", () => {
    expect(Array.isArray(listRegisteredResolvers())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. workspace-config — source records functions present in source
//
// workspace-config.js uses Next.js @/ path aliases which vitest cannot
// resolve without the full Next.js module graph. We verify the exports
// exist by inspecting the source text directly — the export list is the
// ground truth that the compiled app module will honour.
// ---------------------------------------------------------------------------

describe("workspace-config — source records functions declared", () => {
  const source = appText("lib/workspace-config.js");

  it("readWorkspaceSourceRecords is defined in source", () => {
    expect(source).toContain("async function readWorkspaceSourceRecords");
  });

  it("writeWorkspaceSourceRecords is defined in source", () => {
    expect(source).toContain("async function writeWorkspaceSourceRecords");
  });

  it("readWorkspaceSourceRecords is in the export list", () => {
    expect(source).toMatch(/export\s*\{[^}]*readWorkspaceSourceRecords[^}]*\}/s);
  });

  it("writeWorkspaceSourceRecords is in the export list", () => {
    expect(source).toMatch(/export\s*\{[^}]*writeWorkspaceSourceRecords[^}]*\}/s);
  });

  it("SOURCE_RECORDS_FILENAME declares the sidecar file name", () => {
    expect(source).toContain("growthub.source-records.json");
  });
});

// ---------------------------------------------------------------------------
// 8. API Registry → sandbox orchestration primitive
// ---------------------------------------------------------------------------

describe("orchestration-graph — contract and kit presence", () => {
  it("orchestration-graph.js ships in apps/workspace/lib/", () => {
    expect(appExists("lib/orchestration-graph.js")).toBe(true);
    expect(appExists("lib/orchestration-graph-runner.js")).toBe(true);
  });

  it("sidecar UI components ship", () => {
    expect(appExists("app/data-model/components/ApiRegistryActionCard.jsx")).toBe(true);
    expect(appExists("app/data-model/components/OrchestrationGraphCanvas.jsx")).toBe(true);
    expect(appExists("app/data-model/components/OrchestrationNodeConfigPanel.jsx")).toBe(true);
    expect(appExists("app/data-model/components/SandboxToolDraftPanel.jsx")).toBe(true);
    expect(appExists("app/data-model/components/SandboxToolConfirmModal.jsx")).toBe(true);
    expect(appExists("app/data-model/components/OrchestrationGraphEmptyCanvas.jsx")).toBe(true);
    expect(appExists("app/data-model/components/OrchestrationRunTracePanel.jsx")).toBe(true);
    expect(appExists("app/data-model/components/SandboxOrchestrationEditorPanel.jsx")).toBe(true);
    expect(appExists("lib/orchestration-run-trace.js")).toBe(true);
  });

  it("sandbox-environment preset includes orchestrationGraph column", () => {
    const dm = appText("lib/workspace-data-model.js");
    expect(dm).toContain('"orchestrationGraph"');
  });

  it("buildDefaultOrchestrationGraphFromRegistry validates", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-graph.js")}?t=${Date.now()}`
    ) as {
      buildDefaultOrchestrationGraphFromRegistry: (row: Record<string, string>) => unknown;
      validateOrchestrationGraph: (g: unknown) => { ok: boolean };
      buildSandboxRowFromApiRegistry: (
        cfg: { dataModel: { objects: unknown[] } },
        row: Record<string, string>,
        opts?: Record<string, unknown>
      ) => Record<string, string>;
    };
    const registryRow = {
      integrationId: "leadshark",
      Name: "LeadShark",
      method: "GET",
      endpoint: "/leads",
      authRef: "LEADSHARK",
      baseUrl: "https://api.example.com",
      status: "connected",
    };
    const graph = mod.buildDefaultOrchestrationGraphFromRegistry(registryRow);
    expect(mod.validateOrchestrationGraph(graph).ok).toBe(true);
    expect(graph.nodes).toHaveLength(4);
    expect(graph.nodes.map((n: { id: string }) => n.id)).toEqual([
      "input",
      "api-request",
      "transform",
      "result",
    ]);
    const sandboxRow = mod.buildSandboxRowFromApiRegistry(
      { dataModel: { objects: [] } },
      registryRow,
      { name: "LeadShark Leads Tool" }
    );
    expect(sandboxRow.Name).toBe("LeadShark Leads Tool");
    expect(String(sandboxRow.orchestrationGraph || "")).toContain("api-registry-call");
    expect(sandboxRow.status).toBe("untested");
  });

  it("invalid orchestrationGraph object fails validation", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-graph.js")}?t=${Date.now()}`
    ) as { validateOrchestrationGraph: (g: unknown) => { ok: boolean } };
    expect(mod.validateOrchestrationGraph({ version: 0, provider: "", nodes: [] }).ok).toBe(false);
  });

  it("ApiRegistryActionCard source gates Create sandbox tool by state", () => {
    const card = appText("app/data-model/components/ApiRegistryActionCard.jsx");
    expect(card).toContain("Complete API setup");
    expect(card).toContain("Test this API first");
    expect(card).toContain("API test failed");
    expect(card).toContain("Sandbox tool ready");
    expect(card).toContain("Test connection");
    expect(card).toContain("Retest");
    expect(card).toContain("Create sandbox tool");
    expect(card).toContain("Run sandbox");
    expect(card).not.toContain("Create sandbox tool</button>");
  });

  it("getApiRegistrySandboxToolState gates create vs existing", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-graph.js")}?t=${Date.now()}`
    ) as {
      getApiRegistrySandboxToolState: (
        row: Record<string, string>,
        cfg: { dataModel: { objects: unknown[] } }
      ) => { kind: string };
      buildSandboxRowFromApiRegistry: (
        cfg: { dataModel: { objects: unknown[] } },
        row: Record<string, string>,
        opts?: Record<string, unknown>
      ) => Record<string, string>;
    };
    const registryRow = {
      integrationId: "acme",
      baseUrl: "https://api.example.com",
      endpoint: "/v1",
      method: "GET",
      authRef: "ACME",
      status: "connected",
    };
    expect(mod.getApiRegistrySandboxToolState(registryRow, { dataModel: { objects: [] } }).kind).toBe("create");
    const cfg = {
      dataModel: {
        objects: [
          {
            objectType: "sandbox-environment",
            rows: [mod.buildSandboxRowFromApiRegistry({ dataModel: { objects: [] } }, registryRow)],
          },
        ],
      },
    };
    expect(mod.getApiRegistrySandboxToolState(registryRow, cfg).kind).toBe("existing");
    expect(mod.getApiRegistrySandboxToolState({ ...registryRow, status: "failed" }, cfg).kind).toBe("failed");
  });

  it("resolveConnectorAction routes filter/map/preview to correct node and tab", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-sidecar-routing.js")}?t=${Date.now()}`
    ) as {
      resolveConnectorAction: (p: { from: string; to: string; action: string }) => { nodeId: string; tab: string };
    };
    expect(mod.resolveConnectorAction({ from: "input", to: "api-request", action: "filter" })).toEqual({
      nodeId: "input",
      tab: "filters",
    });
    expect(mod.resolveConnectorAction({ from: "api-request", to: "transform", action: "filter" })).toEqual({
      nodeId: "transform",
      tab: "filters",
    });
    expect(mod.resolveConnectorAction({ from: "transform", to: "result", action: "map" })).toEqual({
      nodeId: "transform",
      tab: "node",
    });
    expect(mod.resolveConnectorAction({ from: "transform", to: "result", action: "preview" })).toEqual({
      nodeId: "result",
      tab: "preview",
    });
  });

  it("detectFieldIdsFromLastResponse extracts paths from test response", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-graph.js")}?t=${Date.now()}`
    ) as { detectFieldIdsFromLastResponse: (text: string) => string[] };
    const fields = mod.detectFieldIdsFromLastResponse(
      JSON.stringify({ data: { items: [{ email: "a@test.com", full_name: "Ada" }] } })
    );
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.some((f) => f.includes("email"))).toBe(true);
  });

  it("blank orchestration shell and ui state helpers", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-graph.js")}?t=${Date.now()}`
    ) as {
      buildBlankOrchestrationGraphShell: () => { nodes: unknown[]; version: number; provider: string };
      getOrchestrationGraphUiState: (v: unknown) => string;
      addCanonicalNodeToGraph: (g: unknown, id: string, row: Record<string, string>) => unknown;
      getNextCanonicalNodeId: (g: unknown) => string | null;
    };
    expect(mod.getOrchestrationGraphUiState(null)).toBe("unset");
    expect(mod.getOrchestrationGraphUiState("")).toBe("unset");
    const shell = mod.buildBlankOrchestrationGraphShell();
    expect(shell.nodes).toHaveLength(0);
    expect(shell.provider).toBe("growthub-native");
    expect(mod.getOrchestrationGraphUiState(shell)).toBe("blank-shell");
    expect(mod.getNextCanonicalNodeId(shell)).toBe("input");
    const row = { integrationId: "acme", method: "GET", endpoint: "/v1", authRef: "ACME" };
    const withInput = mod.addCanonicalNodeToGraph(shell, "input", row);
    expect(mod.getOrchestrationGraphUiState(withInput)).toBe("populated");
  });

  it("DataModelShell routes sandbox trace fields to trace panel not graph", () => {
    const shell = appText("app/data-model/components/DataModelShell.jsx");
    expect(shell).toContain("OrchestrationRunTracePanel");
    expect(shell).toContain("SandboxOrchestrationEditorPanel");
    expect(shell).toContain('sidecarMode === "trace"');
    expect(shell).toContain('sidecarMode === "graph"');
    expect(shell).toContain("SANDBOX_SIDECAR_COLUMNS");
    expect(shell).toContain("onOpenTraceSidecar");
    expect(shell).toContain("openTraceSidecar");
  });

  it("SandboxToolDraftPanel starts without auto-filled graph", () => {
    const draft = appText("app/data-model/components/SandboxToolDraftPanel.jsx");
    expect(draft).toContain("OrchestrationGraphEmptyCanvas");
    expect(draft).toContain("return null");
    expect(draft).toContain("getOrchestrationGraphUiState");
    expect(draft).not.toMatch(/useState\(\(\) => \{\s*return buildDefaultOrchestrationGraphFromRegistry/s);
  });

  it("workspace-rail supports workflow folder shortcuts", () => {
    const rail = appText("app/workspace-rail.jsx");
    expect(rail).toContain('workflow: { icon: "GitBranch"');
    expect(rail).toContain("listAvailableWorkflows");
    expect(rail).toContain("addWorkflowItem");
    expect(rail).toContain("openWorkflowItem");
    expect(rail).toContain('type: "workflow"');
    expect(rail).toContain('fieldName: "orchestrationGraph"');
    expect(rail).toContain("/workflows?object=");
    expect(rail).toContain("Add workflow");
    expect(rail).toContain('{ id: "workflow", label: "Workflows" }');
    expect(rail).not.toMatch(/addWorkflowItem[\s\S]*orchestrationGraph:\s*workflow/);
  });

  // ── Folder sidebar stability ──────────────────────────────────────────
  //
  // The rail must:
  //   1. cap visible folder/item slots at 10 before scrolling internally
  //   2. derive an `activeFolderId` from pathname + searchParams so a
  //      child item's parent folder stays open across navigation
  //   3. expand the Folders section automatically when an active item is
  //      detected (deep-link / reload case)
  //   4. stop click propagation on child item / customize / remove
  //      handlers so child clicks never collapse the parent folder
  //   5. ship a dedicated folder-scroll container with ellipsis-friendly
  //      label rules in CSS

  it("workspace-rail caps visible folder + item slots at 10", () => {
    const rail = appText("app/workspace-rail.jsx");
    expect(rail).toContain("NAV_MAX_VISIBLE_FOLDERS = 10");
    expect(rail).toContain("NAV_MAX_VISIBLE_ITEMS = 10");
    expect(rail).toContain("workspace-rail-folders-scroll");
    expect(rail).toContain("workspace-rail-folder-items");
  });

  it("workspace-rail derives an activeFolderId from pathname + searchParams", () => {
    const rail = appText("app/workspace-rail.jsx");
    expect(rail).toContain("function deriveActiveNavFolderId");
    expect(rail).toContain("function isNavItemActive");
    expect(rail).toContain("const activeFolderId = useMemo");
    expect(rail).toContain("deriveActiveNavFolderId(rows, pathname, searchParams)");
  });

  it("workspace-rail isNavItemActive covers dashboard, view, and workflow items", () => {
    // workspace-rail.jsx is a Next.js client module — server-importing it
    // in vitest would require a JSX runtime + lucide-react mocks. Assert
    // against the source the same way every other sidebar test does.
    const rail = appText("app/workspace-rail.jsx");
    // dashboard branch
    expect(rail).toContain('item.type === "dashboard"');
    expect(rail).toContain('pathname === "/" && get("dashboard")');
    // view branch
    expect(rail).toContain('item.type === "view"');
    expect(rail).toContain('pathname.startsWith("/data-model")');
    expect(rail).toMatch(/get\(\s*"object"\s*\) === String\(item\.objectId/);
    // workflow branch
    expect(rail).toContain('item.type === "workflow"');
    expect(rail).toContain('pathname.startsWith("/workflows")');
    expect(rail).toMatch(/get\(\s*"row"\s*\) === String\(item\.rowId/);
  });

  it("workspace-rail keeps the active folder expanded across navigation", () => {
    const rail = appText("app/workspace-rail.jsx");
    // renderFolder must consult activeFolderId before the persisted
    // `collapsed` flag — otherwise navigating to a child surface would
    // re-collapse the parent folder on the next mount.
    expect(rail).toContain("isActiveFolder = activeFolderId === folder.id");
    expect(rail).toContain("!isActiveFolder && Boolean(folder.collapsed)");
    // Section auto-expand on deep-link to an active item.
    expect(rail).toMatch(/if \(activeFolderId\) setSectionCollapsed\(false\)/);
  });

  it("workspace-rail stops click propagation on child item + menu actions", () => {
    const rail = appText("app/workspace-rail.jsx");
    // Item-row navigation button — must stop propagation so the click
    // never reaches the parent folder toggle.
    expect(rail).toMatch(/onClick=\{\(e\) => \{\s*\/\/[\s\S]*e\.stopPropagation\(\);\s*if \(item\.type === "dashboard"\)/);
    // Customize / Remove menu items on a folder item must also stop
    // propagation — opening / using the menu cannot collapse the folder.
    expect(rail).toMatch(/onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*startCustomizeItem\(folder, item\);/);
    expect(rail).toMatch(/onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*deleteItem\(folder\.id, item\.id\);/);
    // Folder menu items (Customize, Add dashboard/view/workflow, Delete)
    // must also stop propagation.
    expect(rail).toMatch(/onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*startCustomizeFolder\(folder\);/);
    expect(rail).toMatch(/onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*setOpenMenuId\(null\);\s*setMenuAnchor\(null\);\s*setAddPickerFor\(\{ folderId: folder\.id, kind: "dashboard" \}\);/);
    expect(rail).toMatch(/onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*deleteFolder\(folder\.id\);/);
  });

  it("globals.css constrains the folder list with its own scrollbar", () => {
    const css = appText("app/globals.css");
    // Dedicated scroll container — owns vertical overflow, kills lateral.
    expect(css).toMatch(/\.workspace-rail-folders-scroll\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overscroll-behavior:\s*contain;/);
    // Max-height is bounded by both row count and viewport height so the
    // section never pushes Builder / Management / Settings off-screen.
    expect(css).toMatch(/\.workspace-rail-folders-scroll\s*\{[\s\S]*?max-height:\s*min\([\s\S]*?calc\(100vh - 280px\)[\s\S]*?\);/);
    // Item-children container also gets internal scroll when many items
    // are stacked under a single folder.
    expect(css).toMatch(/\.workspace-rail-folder-items\.is-scrollable\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?overflow-x:\s*hidden;/);
  });

  it("globals.css truncates long folder + item labels with ellipsis", () => {
    const css = appText("app/globals.css");
    // Folder name ellipsis already shipped; assert it stays.
    expect(css).toMatch(/\.workspace-rail-folder-name\s*\{[\s\S]*?white-space:\s*nowrap;[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?min-width:\s*0;/);
    // Item label ellipsis must stay too.
    expect(css).toMatch(/\.workspace-rail-folder-item-label\s*\{[\s\S]*?white-space:\s*nowrap;[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?min-width:\s*0;/);
    // New: subtitle/meta line (Dashboard / View / Workflow hint) must
    // also truncate so it never expands the row width.
    expect(css).toMatch(/\.workspace-rail-nav-row-meta\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/);
  });

  it("listAvailableWorkflows discovers sandbox-environment rows", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/nav-workflows.js")}?t=${Date.now()}`
    ) as {
      listAvailableWorkflows: (cfg: { dataModel: { objects: unknown[] } }) => Array<{
        objectId: string;
        rowId: string;
        graphNodeCount: number;
      }>;
    };
    const workflows = mod.listAvailableWorkflows({
      dataModel: {
        objects: [
          {
            id: "workspace-helper-sandbox",
            objectType: "sandbox-environment",
            rows: [{ Name: "Hidden" }],
          },
          {
            id: "sandbox-env",
            objectType: "sandbox-environment",
            label: "Sandbox Environments",
            rows: [
              {
                Name: "LeadShark Tool",
                lifecycleStatus: "live",
                version: "2",
                orchestrationGraph: JSON.stringify({
                  version: 1,
                  provider: "growthub-native",
                  nodes: [{ id: "input", type: "input" }, { id: "api-request", type: "api-registry-call" }],
                  edges: [],
                }),
              },
            ],
          },
        ],
      },
    });
    expect(workflows).toHaveLength(1);
    expect(workflows[0].objectId).toBe("sandbox-env");
    expect(workflows[0].rowId).toBe("LeadShark Tool");
    expect(workflows[0].graphNodeCount).toBe(2);
  });

  it("Builder workflow creation resolves the live sandbox-environment object", () => {
    const builder = appText("app/workspace-builder.jsx");
    expect(builder).toContain("function getWorkflowSandboxObject");
    expect(builder).toContain('object?.objectType !== "sandbox-environment"');
    expect(builder).toContain("HIDDEN_SANDBOX_OBJECT_IDS");
    expect(builder).toContain("const existing = getWorkflowSandboxObject(config)");
    expect(builder).not.toContain('const sandboxObjectId = "sandboxes-alignment-loop"');
  });

  it("workflows page exists and uses orchestration canvas", () => {
    expect(appExists("app/workflows/page.jsx")).toBe(true);
    expect(appExists("app/workflows/WorkflowSurface.jsx")).toBe(true);
    const surface = appText("app/workflows/WorkflowSurface.jsx");
    expect(surface).toContain("OrchestrationGraphCanvas");
    expect(surface).toContain("OrchestrationRunTracePanel");
    expect(surface).toContain("OrchestrationGraphEmptyCanvas");
    expect(surface).toContain("/api/workspace/sandbox-run");
    expect(surface).toContain("PATCH");
    expect(surface).toContain("dataModel");
  });

  it("parseSandboxRunTrace redacts and extracts run metadata", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-trace.js")}?t=${Date.now()}`
    ) as { parseSandboxRunTrace: (text: string) => { runId: string; stdout: string; output: string } };
    const trace = mod.parseSandboxRunTrace(
      JSON.stringify({
        runId: "run-1",
        exitCode: 0,
        durationMs: 120,
        stdout: "ok",
        output: { items: [] },
        adapter: "local-process",
      })
    );
    expect(trace.runId).toBe("run-1");
    expect(trace.stdout).toBe("ok");
    expect(trace.output).toContain("items");
  });

  it("incomplete API Registry does not allow create state", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-graph.js")}?t=${Date.now()}`
    ) as {
      getApiRegistrySandboxToolState: (
        row: Record<string, string>,
        cfg: { dataModel: { objects: unknown[] } }
      ) => { kind: string };
    };
    expect(
      mod.getApiRegistrySandboxToolState(
        { integrationId: "x", status: "connected" },
        { dataModel: { objects: [] } }
      ).kind
    ).toBe("incomplete");
  });
});

// ---------------------------------------------------------------------------
// 9. Chart value hydration — pure computation + Data Model hydration
//
// Negative probes are the spine of this suite: invalid axis configs must
// not crash and must not silently persist malformed values. Positive probes
// confirm the legacy static `values` path and the new hydration path both
// produce finite number[] projections suitable for `widget.config.values`.
// ---------------------------------------------------------------------------

describe("workspace-chart-values — pure computation", () => {
  type ComputeResult = {
    values: number[];
    rowCount: number;
    usedRowCount: number;
    warnings: string[];
  };
  let computeChartValuesFromRows: (input: unknown) => ComputeResult;

  beforeEach(async () => {
    const modPath = path.join(APP_ROOT, "lib/workspace-chart-values.js");
    const mod = await import(`file://${modPath}?t=${Date.now()}`) as {
      computeChartValuesFromRows: typeof computeChartValuesFromRows;
    };
    computeChartValuesFromRows = mod.computeChartValuesFromRows;
  });

  it("manual Data Model rows compute finite chart values via sum aggregation", () => {
    const out = computeChartValuesFromRows({
      rows: [
        { stage: "lead", arr: "100" },
        { stage: "lead", arr: 50 },
        { stage: "won", arr: 250 },
      ],
      xAxis: { field: "stage", sort: "position" },
      yAxis: { field: "arr", aggregation: "sum" },
    });
    expect(out.values).toEqual([150, 250]);
    expect(out.values.every((v) => Number.isFinite(v))).toBe(true);
    expect(out.usedRowCount).toBe(3);
  });

  it("count aggregation works without a numeric Y field", () => {
    const out = computeChartValuesFromRows({
      rows: [{ stage: "a" }, { stage: "a" }, { stage: "b" }],
      xAxis: { field: "stage" },
      yAxis: { aggregation: "count" },
    });
    expect(out.values).toEqual([2, 1]);
    expect(out.warnings).toEqual([]);
  });

  it("invalid Y field returns empty values and a warning, never throws", () => {
    const out = computeChartValuesFromRows({
      rows: [{ stage: "lead", arr: "not-a-number" }],
      xAxis: { field: "stage" },
      yAxis: { field: "arr", aggregation: "sum" },
    });
    expect(out.values).toEqual([]);
    expect(out.warnings.length).toBeGreaterThan(0);
    expect(out.warnings.some((w) => w.toLowerCase().includes("numeric"))).toBe(true);
  });

  it("empty rows produce empty values and a warning instead of crashing", () => {
    const out = computeChartValuesFromRows({
      rows: [],
      xAxis: { field: "stage" },
      yAxis: { field: "arr", aggregation: "sum" },
    });
    expect(out.values).toEqual([]);
    expect(out.rowCount).toBe(0);
  });

  it("filter clauses narrow the input row set before aggregation", () => {
    const out = computeChartValuesFromRows({
      rows: [
        { stage: "lead", arr: 100 },
        { stage: "won", arr: 200 },
        { stage: "won", arr: 300 },
      ],
      xAxis: { field: "stage" },
      yAxis: { field: "arr", aggregation: "sum" },
      filter: { op: "and", clauses: [{ fieldId: "stage", operator: "eq", value: "won" }] },
    });
    expect(out.values).toEqual([500]);
    expect(out.usedRowCount).toBe(2);
  });

  it("omitZero strips zero buckets", () => {
    const out = computeChartValuesFromRows({
      rows: [
        { stage: "a", arr: 0 },
        { stage: "b", arr: 10 },
      ],
      xAxis: { field: "stage", omitZero: true },
      yAxis: { field: "arr", aggregation: "sum" },
    });
    expect(out.values).toEqual([10]);
  });

  it("invalid input shape is tolerated without throwing", () => {
    const out = computeChartValuesFromRows({});
    expect(out.values).toEqual([]);
    expect(out.warnings.length).toBeGreaterThanOrEqual(0);
  });

  it("count aggregation counts rows even when a non-numeric Y field is selected", () => {
    const out = computeChartValuesFromRows({
      rows: [
        { Stage: "Won", Owner: "Ada" },
        { Stage: "Lost", Owner: "Ben" },
        { Stage: "Won", Owner: "Cy" },
      ],
      xAxis: { field: "Stage" },
      yAxis: { field: "Owner", aggregation: "count" },
    });
    // Count must ignore the (non-numeric) Y field entirely — every row in
    // the bucket contributes 1.
    expect(out.values).toEqual([2, 1]);
    expect(out.warnings).toEqual([]);
  });

  it("count aggregation counts rows when Y field is numeric (still row-presence)", () => {
    const out = computeChartValuesFromRows({
      rows: [
        { Stage: "Won", arr: 100 },
        { Stage: "Won", arr: 200 },
        { Stage: "Lost", arr: 50 },
      ],
      xAxis: { field: "Stage" },
      yAxis: { field: "arr", aggregation: "count" },
    });
    expect(out.values).toEqual([2, 1]);
  });

  it("count aggregation respects filter and groupBy", () => {
    const out = computeChartValuesFromRows({
      rows: [
        { Stage: "Won", Owner: "Ada" },
        { Stage: "Lost", Owner: "Ben" },
        { Stage: "Won", Owner: "Ada" },
      ],
      xAxis: { field: "Owner" },
      yAxis: { aggregation: "count", groupBy: "Stage" },
      filter: { op: "and", clauses: [{ fieldId: "Stage", operator: "eq", value: "Won" }] },
    });
    // Group by Stage after filtering to Stage=Won → single group with 2 rows.
    expect(out.values).toEqual([2]);
    expect(out.usedRowCount).toBe(2);
  });

  it("countEmpty counts rows where the Y field is null/empty", () => {
    const out = computeChartValuesFromRows({
      rows: [
        { Stage: "Won", Owner: "Ada" },
        { Stage: "Won", Owner: "" },
        { Stage: "Won", Owner: null },
        { Stage: "Lost", Owner: "Ben" },
      ],
      xAxis: { field: "Stage" },
      yAxis: { field: "Owner", operation: "countEmpty" },
    });
    expect(out.values).toEqual([2, 0]);
  });

  it("countNotEmpty counts rows where the Y field is present", () => {
    const out = computeChartValuesFromRows({
      rows: [
        { Stage: "Won", Owner: "Ada" },
        { Stage: "Won", Owner: "" },
        { Stage: "Lost", Owner: "Ben" },
      ],
      xAxis: { field: "Stage" },
      yAxis: { field: "Owner", operation: "countNotEmpty" },
    });
    expect(out.values).toEqual([1, 1]);
  });

  it("countUnique counts distinct non-empty Y values per bucket", () => {
    const out = computeChartValuesFromRows({
      rows: [
        { Stage: "Won", Owner: "Ada" },
        { Stage: "Won", Owner: "Ada" },
        { Stage: "Won", Owner: "Ben" },
        { Stage: "Lost", Owner: "" },
      ],
      xAxis: { field: "Stage" },
      yAxis: { field: "Owner", operation: "countUnique" },
    });
    expect(out.values).toEqual([2, 0]);
  });

  it("percentEmpty / percentNotEmpty return 0-100 percentages of the bucket", () => {
    const empty = computeChartValuesFromRows({
      rows: [
        { Stage: "Won", Owner: "Ada" },
        { Stage: "Won", Owner: "" },
        { Stage: "Won", Owner: null },
        { Stage: "Won", Owner: "Cy" },
      ],
      xAxis: { field: "Stage" },
      yAxis: { field: "Owner", operation: "percentEmpty" },
    });
    expect(empty.values).toEqual([50]);
    const notEmpty = computeChartValuesFromRows({
      rows: [
        { Stage: "Won", Owner: "Ada" },
        { Stage: "Won", Owner: "" },
      ],
      xAxis: { field: "Stage" },
      yAxis: { field: "Owner", operation: "percentNotEmpty" },
    });
    expect(notEmpty.values).toEqual([50]);
  });

  it("cumulative transform produces a running total over sorted buckets", () => {
    const out = computeChartValuesFromRows({
      rows: [
        { Stage: "Lead", arr: 10 },
        { Stage: "Negotiation", arr: 20 },
        { Stage: "Won", arr: 30 },
      ],
      xAxis: { field: "Stage", sort: "position" },
      yAxis: { field: "arr", operation: "sum", cumulative: true },
    });
    expect(out.values).toEqual([10, 30, 60]);
  });

  it("yAxis.operation key takes precedence over yAxis.aggregation when both are set", () => {
    const out = computeChartValuesFromRows({
      rows: [
        { Stage: "Won", arr: 5 },
        { Stage: "Won", arr: 7 },
      ],
      xAxis: { field: "Stage" },
      yAxis: { field: "arr", operation: "avg", aggregation: "sum" },
    });
    expect(out.values).toEqual([6]);
  });
});

describe("workspace-chart-values — debug + hydration state", () => {
  type DebugResult = {
    values: number[];
    rowCount: number;
    filteredCount: number;
    droppedByFilter: number;
    buckets: Array<{ key: string | number; rowCount: number; numericCount: number; value: number | null }>;
    droppedRows: Array<{ reason: string }>;
    samples: Record<string, unknown>[];
    warnings: string[];
  };
  let computeChartProjectionDebug: (input: unknown) => DebugResult;
  let deriveChartHydrationState: (input: unknown) => string;

  beforeEach(async () => {
    const modPath = path.join(APP_ROOT, "lib/workspace-chart-values.js");
    const mod = await import(`file://${modPath}?t=${Date.now()}`) as {
      computeChartProjectionDebug: typeof computeChartProjectionDebug;
      deriveChartHydrationState: typeof deriveChartHydrationState;
    };
    computeChartProjectionDebug = mod.computeChartProjectionDebug;
    deriveChartHydrationState = mod.deriveChartHydrationState;
  });

  it("debug returns buckets, dropped rows, samples, and final values", () => {
    const out = computeChartProjectionDebug({
      rows: [
        { Stage: "Won", arr: 100 },
        { Stage: "Won", arr: "n/a" },
        { Stage: "Lost", arr: 50 },
      ],
      xAxis: { field: "Stage" },
      yAxis: { field: "arr", aggregation: "sum" },
    });
    expect(out.values).toEqual([100, 50]);
    expect(out.buckets.length).toBe(2);
    expect(out.buckets[0]).toMatchObject({ key: "Won", rowCount: 2, numericCount: 1, value: 100 });
    expect(out.droppedRows.some((r) => r.reason === "non-numeric-y")).toBe(true);
    expect(out.samples.length).toBeLessThanOrEqual(5);
  });

  it("deriveChartHydrationState reports needs-source when bound table is missing", () => {
    const state = deriveChartHydrationState({
      widget: { config: { binding: { sourceType: "workspace-data-model", objectId: "gone" }, yAxis: { field: "arr", aggregation: "sum" }, xAxis: { field: "Stage" } } },
      table: null,
      computation: { warnings: [] },
      lastSavedValues: [],
    });
    expect(state).toBe("needs-source");
  });

  it("deriveChartHydrationState reports unsaved when current values differ from saved", () => {
    const state = deriveChartHydrationState({
      widget: { config: { values: [10, 20], binding: { sourceType: "workspace-data-model", objectId: "o" }, yAxis: { field: "arr", aggregation: "sum" }, xAxis: { field: "Stage" } } },
      table: { rows: [], columns: [] },
      computation: { warnings: [] },
      lastSavedValues: [10, 30],
    });
    expect(state).toBe("unsaved");
  });

  it("deriveChartHydrationState reports static for unbound widgets that still have legacy values", () => {
    const state = deriveChartHydrationState({
      widget: { config: { values: [1, 2, 3] } },
      table: null,
      computation: { warnings: [] },
      lastSavedValues: [1, 2, 3],
    });
    expect(state).toBe("static");
  });
});

describe("workspace-data-model — sidecar hydration", () => {
  type Table = {
    objectId?: string;
    columns: string[];
    rows: Record<string, unknown>[];
    storage: string;
    liveSource?: { sourceRecordKey: string; fetchedAt: string | null };
  };
  let listWorkspaceDataModelTables: (
    config: unknown,
    options?: { sourceRecords?: Record<string, unknown> }
  ) => Table[];

  beforeEach(async () => {
    const modPath = path.join(APP_ROOT, "lib/workspace-data-model.js");
    const mod = await import(`file://${modPath}?t=${Date.now()}`) as {
      listWorkspaceDataModelTables: typeof listWorkspaceDataModelTables;
    };
    listWorkspaceDataModelTables = mod.listWorkspaceDataModelTables;
  });

  it("live-backed object hydrates rows from sidecar records keyed by object.id", () => {
    const config = {
      dataModel: {
        objects: [{
          id: "src_crm",
          label: "CRM",
          objectType: "data-source",
          columns: ["name", "stage"],
          rows: [],
          binding: { mode: "integration", sourceStorage: "workspace-source-records", sourceId: "src_crm", integrationId: "my-crm" },
        }],
      },
    };
    const sourceRecords = {
      src_crm: {
        records: [{ name: "Acme", stage: "won" }, { name: "Beta", stage: "lead" }],
        fetchedAt: "2026-05-01T00:00:00Z",
        recordCount: 2,
        integrationId: "my-crm",
      },
    };
    const tables = listWorkspaceDataModelTables(config, { sourceRecords });
    const crm = tables.find((t) => t.objectId === "src_crm");
    expect(crm).toBeDefined();
    expect(crm!.rows.length).toBe(2);
    expect(crm!.rows[0].name).toBe("Acme");
    expect(crm!.liveSource?.sourceRecordKey).toBe("src_crm");
  });

  it("live-backed object falls back to config rows when sidecar is empty", () => {
    const config = {
      dataModel: {
        objects: [{
          id: "src_crm",
          label: "CRM",
          objectType: "data-source",
          columns: ["name"],
          rows: [{ name: "Stub" }],
          binding: { mode: "integration", sourceStorage: "workspace-source-records", sourceId: "src_crm", integrationId: "my-crm" },
        }],
      },
    };
    const tables = listWorkspaceDataModelTables(config, { sourceRecords: {} });
    const crm = tables.find((t) => t.objectId === "src_crm");
    expect(crm!.rows.length).toBe(1);
    expect(crm!.rows[0].name).toBe("Stub");
    expect(crm!.liveSource).toBeFalsy();
  });

  it("hydration falls back to object.sourceId then binding.sourceId when object.id is not the sidecar key", () => {
    const config = {
      dataModel: {
        objects: [{
          id: "object-id-mismatch",
          label: "CRM",
          objectType: "data-source",
          columns: [],
          rows: [],
          sourceId: "alt-source-key",
          binding: { mode: "integration", sourceStorage: "workspace-source-records", sourceId: "another-key", integrationId: "my-crm" },
        }],
      },
    };
    const sourceRecords = {
      "another-key": { records: [{ name: "From binding" }], fetchedAt: "2026-05-02T00:00:00Z", recordCount: 1 },
    };
    const tables = listWorkspaceDataModelTables(config, { sourceRecords });
    const crm = tables.find((t) => t.objectId === "object-id-mismatch");
    expect(crm!.rows.length).toBe(1);
    expect(crm!.rows[0].name).toBe("From binding");
    expect(crm!.liveSource?.sourceRecordKey).toBe("another-key");
  });

  it("non-live-backed objects are not affected by sidecar records", () => {
    const config = {
      dataModel: {
        objects: [{
          id: "manual",
          label: "Manual",
          columns: ["name"],
          rows: [{ name: "Local" }],
          binding: { mode: "manual", source: "Manual" },
        }],
      },
    };
    const sourceRecords = { manual: { records: [{ name: "Should-not-appear" }], fetchedAt: null, recordCount: 1 } };
    const tables = listWorkspaceDataModelTables(config, { sourceRecords });
    const manual = tables.find((t) => t.objectId === "manual");
    expect(manual!.rows[0].name).toBe("Local");
  });

  it("calling without options keeps the legacy single-arg signature working", () => {
    const config = {
      dataModel: {
        objects: [{ id: "m", label: "M", columns: ["a"], rows: [{ a: "1" }], binding: { mode: "manual" } }],
      },
    };
    const tables = listWorkspaceDataModelTables(config);
    expect(tables.find((t) => t.objectId === "m")!.rows[0].a).toBe("1");
  });
});

describe("workspace route + schema — chart value hydration governance", () => {
  it("GET /api/workspace returns workspaceSourceRecords for runtime hydration", () => {
    const source = appText("app/api/workspace/route.js");
    expect(source).toContain("readWorkspaceSourceRecords");
    expect(source).toContain("workspaceSourceRecords");
  });

  it("workspaceSourceRecords is NOT in the PATCH allowlist", () => {
    const source = appText("app/api/workspace/route.js");
    // The frozen allowlist literal must remain exactly these four fields and
    // never name `workspaceSourceRecords`. The sidecar is GET-only.
    expect(source).toContain('ALLOWED_PATCH_FIELDS = new Set(["dashboards", "widgetTypes", "canvas", "dataModel"])');
    const allowlistMatch = source.match(/ALLOWED_PATCH_FIELDS\s*=\s*new Set\(\[[^\]]*\]\)/);
    expect(allowlistMatch).not.toBeNull();
    expect(allowlistMatch![0]).not.toContain("workspaceSourceRecords");
  });

  it("workspaceSourceRecords is rejected as unknown when sent to PATCH", async () => {
    const schemaPath = path.join(APP_ROOT, "lib/workspace-schema.js");
    const schemaMod = await import(`file://${schemaPath}?t=${Date.now()}`) as {
      validateWorkspaceConfig: (c: unknown) => void;
    };
    // The validator rejects unknown top-level fields outright — the route
    // layer additionally rejects unknown PATCH keys before validation runs.
    expect(() =>
      schemaMod.validateWorkspaceConfig({ workspaceSourceRecords: { foo: { records: [] } } } as never)
    ).toThrow(expect.objectContaining({ code: "INVALID_WORKSPACE_CONFIG" }));
  });

  it("static chart config.values continues to validate without binding", async () => {
    const schemaPath = path.join(APP_ROOT, "lib/workspace-schema.js");
    const mod = await import(`file://${schemaPath}?t=${Date.now()}`) as {
      validateWorkspaceConfig: (c: unknown) => void;
    };
    expect(() =>
      mod.validateWorkspaceConfig({
        canvas: {
          layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
          widgets: [
            { id: "w1", kind: "chart", title: "Static",
              position: { x: 0, y: 0, w: 4, h: 4 },
              config: { values: [10, 20, 30] } },
          ],
        },
      })
    ).not.toThrow();
  });

  it("chart bound to a Data Model object with computed values validates", async () => {
    const schemaPath = path.join(APP_ROOT, "lib/workspace-schema.js");
    const mod = await import(`file://${schemaPath}?t=${Date.now()}`) as {
      validateWorkspaceConfig: (c: unknown) => void;
    };
    expect(() =>
      mod.validateWorkspaceConfig({
        canvas: {
          layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
          widgets: [
            { id: "w1", kind: "chart", title: "Bound",
              position: { x: 0, y: 0, w: 6, h: 4 },
              config: {
                values: [150, 250],
                xAxis: { field: "stage", sort: "position" },
                yAxis: { field: "arr", aggregation: "sum" },
                binding: { mode: "manual", source: "Pipeline", sourceType: "workspace-data-model", sourceAuthority: "workspace-config", objectId: "pipeline" },
              } },
          ],
        },
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 9. Sandbox Claude local auth onboarding V1 — file presence + helper contract
//
// Claude auth setup is a SEPARATE concern from the `local-agent-host`
// execution adapter. These probes guard the invariant that the auth onboarding
// surface ships with the kit and that the helper rejects non-Claude rows
// rather than silently letting them through.
// ---------------------------------------------------------------------------

describe("growthub-custom-workspace-starter-v1 — sandbox-agent-auth files ship", () => {
  it("lib/sandbox-agent-auth.js ships", () => {
    expect(appExists("lib/sandbox-agent-auth.js")).toBe(true);
  });

  it("app/api/workspace/sandbox-agent-auth/status/route.js ships", () => {
    expect(appExists("app/api/workspace/sandbox-agent-auth/status/route.js")).toBe(true);
  });

  it("app/api/workspace/sandbox-agent-auth/login/route.js ships", () => {
    expect(appExists("app/api/workspace/sandbox-agent-auth/login/route.js")).toBe(true);
  });

  it("app/api/workspace/sandbox-agent-auth/logout/route.js ships", () => {
    expect(appExists("app/api/workspace/sandbox-agent-auth/logout/route.js")).toBe(true);
  });

  it("legacy Claude-specific route paths are NOT shipped (replaced by host-agnostic routes)", () => {
    expect(appExists("app/api/workspace/sandbox-agent-auth/claude-login/route.js")).toBe(false);
    expect(appExists("app/api/workspace/sandbox-agent-auth/claude-logout/route.js")).toBe(false);
  });

  it("app/data-model/components/SandboxAgentAuthPanel.jsx ships", () => {
    expect(appExists("app/data-model/components/SandboxAgentAuthPanel.jsx")).toBe(true);
  });

  it("lib/sandbox-agent-host-catalog.js ships", () => {
    expect(appExists("lib/sandbox-agent-host-catalog.js")).toBe(true);
  });

  it("DataModelShell.jsx mounts SandboxAgentAuthPanel guarded by isSandboxLocalAgentHost", () => {
    const shell = appText("app/data-model/components/DataModelShell.jsx");
    expect(shell).toContain("SandboxAgentAuthPanel");
    expect(shell).toContain("isSandboxLocalAgentHost");
  });

  it("Claude host catalog entry uses repo source-of-truth `auth login` / `auth logout` (no setup-token)", () => {
    const catalog = appText("lib/sandbox-agent-host-catalog.js");
    expect(catalog).toContain('"auth", "login"');
    expect(catalog).toContain('"auth", "logout"');
    expect(catalog).not.toContain("setup-token");
  });

  it("helper does NOT reference setup-token anywhere", () => {
    const helper = appText("lib/sandbox-agent-auth.js");
    expect(helper).not.toContain("setup-token");
  });

  it("helper redaction patterns cover obvious token shapes", () => {
    const helper = appText("lib/sandbox-agent-auth.js");
    // Helper imports redactSecrets from the pure utilities module.
    expect(helper).toContain("redactSecrets");
    const redaction = appText("lib/sandbox-agent-auth-redaction.js");
    expect(redaction).toContain("sk-ant-");
    // Prefix-anchored patterns added in the production-pass refinement.
    expect(redaction).toContain("access[_-]?token");
    expect(redaction).toContain("refresh[_-]?token");
    expect(redaction).toContain("api[_-]?key");
  });

  it("helper writes ONLY safe metadata back to the row (whitelist guard)", () => {
    const helper = appText("lib/sandbox-agent-auth.js");
    expect(helper).toContain("SAFE_ROW_PATCH_FIELDS");
    expect(helper).toContain("agentAuthStatus");
    expect(helper).toContain("agentAuthProvider");
    expect(helper).toContain("agentAuthLastChecked");
    expect(helper).toContain("agentAuthLastExitCode");
    expect(helper).toContain("agentAuthLastMessage");
    // Must never reference raw token field names (as literal identifiers or
    // object keys we'd persist).
    expect(helper).not.toMatch(/\btoken\s*:\s*/);
    expect(helper).not.toMatch(/\baccessToken\b/);
    expect(helper).not.toMatch(/\brefreshToken\b/);
  });

  it("helper redactSecrets actually strips token-shaped strings at runtime", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/sandbox-agent-auth-redaction.js")}?t=${Date.now()}`
    ) as { redactSecrets: (text: string) => string };
    const redacted = mod.redactSecrets(
      [
        "claude key sk-ant-api03-abcdefghijklmnop1234567",
        "Bearer abcdefghijklmnop1234567890",
        "access_token=ZZZsecretvalueXXX",
        "refresh_token: ABC_refresh_DEF",
        "api_key='LIVE-12345-KEY'",
        "session_key=ZZZ"
      ].join("\n")
    );
    expect(redacted).not.toMatch(/sk-ant-api03-abcdefghijklmnop/);
    expect(redacted).not.toMatch(/abcdefghijklmnop1234567890/);
    expect(redacted).not.toMatch(/ZZZsecretvalueXXX/);
    expect(redacted).not.toMatch(/ABC_refresh_DEF/);
    expect(redacted).not.toMatch(/LIVE-12345-KEY/);
    expect(redacted).toMatch(/\[redacted\]/);
  });

  it("status semantics — `--version` exit 0 maps to `reachable`, NEVER `active`", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/sandbox-agent-auth-redaction.js")}?t=${Date.now()}`
    ) as {
      KNOWN_AGENT_AUTH_STATUSES: readonly string[];
    };
    // The status taxonomy must include a distinct "reachable" value so the
    // helper / UI can never promote a `--version` probe to "active".
    expect(mod.KNOWN_AGENT_AUTH_STATUSES).toContain("reachable");
    expect(mod.KNOWN_AGENT_AUTH_STATUSES).toContain("active");
    expect(mod.KNOWN_AGENT_AUTH_STATUSES).toContain("stale");
    expect(mod.KNOWN_AGENT_AUTH_STATUSES).toContain("missing");
  });

  it("isSandboxLocalAgentHost accepts every catalog host slug in local locality", async () => {
    const eligibility = await import(
      `file://${path.join(APP_ROOT, "lib/sandbox-agent-auth-eligibility.js")}?t=${Date.now()}`
    ) as {
      isSandboxLocalAgentHost: (row: unknown) => boolean;
      isSandboxClaudeLocal: (row: unknown) => boolean;
    };
    const catalog = await import(
      `file://${path.join(APP_ROOT, "lib/sandbox-agent-host-catalog.js")}?t=${Date.now()}`
    ) as { KNOWN_HOST_AUTH_SLUGS: readonly string[] };

    expect(eligibility.isSandboxLocalAgentHost(null)).toBe(false);
    expect(eligibility.isSandboxLocalAgentHost({})).toBe(false);
    expect(eligibility.isSandboxLocalAgentHost({ adapter: "local-process", agentHost: "claude_local" })).toBe(false);
    expect(eligibility.isSandboxLocalAgentHost({ adapter: "local-agent-host", agentHost: "nope_local" })).toBe(false);
    expect(eligibility.isSandboxLocalAgentHost({ adapter: "local-agent-host", agentHost: "claude_local", runLocality: "serverless" })).toBe(false);
    for (const slug of catalog.KNOWN_HOST_AUTH_SLUGS) {
      expect(
        eligibility.isSandboxLocalAgentHost({ adapter: "local-agent-host", agentHost: slug, runLocality: "local" })
      ).toBe(true);
    }
    // Backwards-compatible Claude-specific predicate still works.
    expect(eligibility.isSandboxClaudeLocal({ adapter: "local-agent-host", agentHost: "claude_local" })).toBe(true);
    expect(eligibility.isSandboxClaudeLocal({ adapter: "local-agent-host", agentHost: "codex_local" })).toBe(false);
  });

  it("host catalog declares Claude with full auth and other hosts with reachability-only capabilities", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/sandbox-agent-host-catalog.js")}?t=${Date.now()}`
    ) as {
      getAgentHostCapabilities: (row: unknown) => null | {
        slug: string;
        label: string;
        canLogin: boolean;
        canLogout: boolean;
        canCheckStatus: boolean;
        hasAuthStatusProbe: boolean;
        installHint: string;
      };
      KNOWN_HOST_AUTH_SLUGS: readonly string[];
    };
    const claude = mod.getAgentHostCapabilities({
      adapter: "local-agent-host",
      agentHost: "claude_local",
      runLocality: "local"
    });
    expect(claude).not.toBeNull();
    expect(claude!.canLogin).toBe(true);
    expect(claude!.canLogout).toBe(true);
    expect(claude!.canCheckStatus).toBe(true);
    expect(claude!.hasAuthStatusProbe).toBe(true);

    // Hosts that DECLARE a documented login/logout subcommand in the catalog
    // surface canLogin / canLogout as true. Hosts that ship only the
    // versionProbe (no invented subcommands) stay reachability-only. The
    // catalog is the single source of truth; this test verifies the helper
    // mirrors the catalog rather than hard-coding a "claude is the only host
    // with login" assumption (which was true before codex/cursor were added).
    const HOSTS_WITH_DOCUMENTED_LOGIN = new Set(["claude_local", "codex_local", "cursor"]);
    for (const slug of mod.KNOWN_HOST_AUTH_SLUGS) {
      if (slug === "claude_local") continue;
      const caps = mod.getAgentHostCapabilities({
        adapter: "local-agent-host",
        agentHost: slug,
        runLocality: "local"
      });
      expect(caps).not.toBeNull();
      expect(caps!.canCheckStatus).toBe(true);
      if (HOSTS_WITH_DOCUMENTED_LOGIN.has(slug)) {
        expect(caps!.canLogin).toBe(true);
        expect(caps!.canLogout).toBe(true);
      } else {
        expect(caps!.canLogin).toBe(false);
        expect(caps!.canLogout).toBe(false);
      }
      expect(caps!.installHint.length).toBeGreaterThan(0);
    }

    // Serverless / non-eligible rows return null.
    expect(mod.getAgentHostCapabilities({
      adapter: "local-agent-host",
      agentHost: "claude_local",
      runLocality: "serverless"
    })).toBeNull();
  });

  it("lib/sandbox-agent-auth-eligibility.js ships", () => {
    expect(appExists("lib/sandbox-agent-auth-eligibility.js")).toBe(true);
  });
});

describe("growthub-custom-workspace-starter-v1 — sandbox-agent-auth kit.json frozen paths", () => {
  const kitJson = JSON.parse(readText("kit.json"));
  const frozen: string[] = kitJson.frozenAssetPaths ?? [];

  const requiredPaths = [
    "apps/workspace/lib/sandbox-agent-auth.js",
    "apps/workspace/lib/sandbox-agent-auth-eligibility.js",
    "apps/workspace/lib/sandbox-agent-auth-redaction.js",
    "apps/workspace/lib/sandbox-agent-host-catalog.js",
    "apps/workspace/app/api/workspace/sandbox-agent-auth/status/route.js",
    "apps/workspace/app/api/workspace/sandbox-agent-auth/login/route.js",
    "apps/workspace/app/api/workspace/sandbox-agent-auth/logout/route.js",
    "apps/workspace/app/data-model/components/SandboxAgentAuthPanel.jsx",
  ];

  for (const p of requiredPaths) {
    it(`frozen asset paths include: ${p}`, () => {
      expect(frozen).toContain(p);
    });
  }
});

// ---------------------------------------------------------------------------
// 9. Live Runs Console — observability helper contract
// ---------------------------------------------------------------------------

describe("orchestration-run-console — observability model", () => {
  it("orchestration-run-console.js ships in apps/workspace/lib/", () => {
    expect(appExists("lib/orchestration-run-console.js")).toBe(true);
  });

  it("OrchestrationRunTracePanel still exists for the live console UI", () => {
    expect(appExists("app/data-model/components/OrchestrationRunTracePanel.jsx")).toBe(true);
  });

  it("WorkflowSurface imports the run trace panel and passes onReplay", () => {
    const surface = appText("app/workflows/WorkflowSurface.jsx");
    expect(surface).toContain("OrchestrationRunTracePanel");
    expect(surface).toContain("onReplay={runSandbox}");
    expect(surface).toContain("running={running}");
  });

  it("sandbox-run route still exports GET and POST", () => {
    const route = appText("app/api/workspace/sandbox-run/route.js");
    expect(route).toMatch(/export\s*\{[^}]*GET[^}]*POST[^}]*\}/);
  });

  it("normalizeRunConsoleRecord normalises a successful run", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-console.js")}?t=${Date.now()}`
    ) as {
      normalizeRunConsoleRecord: (r: unknown) => {
        runId: string;
        status: string;
        ok: boolean;
        durationMs: number | null;
        logTree: Array<{ id: string; children: unknown[] }>;
        lifecycle: Array<{ label: string }>;
      } | null;
    };
    const record = mod.normalizeRunConsoleRecord({
      runId: "run-ok-1",
      exitCode: 0,
      durationMs: 250,
      ranAt: "2026-05-21T19:28:07.906Z",
      runtime: "node",
      adapter: "local-process",
      stdout: "hello",
      output: { items: [{ id: 1 }] },
    });
    expect(record).not.toBeNull();
    expect(record!.runId).toBe("run-ok-1");
    expect(record!.status).toBe("completed");
    expect(record!.ok).toBe(true);
    expect(record!.durationMs).toBe(250);
    expect(record!.logTree).toHaveLength(1);
    expect(record!.lifecycle.map((l) => l.label)).toEqual([
      "Triggered",
      "Dequeued",
      "Started",
      "Finished",
    ]);
  });

  it("normalizeRunConsoleRecord marks failed runs", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-console.js")}?t=${Date.now()}`
    ) as {
      normalizeRunConsoleRecord: (r: unknown) => { status: string; ok: boolean; output: { error: string } } | null;
    };
    const record = mod.normalizeRunConsoleRecord({
      runId: "run-fail-1",
      exitCode: 1,
      durationMs: 50,
      ranAt: "2026-05-21T19:28:07.906Z",
      stdout: "Not logged in",
      error: "exit 1",
    });
    expect(record).not.toBeNull();
    expect(record!.status).toBe("failed");
    expect(record!.ok).toBe(false);
    expect(record!.output.error).toContain("exit 1");
  });

  it("buildRunLogTree returns a root with attempt and stream nodes", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-console.js")}?t=${Date.now()}`
    ) as {
      buildRunLogTree: (r: unknown) => Array<{
        id: string;
        children: Array<{ id: string; children: Array<{ id: string }> }>;
      }>;
    };
    const tree = mod.buildRunLogTree({
      runId: "run-1",
      exitCode: 0,
      durationMs: 100,
      ranAt: "2026-05-21T19:28:07.906Z",
      stdout: "ok",
      stderr: "warn",
      adapterMeta: { httpStatus: 200 },
    });
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("root");
    expect(tree[0].children).toHaveLength(1);
    const attempt = tree[0].children[0];
    expect(attempt.id).toBe("attempt-1");
    const childIds = attempt.children.map((c) => c.id);
    expect(childIds).toContain("stdout");
    expect(childIds).toContain("stderr");
    expect(childIds).toContain("adapter-meta");
  });

  it("filterRunLogTree honours search query and errors-only flag", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-console.js")}?t=${Date.now()}`
    ) as {
      buildRunLogTree: (r: unknown) => unknown[];
      filterRunLogTree: (t: unknown[], opts: { query?: string; errorsOnly?: boolean }) => unknown[];
    };
    const tree = mod.buildRunLogTree({
      runId: "run-1",
      exitCode: 1,
      durationMs: 100,
      ranAt: "2026-05-21T19:28:07.906Z",
      stdout: "Not logged in · Please run /login",
      stderr: "boom",
      error: "exit 1",
    });
    const queried = mod.filterRunLogTree(tree, { query: "boom" }) as Array<{ children: Array<{ children: unknown[] }> }>;
    expect(queried).toHaveLength(1);
    const errorsOnly = mod.filterRunLogTree(tree, { errorsOnly: true }) as Array<{ children: Array<{ children: Array<{ id: string }> }> }>;
    expect(errorsOnly).toHaveLength(1);
    const childIds = errorsOnly[0].children[0].children.map((c) => c.id);
    expect(childIds).toContain("error");
    expect(childIds).toContain("stderr");
    expect(childIds).not.toContain("stdout");
  });

  it("normalizeRunConsoleRecord redacts secret-looking text", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-console.js")}?t=${Date.now()}`
    ) as {
      normalizeRunConsoleRecord: (r: unknown) => { output: { stdout: string } } | null;
    };
    const record = mod.normalizeRunConsoleRecord({
      runId: "run-1",
      exitCode: 0,
      durationMs: 50,
      ranAt: "2026-05-21T19:28:07.906Z",
      stdout: 'Authorization: Bearer abc123 api_key="topsecret"',
    });
    expect(record!.output.stdout).toContain("[redacted]");
    expect(record!.output.stdout).not.toContain("abc123");
    expect(record!.output.stdout).not.toContain("topsecret");
  });

  it("downloadRunBundle wraps a redacted record in the v1 envelope", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-console.js")}?t=${Date.now()}`
    ) as {
      downloadRunBundle: (i: { record: unknown; runId?: string; sourceId?: string }) => {
        kind: string;
        runId: string;
        sourceId: string;
        record: { runId: string; output: { stdout: string } } | null;
      };
    };
    const bundle = mod.downloadRunBundle({
      record: {
        runId: "run-1",
        exitCode: 0,
        durationMs: 50,
        ranAt: "2026-05-21T19:28:07.906Z",
        stdout: "Bearer leak123",
      },
      runId: "run-1",
      sourceId: "sandbox:obj:row",
    });
    expect(bundle.kind).toBe("growthub-sandbox-run-log-v1");
    expect(bundle.runId).toBe("run-1");
    expect(bundle.sourceId).toBe("sandbox:obj:row");
    expect(bundle.record!.output.stdout).not.toContain("leak123");
  });

  it("buildRunTimeline ratios runs against the longest", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-console.js")}?t=${Date.now()}`
    ) as {
      buildRunTimeline: (records: unknown[]) => Array<{ runId: string; barRatio: number; durationMs: number }>;
    };
    const items = mod.buildRunTimeline([
      { runId: "run-a", exitCode: 0, durationMs: 500, ranAt: "2026-05-21T19:00:00.000Z" },
      { runId: "run-b", exitCode: 0, durationMs: 1000, ranAt: "2026-05-21T19:00:01.000Z" },
    ]);
    expect(items).toHaveLength(2);
    const b = items.find((i) => i.runId === "run-b")!;
    const a = items.find((i) => i.runId === "run-a")!;
    expect(b.barRatio).toBe(1);
    expect(a.barRatio).toBeCloseTo(0.5);
  });

  it("OrchestrationRunTracePanel exposes the live console controls", () => {
    const panel = appText("app/data-model/components/OrchestrationRunTracePanel.jsx");
    expect(panel).toContain("dm-run-console");
    expect(panel).toContain("Replay current config");
    expect(panel).toContain("Download logs");
    expect(panel).toContain("Cancel request");
    expect(panel).toContain("Live reloading");
    expect(panel).toContain("Errors only");
    expect(panel).toContain("Queue time");
    expect(panel).toContain("orchestration-run-console");
    expect(panel).toContain('Overview');
    expect(panel).toContain('Detail');
    expect(panel).toContain('Context');
  });

  it("normalizeRunRecord now surfaces runtime/adapter/locality", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-trace.js")}?t=${Date.now()}`
    ) as {
      normalizeRunRecord: (r: unknown) => {
        runtime: string;
        adapter: string;
        runLocality: string;
        adapterMeta: unknown;
      } | null;
    };
    const record = mod.normalizeRunRecord({
      runId: "run-1",
      runtime: "node",
      adapter: "local-process",
      runLocality: "local",
      adapterMeta: { httpStatus: 200 },
    });
    expect(record).not.toBeNull();
    expect(record!.runtime).toBe("node");
    expect(record!.adapter).toBe("local-process");
    expect(record!.runLocality).toBe("local");
    expect(record!.adapterMeta).toEqual({ httpStatus: 200 });
  });
});

// ---------------------------------------------------------------------------
// 10. Live Runs Console V2 — manual run inputs, redaction, route contract
// ---------------------------------------------------------------------------

describe("orchestration-run-inputs — manual input contract", () => {
  it("orchestration-run-inputs.js ships in apps/workspace/lib/", () => {
    expect(appExists("lib/orchestration-run-inputs.js")).toBe(true);
  });

  it("RunSetupPanel ships in app/workflows/", () => {
    expect(appExists("app/workflows/RunSetupPanel.jsx")).toBe(true);
  });

  it("discoverRunInputSchema finds form fields from human-input nodes", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-inputs.js")}?t=${Date.now()}`
    ) as {
      discoverRunInputSchema: (g: unknown) => {
        requiresInput: boolean;
        fields: Array<{ id: string; required: boolean; isSecret: boolean; type: string }>;
        kind: string;
      };
      RUN_INPUTS_KIND: string;
    };
    expect(mod.RUN_INPUTS_KIND).toBe("growthub-workflow-run-inputs-v1");
    const schema = mod.discoverRunInputSchema({
      version: 1,
      provider: "growthub-native",
      nodes: [
        {
          id: "form-1",
          type: "human-input",
          config: {
            action: "form",
            title: "Run inputs",
            required: true,
            fields: [
              { key: "companyName", value: "text" },
              { key: "email", value: "email" },
              { key: "apiKey", value: "secretRef" },
            ],
          },
        },
      ],
      edges: [],
    });
    expect(schema.requiresInput).toBe(true);
    expect(schema.fields.map((f) => f.id)).toEqual(["companyName", "email", "apiKey"]);
    const secretField = schema.fields.find((f) => f.id === "apiKey");
    expect(secretField?.isSecret).toBe(true);
    expect(secretField?.type).toBe("secretRef");
  });

  it("discoverRunInputSchema returns requiresInput=false when no form nodes", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-inputs.js")}?t=${Date.now()}`
    ) as { discoverRunInputSchema: (g: unknown) => { requiresInput: boolean; fields: unknown[] } };
    const schema = mod.discoverRunInputSchema({
      version: 1,
      provider: "growthub-native",
      nodes: [{ id: "input", type: "input" }],
      edges: [],
    });
    expect(schema.requiresInput).toBe(false);
    expect(schema.fields).toEqual([]);
  });

  it("validateRunInputsEnvelope flags missing required fields", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-inputs.js")}?t=${Date.now()}`
    ) as {
      discoverRunInputSchema: (g: unknown) => { fields: unknown[]; requiresInput: boolean };
      validateRunInputsEnvelope: (v: unknown, s: unknown) => { ok: boolean; missing: string[]; error?: string };
    };
    const schema = mod.discoverRunInputSchema({
      version: 1,
      provider: "growthub-native",
      nodes: [
        {
          id: "form-1",
          type: "human-input",
          config: { action: "form", required: true, fields: [{ key: "email", value: "email" }] },
        },
      ],
      edges: [],
    });
    const r = mod.validateRunInputsEnvelope({ values: {} }, schema);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("email");
  });

  it("normalizeRunInputsEnvelope redacts secret-typed fields", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-inputs.js")}?t=${Date.now()}`
    ) as {
      normalizeRunInputsEnvelope: (v: unknown, s: unknown) => { values: Record<string, unknown>; kind: string };
    };
    const env = mod.normalizeRunInputsEnvelope(
      {
        values: {
          companyName: "Acme",
          api_key: "leak-this-please",
          secretField: { secretRef: "OPENAI_API_KEY" },
        },
      },
      {
        fields: [
          { id: "companyName", type: "text", required: true, isSecret: false },
          { id: "api_key", type: "text", required: false, isSecret: true },
          { id: "secretField", type: "secretRef", required: false, isSecret: true },
        ],
      }
    );
    expect(env!.kind).toBe("growthub-workflow-run-inputs-v1");
    expect(env!.values.companyName).toBe("Acme");
    expect(env!.values.api_key).toEqual({ secretRef: "[redacted]" });
    expect(env!.values.secretField).toEqual({ secretRef: "OPENAI_API_KEY" });
    expect(JSON.stringify(env)).not.toContain("leak-this-please");
  });

  it("normalizeRunInputsEnvelope redacts bearer tokens inside string values", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-inputs.js")}?t=${Date.now()}`
    ) as {
      normalizeRunInputsEnvelope: (v: unknown, s: unknown) => { values: Record<string, unknown> };
    };
    const env = mod.normalizeRunInputsEnvelope(
      { values: { prompt: "Use Authorization: Bearer abc123 to call the api" } },
      { fields: [{ id: "prompt", type: "text", required: true, isSecret: false }] }
    );
    expect(String(env!.values.prompt)).toContain("[redacted]");
    expect(String(env!.values.prompt)).not.toContain("abc123");
  });

  it("validateRunInputsEnvelope rejects oversize field values", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-inputs.js")}?t=${Date.now()}`
    ) as {
      validateRunInputsEnvelope: (v: unknown, s: unknown) => { ok: boolean; error?: string };
      MAX_RUN_INPUT_FIELD_BYTES: number;
    };
    const oversize = "x".repeat(mod.MAX_RUN_INPUT_FIELD_BYTES + 1);
    const r = mod.validateRunInputsEnvelope({ values: { prompt: oversize } }, { fields: [{ id: "prompt", required: false }] });
    expect(r.ok).toBe(false);
    expect(String(r.error)).toMatch(/exceeds/);
  });

  it("buildInputPayloadForRunner skips secretRef values", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-inputs.js")}?t=${Date.now()}`
    ) as {
      buildInputPayloadForRunner: (e: unknown) => Record<string, unknown>;
    };
    const payload = mod.buildInputPayloadForRunner({
      values: { companyName: "Acme", token: { secretRef: "OPENAI_API_KEY" } },
    });
    expect(payload.companyName).toBe("Acme");
    expect("token" in payload).toBe(false);
  });

  it("sandbox-run route imports the run-inputs helper and validates", () => {
    const route = appText("app/api/workspace/sandbox-run/route.js");
    expect(route).toContain("orchestration-run-inputs");
    expect(route).toContain("discoverRunInputSchema");
    expect(route).toContain("normalizeRunInputsEnvelope");
    expect(route).toContain("validateRunInputsEnvelope");
    expect(route).toContain("runInputs");
  });

  it("orchestration-graph-runner accepts an optional runInputs param", () => {
    const runner = appText("lib/orchestration-graph-runner.js");
    expect(runner).toContain("runInputs");
    expect(runner).toContain("buildInputPayloadForRunner");
  });

  it("orchestration-run-console exposes inputs + exports on the normalized record", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-console.js")}?t=${Date.now()}`
    ) as {
      normalizeRunConsoleRecord: (r: unknown) => {
        payload: {
          runInputs: { values: Record<string, unknown> } | null;
          inputSource: string;
          inputFieldCount: number;
        };
        exports: { available: string[] };
      } | null;
    };
    const record = mod.normalizeRunConsoleRecord({
      runId: "run-with-inputs",
      exitCode: 0,
      durationMs: 50,
      ranAt: "2026-05-21T19:28:07.906Z",
      stdout: "ok",
      input: {
        kind: "growthub-workflow-run-inputs-v1",
        source: "manual",
        values: { companyName: "Acme" },
        files: [],
      },
    });
    expect(record).not.toBeNull();
    expect(record!.payload.runInputs?.values.companyName).toBe("Acme");
    expect(record!.payload.inputSource).toBe("manual");
    expect(record!.payload.inputFieldCount).toBe(1);
    expect(record!.exports.available).toContain("download-json");
    expect(record!.exports.available).toContain("copy-output");
  });

  it("orchestration-run-trace preserves redacted input metadata on records", async () => {
    const mod = await import(
      `file://${path.join(APP_ROOT, "lib/orchestration-run-trace.js")}?t=${Date.now()}`
    ) as {
      normalizeRunRecord: (r: unknown) => {
        input: { values: Record<string, unknown> } | null;
        inputSummary: { fieldCount: number } | null;
      } | null;
    };
    const record = mod.normalizeRunRecord({
      runId: "run-1",
      input: {
        kind: "growthub-workflow-run-inputs-v1",
        source: "manual",
        values: { email: "user@example.com" },
        files: [],
      },
    });
    expect(record!.input!.values.email).toBe("user@example.com");
    expect(record!.inputSummary!.fieldCount).toBe(1);
  });

  it("WorkflowSurface wires Test through handleTestClick and runSandbox accepts options", () => {
    const surface = appText("app/workflows/WorkflowSurface.jsx");
    expect(surface).toContain("RunSetupPanel");
    expect(surface).toContain("discoverRunInputSchema");
    expect(surface).toContain("handleTestClick");
    expect(surface).toContain("handleRunWithInputs");
    expect(surface).toContain("runSandbox(options = {})");
    expect(surface).toContain("body.runInputs");
  });

  it("OrchestrationRunTracePanel renders inputs and export actions", () => {
    const panel = appText("app/data-model/components/OrchestrationRunTracePanel.jsx");
    expect(panel).toContain("InputsSection");
    expect(panel).toContain("ExportActions");
    expect(panel).toContain("Copy output");
    expect(panel).toContain("Download stdout");
    expect(panel).toContain("Download stderr");
  });

  it("no browser-side secret persistence patterns introduced", () => {
    const surface = appText("app/workflows/WorkflowSurface.jsx");
    const panel = appText("app/workflows/RunSetupPanel.jsx");
    const trace = appText("app/data-model/components/OrchestrationRunTracePanel.jsx");
    for (const source of [surface, panel, trace]) {
      expect(source).not.toMatch(/localStorage\.setItem\([^)]*(token|secret|api_key|apiKey|password)/i);
      expect(source).not.toMatch(/sessionStorage\.setItem\([^)]*(token|secret|api_key|apiKey|password)/i);
    }
  });
});

// ---------------------------------------------------------------------------
// 11. Workspace Metadata Graph V1 — typed projection, graph builder, route
//
// The metadata graph is a derived read model over the governed workspace
// artifact. Tests here cover:
//   - file presence + frozen asset paths
//   - metadata store derivation (objects, fields, widgets, workflows, runs)
//   - graph node/edge construction + dependency traversal
//   - GET-only route surface, no secret persistence
// ---------------------------------------------------------------------------

describe("workspace-metadata-graph-v1 — file presence", () => {
  it("lib/workspace-metadata-store.js ships", () => {
    expect(appExists("lib/workspace-metadata-store.js")).toBe(true);
  });

  it("lib/workspace-metadata-graph.js ships", () => {
    expect(appExists("lib/workspace-metadata-graph.js")).toBe(true);
  });

  it("lib/workspace-metadata-selectors.js ships", () => {
    expect(appExists("lib/workspace-metadata-selectors.js")).toBe(true);
  });

  it("app/api/workspace/metadata-graph/route.js ships and is GET-only", () => {
    expect(appExists("app/api/workspace/metadata-graph/route.js")).toBe(true);
    const route = appText("app/api/workspace/metadata-graph/route.js");
    expect(route).toMatch(/export\s*\{[^}]*GET[^}]*\}/);
    expect(route).not.toMatch(/export\s+(?:async\s+)?function\s+(?:POST|PATCH|PUT|DELETE)\b/);
    expect(route).not.toMatch(/export\s*\{[^}]*\b(?:POST|PATCH|PUT|DELETE)\b[^}]*\}/);
  });

  it("WorkspaceGraphInspectorPanel.jsx ships", () => {
    expect(appExists("app/data-model/components/WorkspaceGraphInspectorPanel.jsx")).toBe(true);
    const panel = appText("app/data-model/components/WorkspaceGraphInspectorPanel.jsx");
    expect(panel).toContain("WorkspaceGraphInspectorPanel");
    expect(panel).toContain("/api/workspace/metadata-graph");
    expect(panel).toContain("findDependents");
    expect(panel).toContain("findDependencies");
  });
});

describe("workspace-metadata-graph-v1 — kit.json frozen paths", () => {
  const kitJson = JSON.parse(readText("kit.json"));
  const frozen: string[] = kitJson.frozenAssetPaths ?? [];
  const required = [
    "apps/workspace/lib/workspace-metadata-store.js",
    "apps/workspace/lib/workspace-metadata-graph.js",
    "apps/workspace/lib/workspace-metadata-selectors.js",
    "apps/workspace/app/api/workspace/metadata-graph/route.js",
    "apps/workspace/app/data-model/components/WorkspaceGraphInspectorPanel.jsx",
  ];
  for (const p of required) {
    it(`kit.json frozen asset paths include: ${p}`, () => {
      expect(frozen).toContain(p);
    });
  }
});

// ---------------------------------------------------------------------------
// Workspace Health & Agent Context V1 — read-only rollups built on the
// metadata store + graph. Coverage:
//   - file presence + frozen asset paths
//   - GET-only route surfaces, no write helper imports, no secret persistence
//   - health derivation (status rollup, stale/dangling/missing detection)
//   - agent context packet (summary, capabilities, critical state, entrypoints)
// ---------------------------------------------------------------------------

describe("workspace-health-agent-context-v1 — file presence", () => {
  it("lib/workspace-health.js ships", () => {
    expect(appExists("lib/workspace-health.js")).toBe(true);
  });

  it("app/api/workspace/health/route.js ships and is GET-only", () => {
    expect(appExists("app/api/workspace/health/route.js")).toBe(true);
    const route = appText("app/api/workspace/health/route.js");
    expect(route).toMatch(/export\s*\{[^}]*GET[^}]*\}/);
    expect(route).not.toMatch(/export\s+(?:async\s+)?function\s+(?:POST|PATCH|PUT|DELETE)\b/);
    expect(route).not.toMatch(/export\s*\{[^}]*\b(?:POST|PATCH|PUT|DELETE)\b[^}]*\}/);
  });

  it("app/api/workspace/agent-context/route.js ships and is GET-only", () => {
    expect(appExists("app/api/workspace/agent-context/route.js")).toBe(true);
    const route = appText("app/api/workspace/agent-context/route.js");
    expect(route).toMatch(/export\s*\{[^}]*GET[^}]*\}/);
    expect(route).not.toMatch(/export\s+(?:async\s+)?function\s+(?:POST|PATCH|PUT|DELETE)\b/);
    expect(route).not.toMatch(/export\s*\{[^}]*\b(?:POST|PATCH|PUT|DELETE)\b[^}]*\}/);
  });

  it("health + agent-context routes import only read helpers (no write lane)", () => {
    for (const rel of ["app/api/workspace/health/route.js", "app/api/workspace/agent-context/route.js"]) {
      const route = appText(rel);
      expect(route).toContain("@/lib/workspace-health");
      expect(route).toContain("readWorkspaceConfig");
      expect(route).not.toContain("applyWorkspaceConfigPatch");
      expect(route).not.toMatch(/writeWorkspaceConfig|persistWorkspace/);
    }
  });
});

describe("workspace-health-agent-context-v1 — kit.json frozen paths", () => {
  const kitJson = JSON.parse(readText("kit.json"));
  const frozen: string[] = kitJson.frozenAssetPaths ?? [];
  const required = [
    "apps/workspace/lib/workspace-health.js",
    "apps/workspace/app/api/workspace/health/route.js",
    "apps/workspace/app/api/workspace/agent-context/route.js",
  ];
  for (const p of required) {
    it(`kit.json frozen asset paths include: ${p}`, () => {
      expect(frozen).toContain(p);
    });
  }
});

describe("workspace-health-agent-context-v1 — derivation", () => {
  type Health = {
    kind: string;
    version: number;
    status: string;
    issues: Array<{ type: string; severity: string; widgetId?: string; reason: string }>;
    metrics: Record<string, number | string>;
  };
  type Packet = {
    kind: string;
    version: number;
    summary: { name: string; objects: number; widgets: number };
    capabilities: string[];
    health: { status: string; issueCount: number };
    criticalState: {
      staleWidgets: unknown[];
      missingSources: unknown[];
      danglingEdges: unknown[];
      unhealthyPipelines: unknown[];
    };
    entrypoints: { dataModel: string; api: string; health: string; dashboards: unknown[] };
  };

  let buildStore: (input: unknown) => unknown;
  let buildGraph: (store: unknown) => unknown;
  let deriveWorkspaceHealth: (store: unknown, graph: unknown) => Health;
  let deriveAgentContextPacket: (store: unknown, graph: unknown, health: unknown, config: unknown) => Packet;

  beforeEach(async () => {
    const storeMod = await import(`file://${path.join(APP_ROOT, "lib/workspace-metadata-store.js")}?t=${Date.now()}`);
    const graphMod = await import(`file://${path.join(APP_ROOT, "lib/workspace-metadata-graph.js")}?t=${Date.now()}`);
    const healthMod = await import(`file://${path.join(APP_ROOT, "lib/workspace-health.js")}?t=${Date.now()}`);
    buildStore = storeMod.buildWorkspaceMetadataStore;
    buildGraph = graphMod.buildWorkspaceMetadataGraph;
    deriveWorkspaceHealth = healthMod.deriveWorkspaceHealth;
    deriveAgentContextPacket = healthMod.deriveAgentContextPacket;
  });

  const issueConfig = () => ({
    name: "Kit Workspace",
    dashboards: [
      {
        id: "dash-1",
        name: "Ops",
        tabs: [
          {
            id: "t1",
            name: "Tab",
            widgets: [
              { id: "w-stale", kind: "chart", title: "Stale", config: { binding: { sourceType: "workspace-data-model", objectId: "leads" } } },
              { id: "w-dangle", kind: "chart", title: "Dangle", config: { binding: { sourceType: "workspace-data-model", objectId: "ghost" }, xAxis: { field: "a" }, yAxis: { field: "b", operation: "sum" } } },
            ],
          },
        ],
      },
    ],
    dataModel: {
      objects: [
        { id: "leads", label: "Leads", objectType: "custom", columns: ["stage", "amount"], binding: { sourceStorage: "workspace-source-records", sourceId: "leads-src" } },
      ],
    },
  });

  it("derives a typed health envelope with status rollup", () => {
    const store = buildStore({ workspaceConfig: issueConfig(), workspaceSourceRecords: {} });
    const graph = buildGraph(store);
    const health = deriveWorkspaceHealth(store, graph);
    expect(health.kind).toBe("growthub-workspace-health-v1");
    expect(health.version).toBe(1);
    expect(["healthy", "degraded", "unhealthy"]).toContain(health.status);
    const types = health.issues.map((i) => i.type);
    expect(types).toContain("dangling_edge");
    expect(types).toContain("stale_widget");
  });

  it("never throws on empty input and reports a healthy baseline", () => {
    const health = deriveWorkspaceHealth(undefined, undefined);
    expect(health.status).toBe("healthy");
    expect(health.issues).toEqual([]);
  });

  it("derives an agent context packet with summary, capabilities, and entrypoints", () => {
    const config = issueConfig();
    const store = buildStore({ workspaceConfig: config, workspaceSourceRecords: {} });
    const graph = buildGraph(store);
    const health = deriveWorkspaceHealth(store, graph);
    const packet = deriveAgentContextPacket(store, graph, health, config);
    expect(packet.kind).toBe("growthub-workspace-agent-context-v1");
    expect(packet.summary.name).toBe("Kit Workspace");
    expect(packet.capabilities).toContain("dashboards");
    expect(packet.entrypoints.api).toBe("/api/workspace");
    expect(packet.entrypoints.health).toBe("/api/workspace/health");
    expect(packet.criticalState.danglingEdges.length).toBeGreaterThan(0);
  });
});

describe("workspace-metadata-store — derivation", () => {
  type MetadataStore = {
    kind: string;
    version: number;
    objects: Array<{ id: string; metadataId: string; isLiveBacked: boolean; objectType: string; columns: string[] }>;
    fields: Array<{ id: string; objectId: string; type: string; isNumeric: boolean; isSecret: boolean; isWritable: boolean; isFilterable: boolean; isSortable: boolean }>;
    widgets: Array<{ id: string; objectId: string; requiredFields: string[]; filterFields: string[]; sortFields: string[]; operation: string; isLiveBacked: boolean; warnings: string[] }>;
    dashboards: Array<{ id: string; widgetIds: string[]; widgetCount: number }>;
    workflows: Array<{ id: string; objectId: string; rowId: string; nodeCount: number; requiresInput: boolean }>;
    workflowNodes: Array<{ id: string; workflowMetadataId: string; nodeType: string }>;
    runInputs: Array<{ id: string; isSecret: boolean; required: boolean }>;
    sandboxes: Array<{ id: string; adapter: string; agentHost: string; runLocality: string }>;
    agentHosts: Array<{ id: string; adapters: string[]; sandboxMetadataIds: string[] }>;
    integrations: Array<{ id: string }>;
    integrationEntities: Array<{ id: string; integrationId: string }>;
    sourceRecords: Array<{ id: string; recordCount: number }>;
    runs: Array<{ runId: string; ok: boolean; exitCode: number | null; inputFieldCount: number }>;
    outputArtifacts: Array<{ runMetadataId: string; promotable: boolean }>;
    warnings: string[];
  };

  let buildWorkspaceMetadataStore: (input: unknown) => MetadataStore;

  beforeEach(async () => {
    const modPath = path.join(APP_ROOT, "lib/workspace-metadata-store.js");
    const mod = await import(`file://${modPath}?t=${Date.now()}`) as {
      buildWorkspaceMetadataStore: typeof buildWorkspaceMetadataStore;
    };
    buildWorkspaceMetadataStore = mod.buildWorkspaceMetadataStore;
  });

  it("returns a typed envelope with the V1 kind and version", () => {
    const store = buildWorkspaceMetadataStore({});
    expect(store.kind).toBe("growthub-workspace-metadata-store-v1");
    expect(store.version).toBe(1);
    expect(Array.isArray(store.objects)).toBe(true);
    expect(Array.isArray(store.fields)).toBe(true);
    expect(Array.isArray(store.widgets)).toBe(true);
    expect(Array.isArray(store.warnings)).toBe(true);
  });

  it("derives object + field metadata with stable metadataIds and inferred types", () => {
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          objects: [{
            id: "opps",
            label: "Opportunities",
            objectType: "custom",
            columns: ["name", "arr", "closeDate"],
            rows: [
              { name: "Acme", arr: 100, closeDate: "2026-05-01" },
              { name: "Beta", arr: 250, closeDate: "2026-05-15" },
            ],
            binding: { mode: "manual", source: "Opportunities" },
          }],
        },
      },
    });
    expect(store.objects).toHaveLength(1);
    expect(store.objects[0]).toMatchObject({ id: "opps", isLiveBacked: false, objectType: "custom" });
    expect(store.objects[0].metadataId).toContain("object:opps");
    const types = Object.fromEntries(store.fields.filter((f) => f.objectId === "opps").map((f) => [f.id, f.type]));
    expect(types.arr).toBe("number");
    expect(types.closeDate).toBe("date");
    expect(types.name).toBe("text");
    const arrField = store.fields.find((f) => f.objectId === "opps" && f.id === "arr")!;
    expect(arrField.isNumeric).toBe(true);
    expect(arrField.isWritable).toBe(true);
    expect(arrField.isSecret).toBe(false);
  });

  it("flags secret-shaped fields as isSecret + non-writable", () => {
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          objects: [{
            id: "creds",
            label: "Creds",
            columns: ["name", "apiKey", "accessToken"],
            rows: [{ name: "x", apiKey: "secret-1", accessToken: "secret-2" }],
            binding: { mode: "manual", source: "Creds" },
          }],
        },
      },
    });
    const apiKey = store.fields.find((f) => f.id === "apiKey");
    const accessToken = store.fields.find((f) => f.id === "accessToken");
    expect(apiKey!.isSecret).toBe(true);
    expect(apiKey!.isFilterable).toBe(false);
    expect(apiKey!.isSortable).toBe(false);
    expect(apiKey!.isWritable).toBe(false);
    expect(accessToken!.isSecret).toBe(true);
    // Metadata graph must NEVER carry the raw secret value anywhere.
    expect(JSON.stringify(store)).not.toContain("secret-1");
    expect(JSON.stringify(store)).not.toContain("secret-2");
  });

  it("derives widget dependency contract (required/filter/sort/aggregation fields)", () => {
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          objects: [{
            id: "pipeline",
            label: "Pipeline",
            columns: ["stage", "arr"],
            rows: [{ stage: "lead", arr: 100 }, { stage: "won", arr: 200 }],
            binding: { mode: "manual", source: "Pipeline" },
          }],
        },
        canvas: {
          layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
          widgets: [{
            id: "wc",
            kind: "chart",
            title: "Pipeline ARR",
            position: { x: 0, y: 0, w: 6, h: 5 },
            config: {
              values: [100, 200],
              xAxis: { field: "stage", sort: "asc" },
              yAxis: { field: "arr", aggregation: "sum" },
              filter: { op: "and", clauses: [{ fieldId: "stage", operator: "eq", value: "won" }] },
              binding: { sourceType: "workspace-data-model", objectId: "pipeline", mode: "manual", source: "Pipeline" },
            },
          }],
        },
      },
    });
    expect(store.widgets).toHaveLength(1);
    const widget = store.widgets[0];
    expect(widget.objectId).toBe("pipeline");
    expect(widget.requiredFields).toEqual(expect.arrayContaining(["stage", "arr"]));
    expect(widget.filterFields).toEqual(["stage"]);
    expect(widget.sortFields).toEqual(["stage"]);
    expect(widget.operation).toBe("sum");
    expect(widget.warnings).toEqual([]);
  });

  it("derives workflow + node + runInput metadata for a sandbox-environment row", () => {
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          objects: [{
            id: "sandbox-env",
            objectType: "sandbox-environment",
            label: "Sandbox Environments",
            columns: ["Name", "adapter", "agentHost", "runLocality", "orchestrationGraph"],
            rows: [{
              Name: "LeadShark Tool",
              adapter: "local-agent-host",
              agentHost: "claude_local",
              runLocality: "local",
              lifecycleStatus: "live",
              version: "2",
              orchestrationGraph: JSON.stringify({
                version: 1,
                provider: "growthub-native",
                nodes: [
                  { id: "input", type: "input", config: {} },
                  { id: "form", type: "human-input", config: { action: "form", required: true, fields: [{ key: "companyName", value: "text" }, { key: "apiKey", value: "secretRef" }] } },
                  { id: "api", type: "api-registry-call", config: { integrationId: "leadshark" } },
                  { id: "out", type: "tool-result", config: {} },
                ],
                edges: [],
              }),
            }],
          }],
        },
      },
    });
    expect(store.workflows).toHaveLength(1);
    expect(store.workflows[0].rowId).toBe("LeadShark Tool");
    expect(store.workflows[0].nodeCount).toBe(4);
    expect(store.workflows[0].requiresInput).toBe(true);

    const formNode = store.workflowNodes.find((n) => n.id === "form")!;
    expect(formNode.nodeType).toBe("human-input");

    expect(store.runInputs.map((r) => r.id)).toEqual(expect.arrayContaining(["companyName", "apiKey"]));
    const secretField = store.runInputs.find((r) => r.id === "apiKey")!;
    expect(secretField.isSecret).toBe(true);

    expect(store.sandboxes).toHaveLength(1);
    expect(store.sandboxes[0].agentHost).toBe("claude_local");
    expect(store.agentHosts.find((h) => h.id === "claude_local")!.adapters).toContain("local-agent-host");
  });

  it("hides workspace-helper-sandbox object from the public projection", () => {
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          objects: [{
            id: "workspace-helper-sandbox",
            objectType: "sandbox-environment",
            label: "Hidden",
            columns: ["Name"],
            rows: [{ Name: "Helper" }],
          }],
        },
      },
    });
    expect(store.objects.find((o) => o.id === "workspace-helper-sandbox")).toBeUndefined();
    expect(store.sandboxes).toHaveLength(0);
    expect(store.workflows).toHaveLength(0);
  });

  it("derives source record metadata from the workspaceSourceRecords sidecar", () => {
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          objects: [{
            id: "src_crm",
            label: "CRM",
            objectType: "data-source",
            columns: ["name"],
            rows: [],
            sourceId: "src_crm",
            binding: { mode: "integration", sourceStorage: "workspace-source-records", sourceId: "src_crm", integrationId: "my-crm" },
          }],
        },
      },
      workspaceSourceRecords: {
        src_crm: { records: [{ name: "Acme" }], fetchedAt: "2026-05-01T00:00:00Z", recordCount: 1, integrationId: "my-crm" },
      },
    });
    expect(store.objects.find((o) => o.id === "src_crm")!.isLiveBacked).toBe(true);
    const sourceRecord = store.sourceRecords.find((r) => r.id === "src_crm");
    expect(sourceRecord).toBeDefined();
    expect(sourceRecord!.recordCount).toBe(1);
  });

  it("derives runs + output artifacts from row.lastResponse", () => {
    const lastResponse = JSON.stringify({
      runId: "run-42",
      exitCode: 0,
      durationMs: 250,
      ranAt: "2026-05-21T19:28:07.906Z",
      runtime: "node",
      adapter: "local-agent-host",
      runLocality: "local",
      stdout: "ok",
      output: { items: [{ id: 1 }] },
      input: { kind: "growthub-workflow-run-inputs-v1", source: "manual", values: { companyName: "Acme" }, files: [] },
    });
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          objects: [{
            id: "sandbox-env",
            objectType: "sandbox-environment",
            columns: ["Name"],
            rows: [{ Name: "LeadShark Tool", agentHost: "claude_local", adapter: "local-agent-host", runLocality: "local", lastResponse }],
          }],
        },
      },
    });
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0].runId).toBe("run-42");
    expect(store.runs[0].ok).toBe(true);
    expect(store.runs[0].inputFieldCount).toBe(1);
    expect(store.outputArtifacts).toHaveLength(1);
    expect(store.outputArtifacts[0].promotable).toBe(true);
  });

  it("never throws on empty / unknown / partial input", () => {
    expect(() => buildWorkspaceMetadataStore(undefined)).not.toThrow();
    expect(() => buildWorkspaceMetadataStore({})).not.toThrow();
    expect(() => buildWorkspaceMetadataStore({ workspaceConfig: { dataModel: { objects: [{ id: "" }] } } })).not.toThrow();
    const store = buildWorkspaceMetadataStore({ workspaceConfig: { dataModel: { objects: [{ id: "" }, { id: "ok", columns: ["a"], rows: [{ a: 1 }] }] } } });
    expect(store.warnings.some((w) => w.includes("without id"))).toBe(true);
    expect(store.objects.find((o) => o.id === "ok")).toBeDefined();
  });

  it("never contains secret-shaped values in the JSON output", () => {
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          objects: [{
            id: "sandbox-env",
            objectType: "sandbox-environment",
            columns: ["Name", "accessToken"],
            rows: [{ Name: "x", agentHost: "claude_local", adapter: "local-agent-host", runLocality: "local" }],
          }],
        },
      },
    });
    const json = JSON.stringify(store);
    expect(json).not.toMatch(/sk-ant-/);
    expect(json).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{8,}/);
    expect(json).not.toMatch(/access_token\s*[:=]\s*['"][A-Za-z0-9._-]{8,}/i);
  });
});

describe("workspace-metadata-graph — node + edge construction", () => {
  type Graph = {
    kind: string;
    version: number;
    nodes: Array<{ id: string; type: string; label: string; metadataId: string; summary: Record<string, unknown> }>;
    edges: Array<{ id: string; from: string; to: string; relation: string; fromType: string; toType: string }>;
    warnings: string[];
  };
  let buildWorkspaceMetadataStore: (input: unknown) => unknown;
  let buildWorkspaceMetadataGraph: (store: unknown) => Graph;
  let findDependents: (graph: Graph, id: string) => Array<{ node: { id: string; type: string }; relation: string }>;
  let findDependencies: (graph: Graph, id: string) => Array<{ node: { id: string; type: string }; relation: string }>;

  beforeEach(async () => {
    const storeMod = await import(`file://${path.join(APP_ROOT, "lib/workspace-metadata-store.js")}?t=${Date.now()}`) as { buildWorkspaceMetadataStore: typeof buildWorkspaceMetadataStore };
    const graphMod = await import(`file://${path.join(APP_ROOT, "lib/workspace-metadata-graph.js")}?t=${Date.now()}`) as {
      buildWorkspaceMetadataGraph: typeof buildWorkspaceMetadataGraph;
      findDependents: typeof findDependents;
      findDependencies: typeof findDependencies;
    };
    buildWorkspaceMetadataStore = storeMod.buildWorkspaceMetadataStore;
    buildWorkspaceMetadataGraph = graphMod.buildWorkspaceMetadataGraph;
    findDependents = graphMod.findDependents;
    findDependencies = graphMod.findDependencies;
  });

  function buildFixture(): Graph {
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          objects: [
            {
              id: "pipeline",
              label: "Pipeline",
              columns: ["stage", "arr"],
              rows: [{ stage: "lead", arr: 100 }, { stage: "won", arr: 200 }],
              binding: { mode: "manual", source: "Pipeline" },
            },
            {
              id: "sandbox-env",
              objectType: "sandbox-environment",
              columns: ["Name"],
              rows: [{
                Name: "LeadShark Tool",
                adapter: "local-agent-host",
                agentHost: "claude_local",
                runLocality: "local",
                lifecycleStatus: "live",
                orchestrationGraph: JSON.stringify({
                  version: 1,
                  provider: "growthub-native",
                  nodes: [
                    { id: "input", type: "input", config: { sourceId: "pipeline" } },
                    { id: "api", type: "api-registry-call", config: { integrationId: "leadshark" } },
                    { id: "out", type: "tool-result" },
                  ],
                  edges: [],
                }),
              }],
            },
          ],
        },
        canvas: {
          layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
          widgets: [{
            id: "wc",
            kind: "chart",
            title: "ARR by stage",
            position: { x: 0, y: 0, w: 6, h: 5 },
            config: {
              values: [100, 200],
              xAxis: { field: "stage" },
              yAxis: { field: "arr", aggregation: "sum" },
              binding: { sourceType: "workspace-data-model", objectId: "pipeline" },
            },
          }],
        },
      },
    });
    return buildWorkspaceMetadataGraph(store);
  }

  it("returns a typed envelope with deterministic node + edge IDs", () => {
    const graph = buildFixture();
    expect(graph.kind).toBe("growthub-workspace-metadata-graph-v1");
    expect(graph.version).toBe(1);
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
    const ids = new Set(graph.nodes.map((n) => n.id));
    expect(ids.size).toBe(graph.nodes.length);
    for (const edge of graph.edges) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
    }
  });

  it("emits widget→object bindsToObject and widget→field usesField edges", () => {
    const graph = buildFixture();
    const widget = graph.nodes.find((n) => n.type === "widget")!;
    const deps = findDependencies(graph, widget.id);
    const relations = deps.map((d) => d.relation);
    expect(relations).toContain("bindsToObject");
    expect(relations).toContain("usesField");
  });

  it("emits workflow→workflowNode containsNode and workflow→sandbox usesSandbox edges", () => {
    const graph = buildFixture();
    const workflow = graph.nodes.find((n) => n.type === "workflow")!;
    const deps = findDependencies(graph, workflow.id);
    const relations = deps.map((d) => d.relation);
    expect(relations).toContain("containsNode");
    expect(relations).toContain("usesSandbox");
  });

  it("emits sandbox→agentHost usesAgentHost edge", () => {
    const graph = buildFixture();
    const sandbox = graph.nodes.find((n) => n.type === "sandbox")!;
    const deps = findDependencies(graph, sandbox.id);
    expect(deps.some((d) => d.relation === "usesAgentHost")).toBe(true);
  });

  it("findDependents returns incoming-edge neighbours (widgets / nodes that read a field)", () => {
    const graph = buildFixture();
    const arrField = graph.nodes.find((n) => n.type === "field" && n.summary?.objectId === "pipeline" && n.label === "arr")!;
    const dependents = findDependents(graph, arrField.id);
    expect(dependents.length).toBeGreaterThan(0);
    expect(dependents.some((d) => d.relation === "usesField")).toBe(true);
  });

  it("never produces dangling edges — every endpoint resolves to an existing node", () => {
    const graph = buildFixture();
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    }
  });
});

describe("workspace-metadata-selectors — typed contracts", () => {
  type Store = {
    objects: Array<{ id: string }>;
    fields: unknown[];
    widgets: Array<{ id: string; metadataId: string; objectId: string; requiredFields: string[]; filterFields: string[]; sortFields: string[]; aggregationFields: string[]; warnings: string[]; sourceRecordKey: string }>;
    workflows: unknown[];
    workflowNodes: Array<{ id: string; metadataId: string; workflowMetadataId: string; readsObjectId: string; writesObjectId: string; requiresHumanInput: boolean }>;
    runInputs: Array<{ id: string; workflowMetadataId: string; required: boolean; isSecret: boolean }>;
    sandboxes: unknown[];
    agentHosts: Array<{ id: string }>;
    runs: Array<{ runId: string; metadataId: string; workflowMetadataId: string; sandboxMetadataId: string; agentHost: string; inputFieldCount: number }>;
    outputArtifacts: Array<{ runMetadataId: string }>;
    sourceRecords: unknown[];
    integrations: unknown[];
    integrationEntities: unknown[];
  };
  let buildWorkspaceMetadataStore: (input: unknown) => Store;
  let selectWidgetRequiredFields: (s: Store, id: string) => { required: string[]; filter: string[]; sort: string[]; aggregation: string[]; warnings: string[] };
  let selectObjectFilterableFields: (s: Store, id: string) => Array<{ id: string }>;
  let selectObjectSortableFields: (s: Store, id: string) => Array<{ id: string }>;
  let selectStaleMetadataGroups: (s: Store, change: { kind: string; id: string }) => { groups: string[]; reasons: string[] };
  let selectRunLineage: (s: Store, runId: string) => { run: unknown; workflow: unknown; sandbox: unknown; agentHost: unknown; artifacts: unknown[] } | null;

  beforeEach(async () => {
    const storeMod = await import(`file://${path.join(APP_ROOT, "lib/workspace-metadata-store.js")}?t=${Date.now()}`) as {
      buildWorkspaceMetadataStore: typeof buildWorkspaceMetadataStore;
    };
    const selectorsMod = await import(`file://${path.join(APP_ROOT, "lib/workspace-metadata-selectors.js")}?t=${Date.now()}`) as {
      selectWidgetRequiredFields: typeof selectWidgetRequiredFields;
      selectObjectFilterableFields: typeof selectObjectFilterableFields;
      selectObjectSortableFields: typeof selectObjectSortableFields;
      selectStaleMetadataGroups: typeof selectStaleMetadataGroups;
      selectRunLineage: typeof selectRunLineage;
    };
    buildWorkspaceMetadataStore = storeMod.buildWorkspaceMetadataStore;
    selectWidgetRequiredFields = selectorsMod.selectWidgetRequiredFields;
    selectObjectFilterableFields = selectorsMod.selectObjectFilterableFields;
    selectObjectSortableFields = selectorsMod.selectObjectSortableFields;
    selectStaleMetadataGroups = selectorsMod.selectStaleMetadataGroups;
    selectRunLineage = selectorsMod.selectRunLineage;
  });

  function fixtureStore(): Store {
    return buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          objects: [
            {
              id: "pipeline",
              label: "Pipeline",
              columns: ["stage", "arr", "createdAt"],
              rows: [{ stage: "lead", arr: 100, createdAt: "2026-05-01" }],
              binding: { mode: "manual", source: "Pipeline" },
            },
            {
              id: "sandbox-env",
              objectType: "sandbox-environment",
              columns: ["Name"],
              rows: [{
                Name: "Tool",
                adapter: "local-agent-host",
                agentHost: "claude_local",
                runLocality: "local",
                lastResponse: JSON.stringify({
                  runId: "run-99",
                  exitCode: 0,
                  durationMs: 100,
                  ranAt: "2026-05-21T19:28:07.906Z",
                  stdout: "ok",
                  output: { items: [] },
                  adapter: "local-agent-host",
                  agentHost: "claude_local",
                }),
                orchestrationGraph: JSON.stringify({
                  version: 1,
                  provider: "growthub-native",
                  nodes: [{ id: "in", type: "input", config: { sourceId: "pipeline" } }, { id: "out", type: "tool-result" }],
                  edges: [],
                }),
              }],
            },
          ],
        },
        canvas: {
          layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
          widgets: [{
            id: "wc",
            kind: "chart",
            title: "Pipeline ARR",
            position: { x: 0, y: 0, w: 6, h: 5 },
            config: {
              values: [100],
              xAxis: { field: "stage" },
              yAxis: { field: "arr", aggregation: "sum" },
              filter: { op: "and", clauses: [{ fieldId: "stage", operator: "eq", value: "won" }] },
              binding: { sourceType: "workspace-data-model", objectId: "pipeline" },
            },
          }],
        },
      },
    });
  }

  it("selectWidgetRequiredFields returns typed required/filter/sort/aggregation lists", () => {
    const store = fixtureStore();
    const result = selectWidgetRequiredFields(store, "wc");
    expect(result.required).toEqual(expect.arrayContaining(["stage", "arr"]));
    expect(result.filter).toEqual(["stage"]);
    expect(result.sort).toEqual(["stage"]);
    expect(result.aggregation).toEqual(["arr"]);
    expect(result.warnings).toEqual([]);
  });

  it("selectObjectFilterableFields excludes secret-shaped fields", () => {
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          objects: [{
            id: "creds",
            columns: ["name", "apiKey"],
            rows: [{ name: "x", apiKey: "y" }],
            binding: { mode: "manual", source: "Creds" },
          }],
        },
      },
    });
    const fields = selectObjectFilterableFields(store, "creds");
    expect(fields.map((f) => f.id)).toEqual(["name"]);
  });

  it("selectStaleMetadataGroups flags widget + dashboard groups when a field changes", () => {
    const store = fixtureStore();
    const stale = selectStaleMetadataGroups(store, { kind: "field", id: "pipeline::arr" });
    expect(stale.groups).toEqual(expect.arrayContaining(["workspaceWidgetMetadataItems", "workspaceDashboardMetadataItems"]));
    expect(stale.reasons.length).toBeGreaterThan(0);
  });

  it("selectStaleMetadataGroups returns empty groups for unrelated changes", () => {
    const store = fixtureStore();
    const stale = selectStaleMetadataGroups(store, { kind: "field", id: "unknown::field" });
    expect(stale.groups).toEqual([]);
  });

  it("selectRunLineage returns workflow + sandbox + agent host for a run", () => {
    const store = fixtureStore();
    const lineage = selectRunLineage(store, "run-99");
    expect(lineage).not.toBeNull();
    expect(lineage!.workflow).toBeTruthy();
    expect(lineage!.sandbox).toBeTruthy();
    expect(lineage!.agentHost).toBeTruthy();
  });
});

describe("metadata-graph route — invariants", () => {
  it("route depends only on read helpers (no PATCH/POST imports)", () => {
    const route = appText("app/api/workspace/metadata-graph/route.js");
    expect(route).toContain("readWorkspaceConfig");
    expect(route).toContain("readWorkspaceSourceRecords");
    expect(route).toContain("buildWorkspaceMetadataStore");
    expect(route).toContain("buildWorkspaceMetadataGraph");
    expect(route).not.toContain("writeWorkspaceConfig");
    expect(route).not.toContain("writeWorkspaceSourceRecords");
  });

  it("response envelope mentions the v1 kind, version, and authority pointers", () => {
    const route = appText("app/api/workspace/metadata-graph/route.js");
    expect(route).toContain("growthub-workspace-metadata-graph-v1");
    expect(route).toContain("growthub.config.json");
    expect(route).toContain("growthub.source-records.json");
    expect(route).toContain("readOnlyProjection: true");
  });

  it("no secret persistence or browser-side secret patterns introduced in metadata graph modules", () => {
    const store = appText("lib/workspace-metadata-store.js");
    const graph = appText("lib/workspace-metadata-graph.js");
    const selectors = appText("lib/workspace-metadata-selectors.js");
    const route = appText("app/api/workspace/metadata-graph/route.js");
    for (const source of [store, graph, selectors, route]) {
      expect(source).not.toMatch(/localStorage|sessionStorage/);
      expect(source).not.toMatch(/process\.env\.[A-Z_]*(?:TOKEN|SECRET|API_KEY|PASSWORD)/);
      expect(source).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{8,}/);
    }
  });
});

// ---------------------------------------------------------------------------
// 12. Metadata Graph V1 — full metadata group + graph node coverage
// ---------------------------------------------------------------------------

describe("workspace-metadata-store — complete V1 group coverage", () => {
  type Store = {
    workflowActions: Array<{ action: string; nodeType: string; workflowNodeMetadataId: string }>;
    workerKits: Array<{ id: string; label: string; family: string }>;
    pipelineHealth: Array<{ status: string; sandboxMetadataId: string; latestRunId: string }>;
    sandboxes: Array<{ hasGraph: boolean }>;
    runs: Array<{ runId: string; ok: boolean }>;
  };
  let buildWorkspaceMetadataStore: (input: unknown) => Store;
  let deriveWorkspaceRunMetadataItems: (input: unknown) => { items: unknown[]; outputArtifacts: unknown[] };
  let deriveWorkspaceWorkflowActionMetadataItems: (nodes: unknown[]) => { items: unknown[] };
  let deriveWorkspaceWorkerKitMetadataItems: (config: unknown) => { items: unknown[] };
  let deriveWorkspacePipelineHealthMetadataItems: (sandboxes: unknown[], runs: unknown[]) => { items: unknown[] };

  beforeEach(async () => {
    const mod = await import(`file://${path.join(APP_ROOT, "lib/workspace-metadata-store.js")}?t=${Date.now()}`) as {
      buildWorkspaceMetadataStore: typeof buildWorkspaceMetadataStore;
      deriveWorkspaceRunMetadataItems: typeof deriveWorkspaceRunMetadataItems;
      deriveWorkspaceWorkflowActionMetadataItems: typeof deriveWorkspaceWorkflowActionMetadataItems;
      deriveWorkspaceWorkerKitMetadataItems: typeof deriveWorkspaceWorkerKitMetadataItems;
      deriveWorkspacePipelineHealthMetadataItems: typeof deriveWorkspacePipelineHealthMetadataItems;
    };
    buildWorkspaceMetadataStore = mod.buildWorkspaceMetadataStore;
    deriveWorkspaceRunMetadataItems = mod.deriveWorkspaceRunMetadataItems;
    deriveWorkspaceWorkflowActionMetadataItems = mod.deriveWorkspaceWorkflowActionMetadataItems;
    deriveWorkspaceWorkerKitMetadataItems = mod.deriveWorkspaceWorkerKitMetadataItems;
    deriveWorkspacePipelineHealthMetadataItems = mod.deriveWorkspacePipelineHealthMetadataItems;
  });

  it("exports the spec-required derivation helpers", () => {
    expect(typeof buildWorkspaceMetadataStore).toBe("function");
    expect(typeof deriveWorkspaceRunMetadataItems).toBe("function");
    expect(typeof deriveWorkspaceWorkflowActionMetadataItems).toBe("function");
    expect(typeof deriveWorkspaceWorkerKitMetadataItems).toBe("function");
    expect(typeof deriveWorkspacePipelineHealthMetadataItems).toBe("function");
  });

  it("derives workflowAction items per workflow node", () => {
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          objects: [{
            id: "sandbox-env",
            objectType: "sandbox-environment",
            columns: ["Name"],
            rows: [{
              Name: "Tool",
              adapter: "local-agent-host",
              agentHost: "claude_local",
              runLocality: "local",
              orchestrationGraph: JSON.stringify({
                version: 1,
                provider: "growthub-native",
                nodes: [
                  { id: "form", type: "human-input", config: { action: "form", fields: [{ key: "x", value: "text" }] } },
                  { id: "req", type: "api-registry-call", config: {} },
                  { id: "filt", type: "transform-filter", config: {} },
                  { id: "out", type: "tool-result" },
                ],
                edges: [],
              }),
            }],
          }],
        },
      },
    });
    const actions = store.workflowActions.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["form", "request", "filter", "result"]));
    for (const action of store.workflowActions) {
      expect(action.workflowNodeMetadataId).toBeTruthy();
    }
  });

  it("derives a single workerKit anchor with a deterministic metadata id", () => {
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        kit: { id: "growthub-custom-workspace-starter-v1", name: "Starter", version: "1.0.0" },
      },
    });
    expect(store.workerKits).toHaveLength(1);
    expect(store.workerKits[0].label).toBe("Starter");
    expect(store.workerKits[0].family).toBe("studio");
  });

  it("derives pipelineHealth from sandboxes + latest run", () => {
    const lastResponse = JSON.stringify({
      runId: "run-ok",
      exitCode: 0,
      durationMs: 100,
      ranAt: "2026-05-21T19:28:07.906Z",
      stdout: "ok",
      output: { items: [] },
    });
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          objects: [{
            id: "sandbox-env",
            objectType: "sandbox-environment",
            columns: ["Name"],
            rows: [{
              Name: "Tool",
              adapter: "local-agent-host",
              agentHost: "claude_local",
              runLocality: "local",
              lifecycleStatus: "live",
              orchestrationGraph: JSON.stringify({
                version: 1,
                provider: "growthub-native",
                nodes: [{ id: "in", type: "input" }, { id: "out", type: "tool-result" }],
                edges: [],
              }),
              lastResponse,
            }],
          }],
        },
      },
    });
    expect(store.pipelineHealth).toHaveLength(1);
    expect(store.pipelineHealth[0].status).toBe("healthy");
    expect(store.pipelineHealth[0].latestRunId).toBe("run-ok");
  });

  it("deriveWorkspaceRunMetadataItems accepts a sourceRecords-shaped sidecar", () => {
    const result = deriveWorkspaceRunMetadataItems({
      "sandbox:obj:row": {
        runId: "run-1",
        exitCode: 0,
        durationMs: 50,
        ranAt: "2026-05-21T19:28:07.906Z",
        stdout: "ok",
        output: { items: [] },
      },
    });
    expect(result.items).toHaveLength(1);
    expect(result.outputArtifacts).toHaveLength(1);
  });
});

describe("workspace-metadata-graph — complete V1 node + edge coverage", () => {
  type Graph = {
    nodes: Array<{ id: string; type: string; metadataId: string; summary: Record<string, unknown> }>;
    edges: Array<{ relation: string; from: string; to: string; fromType: string; toType: string }>;
  };
  let buildWorkspaceMetadataStore: (input: unknown) => unknown;
  let buildWorkspaceMetadataGraph: (store: unknown) => Graph;
  let summarizeGraphNode: (node: unknown) => unknown;

  beforeEach(async () => {
    const storeMod = await import(`file://${path.join(APP_ROOT, "lib/workspace-metadata-store.js")}?t=${Date.now()}`) as { buildWorkspaceMetadataStore: typeof buildWorkspaceMetadataStore };
    const graphMod = await import(`file://${path.join(APP_ROOT, "lib/workspace-metadata-graph.js")}?t=${Date.now()}`) as {
      buildWorkspaceMetadataGraph: typeof buildWorkspaceMetadataGraph;
      summarizeGraphNode: typeof summarizeGraphNode;
    };
    buildWorkspaceMetadataStore = storeMod.buildWorkspaceMetadataStore;
    buildWorkspaceMetadataGraph = graphMod.buildWorkspaceMetadataGraph;
    summarizeGraphNode = graphMod.summarizeGraphNode;
  });

  function richFixture(): Graph {
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          integrations: [
            { integrationId: "leadshark", label: "LeadShark", lane: "outbound", status: "connected" },
          ],
          objects: [
            {
              id: "pipeline",
              columns: ["stage", "arr"],
              rows: [{ stage: "lead", arr: 1 }],
              binding: { mode: "manual", source: "Pipeline", integrationId: "leadshark", entityId: "acct-1", entityType: "account", entityLabel: "Acct 1" },
              savedViews: [{ id: "viewA", name: "Active", columns: ["stage", "arr"], filters: [{ field: "stage", op: "eq", value: "lead" }] }],
            },
            {
              id: "src_crm",
              label: "CRM",
              objectType: "data-source",
              columns: ["name"],
              rows: [],
              sourceId: "src_crm",
              binding: { mode: "integration", sourceStorage: "workspace-source-records", sourceId: "src_crm", integrationId: "leadshark" },
            },
            {
              id: "sandbox-env",
              objectType: "sandbox-environment",
              columns: ["Name"],
              rows: [{
                Name: "Tool",
                adapter: "local-agent-host",
                agentHost: "claude_local",
                runLocality: "local",
                lifecycleStatus: "live",
                orchestrationGraph: JSON.stringify({
                  version: 1,
                  provider: "growthub-native",
                  nodes: [
                    { id: "form", type: "human-input", config: { action: "form", required: true, fields: [{ key: "companyName", value: "text" }] } },
                    { id: "src", type: "input", config: { sourceId: "pipeline" } },
                    { id: "api", type: "api-registry-call", config: { integrationId: "leadshark" } },
                    { id: "wrt", type: "tool-result", config: { writeObjectId: "pipeline" } },
                  ],
                  edges: [],
                }),
                lastResponse: JSON.stringify({ runId: "r1", exitCode: 0, durationMs: 100, ranAt: "2026-05-21T19:28:07.906Z", output: { items: [] }, input: { kind: "growthub-workflow-run-inputs-v1", values: { companyName: "Acme" } } }),
              }],
            },
          ],
        },
        canvas: {
          layout: { columns: 12, rowHeight: 64, gap: 16, responsive: true },
          widgets: [{
            id: "wc",
            kind: "chart",
            title: "ARR by stage",
            position: { x: 0, y: 0, w: 6, h: 5 },
            config: {
              values: [1],
              xAxis: { field: "stage" },
              yAxis: { field: "arr", aggregation: "sum" },
              filter: { op: "and", clauses: [{ fieldId: "stage", operator: "eq", value: "lead" }] },
              binding: { sourceType: "workspace-data-model", objectId: "pipeline", integrationId: "leadshark", entityId: "acct-1", entityType: "account" },
            },
          }],
        },
      },
      workspaceSourceRecords: {
        src_crm: { records: [{ name: "Acme" }], fetchedAt: "2026-05-01T00:00:00Z", recordCount: 1, integrationId: "leadshark" },
      },
    });
    return buildWorkspaceMetadataGraph(store);
  }

  it("emits every V1 node type that has corresponding metadata", () => {
    const graph = richFixture();
    const types = new Set(graph.nodes.map((n) => n.type));
    const expectedTypes = [
      "dashboard",
      "widget",
      "dataModelObject",
      "field",
      "view",
      "filter",
      "sort",
      "workflow",
      "workflowNode",
      "workflowAction",
      "runInput",
      "sandbox",
      "agentHost",
      "integration",
      "integrationEntity",
      "sourceRecord",
      "run",
      "runOutput",
      "outputArtifact",
      "workerKit",
      "pipelineHealth"
    ];
    for (const type of expectedTypes) {
      expect(types.has(type)).toBe(true);
    }
  });

  it("emits every V1 edge relation when the underlying metadata exists", () => {
    const graph = richFixture();
    const relations = new Set(graph.edges.map((e) => e.relation));
    const expectedRelations = [
      "containsWidget",
      "bindsToObject",
      "usesField",
      "filteredByField",
      "sortedByField",
      "backedBySourceRecord",
      "scopedToEntity",
      "boundToIntegration",
      "belongsToIntegration",
      "containsNode",
      "usesSandbox",
      "readsObject",
      "writesObject",
      "usesAgentHost",
      "requiresRunInput",
      "callsIntegration",
      "configuresAction",
      "executedWorkflow",
      "executedSandbox",
      "usedAgentHost",
      "producedArtifact",
      "producedRunOutput",
      "materializedAs",
      "consumedRunInput",
      "summarisesSandbox",
      "summarisesWorkflow",
      "materializes",
      "configuresFilter",
      "configuresSort"
    ];
    for (const relation of expectedRelations) {
      expect(relations.has(relation)).toBe(true);
    }
  });

  it("summarizeGraphNode returns a typed compact summary", () => {
    const graph = richFixture();
    const widget = graph.nodes.find((n) => n.type === "widget")!;
    const summary = summarizeGraphNode(widget) as { id: string; type: string; label: string; metadataId: string };
    expect(summary.id).toBe(widget.id);
    expect(summary.type).toBe("widget");
    expect(summary.label).toBeTruthy();
    expect(summary.metadataId).toBe(widget.metadataId);
  });
});

// ---------------------------------------------------------------------------
// 13. Metadata Graph V1 — existing-file integration points
// ---------------------------------------------------------------------------

describe("workspace-chart-values — typed widget dependency contract", () => {
  let deriveWidgetDependencyContract: (widget: unknown) => {
    objectId: string;
    required: string[];
    filter: string[];
    sort: string[];
    aggregation: string[];
    operation: string;
    outputShape: string;
    warnings: string[];
  };

  beforeEach(async () => {
    const mod = await import(`file://${path.join(APP_ROOT, "lib/workspace-chart-values.js")}?t=${Date.now()}`) as {
      deriveWidgetDependencyContract: typeof deriveWidgetDependencyContract;
    };
    deriveWidgetDependencyContract = mod.deriveWidgetDependencyContract;
  });

  it("ships from workspace-chart-values", () => {
    expect(typeof deriveWidgetDependencyContract).toBe("function");
  });

  it("returns required / filter / sort / aggregation fields for a chart widget", () => {
    const contract = deriveWidgetDependencyContract({
      kind: "chart",
      config: {
        xAxis: { field: "stage" },
        yAxis: { field: "arr", aggregation: "sum" },
        filter: { op: "and", clauses: [{ fieldId: "stage", operator: "eq", value: "won" }] },
        binding: { sourceType: "workspace-data-model", objectId: "pipeline" },
      },
    });
    expect(contract.objectId).toBe("pipeline");
    expect(contract.required).toEqual(expect.arrayContaining(["stage", "arr"]));
    expect(contract.filter).toEqual(["stage"]);
    expect(contract.sort).toEqual(["stage"]);
    expect(contract.aggregation).toEqual(["arr"]);
    expect(contract.operation).toBe("sum");
    expect(contract.outputShape).toBe("number[]");
  });

  it("warns when an axis is missing on a chart widget", () => {
    const contract = deriveWidgetDependencyContract({ kind: "chart", config: {} });
    expect(contract.warnings.length).toBeGreaterThan(0);
  });

  it("never throws on unknown widget shapes", () => {
    expect(() => deriveWidgetDependencyContract(null)).not.toThrow();
    expect(() => deriveWidgetDependencyContract(undefined)).not.toThrow();
    expect(() => deriveWidgetDependencyContract({ kind: "chart" } as never)).not.toThrow();
  });
});

describe("orchestration-run-inputs — metadata-compatible descriptors", () => {
  let describeRunInputMetadataItems: (input: { workflowId: string; graph: unknown }) => Array<{
    id: string;
    label: string;
    type: string;
    required: boolean;
    isSecret: boolean;
    secretRefOnly: boolean;
    sourceNodeId: string;
    workflowId: string;
  }>;

  beforeEach(async () => {
    const mod = await import(`file://${path.join(APP_ROOT, "lib/orchestration-run-inputs.js")}?t=${Date.now()}`) as {
      describeRunInputMetadataItems: typeof describeRunInputMetadataItems;
    };
    describeRunInputMetadataItems = mod.describeRunInputMetadataItems;
  });

  it("returns descriptors with all spec-required keys", () => {
    const items = describeRunInputMetadataItems({
      workflowId: "sandbox-env::Tool",
      graph: {
        version: 1,
        provider: "growthub-native",
        nodes: [{
          id: "form-1",
          type: "human-input",
          config: { action: "form", required: true, fields: [{ key: "companyName", value: "text" }, { key: "apiKey", value: "secretRef" }] },
        }],
        edges: [],
      },
    });
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("label");
      expect(item).toHaveProperty("type");
      expect(item).toHaveProperty("required");
      expect(item).toHaveProperty("secretRefOnly");
      expect(item).toHaveProperty("sourceNodeId");
      expect(item).toHaveProperty("workflowId");
      expect(item.workflowId).toBe("sandbox-env::Tool");
    }
    const apiKey = items.find((i) => i.id === "apiKey")!;
    expect(apiKey.secretRefOnly).toBe(true);
    expect(apiKey.isSecret).toBe(true);
  });
});

describe("orchestration-run-console — run lineage on normalized record", () => {
  let normalizeRunConsoleRecord: (r: unknown) => {
    lineage: {
      runId: string;
      objectId: string;
      sandboxName: string;
      workflowMetadataId: string;
      sandboxMetadataId: string;
      adapter: string;
      agentHost: string;
      runtime: string;
      runLocality: string;
      inputFieldCount: number;
      inputSource: string;
      hasOutput: boolean;
    };
  } | null;

  beforeEach(async () => {
    const mod = await import(`file://${path.join(APP_ROOT, "lib/orchestration-run-console.js")}?t=${Date.now()}`) as {
      normalizeRunConsoleRecord: typeof normalizeRunConsoleRecord;
    };
    normalizeRunConsoleRecord = mod.normalizeRunConsoleRecord;
  });

  it("attaches a safe lineage descriptor (run → sandbox / workflow / adapter / agentHost / inputs / output)", () => {
    const record = normalizeRunConsoleRecord({
      runId: "run-lineage-1",
      exitCode: 0,
      durationMs: 50,
      ranAt: "2026-05-21T19:28:07.906Z",
      objectId: "sandbox-env",
      name: "LeadShark Tool",
      adapter: "local-agent-host",
      agentHost: "claude_local",
      runtime: "node",
      runLocality: "local",
      stdout: "ok",
      output: { items: [{ id: 1 }] },
      input: { kind: "growthub-workflow-run-inputs-v1", source: "manual", values: { companyName: "Acme" }, files: [] },
    });
    expect(record).not.toBeNull();
    expect(record!.lineage.runId).toBe("run-lineage-1");
    expect(record!.lineage.objectId).toBe("sandbox-env");
    expect(record!.lineage.sandboxName).toBe("LeadShark Tool");
    expect(record!.lineage.workflowMetadataId).toBe("workflow:sandbox-env:LeadShark Tool");
    expect(record!.lineage.sandboxMetadataId).toBe("sandbox:sandbox-env:LeadShark Tool");
    expect(record!.lineage.adapter).toBe("local-agent-host");
    expect(record!.lineage.agentHost).toBe("claude_local");
    expect(record!.lineage.runtime).toBe("node");
    expect(record!.lineage.runLocality).toBe("local");
    expect(record!.lineage.inputFieldCount).toBe(1);
    expect(record!.lineage.inputSource).toBe("manual");
    expect(record!.lineage.hasOutput).toBe(true);
  });

  it("lineage stays redaction-safe — never echoes secret-looking inputs", () => {
    const record = normalizeRunConsoleRecord({
      runId: "run-secret",
      exitCode: 0,
      durationMs: 50,
      ranAt: "2026-05-21T19:28:07.906Z",
      stdout: "Bearer leak",
      input: { kind: "growthub-workflow-run-inputs-v1", source: "manual", values: { apiKey: "raw-secret-do-not-leak" }, files: [] },
    });
    const json = JSON.stringify(record);
    expect(json).not.toContain("raw-secret-do-not-leak");
    expect(json).not.toMatch(/Bearer\s+leak/);
  });
});

describe("sandbox-agent-auth — safe metadata summary helper", () => {
  let describeAgentHostReadinessMetadata: (row: unknown) => {
    kind: string;
    adapter: string;
    agentHost: string;
    status: string;
    provider: string;
    lastChecked: string;
    lastExitCode: number | null;
    lastMessage: string;
    lastLoginUrl: string;
  } | null;

  beforeEach(async () => {
    // The auth module imports `@/lib/workspace-config` which uses Next.js path
    // aliases. Vitest cannot resolve those without the Next.js module graph,
    // so we assert via source-text inspection like the rest of the auth suite.
    describeAgentHostReadinessMetadata = (() => null) as never;
  });

  it("ships from sandbox-agent-auth and is exported", () => {
    const source = appText("lib/sandbox-agent-auth.js");
    expect(source).toContain("function describeAgentHostReadinessMetadata");
    expect(source).toMatch(/export\s*\{[^}]*describeAgentHostReadinessMetadata[^}]*\}/s);
  });

  it("only reads safe row patch fields — never the raw token / secret keys", () => {
    const source = appText("lib/sandbox-agent-auth.js");
    const blockMatch = source.match(/function describeAgentHostReadinessMetadata[\s\S]*?\n\}/);
    expect(blockMatch).not.toBeNull();
    const block = blockMatch![0];
    expect(block).toContain("SAFE_ROW_PATCH_FIELDS");
    expect(block).not.toMatch(/\baccessToken\b/);
    expect(block).not.toMatch(/\brefreshToken\b/);
    expect(block).not.toMatch(/\bapiKey\b/);
  });
});

describe("workspace-builder + WorkflowSurface — metadata selector wiring", () => {
  it("workspace-builder imports the typed widget dependency contract + object selectors", () => {
    const builder = appText("app/workspace-builder.jsx");
    expect(builder).toContain("deriveWidgetDependencyContract");
    expect(builder).toContain("selectObjectFilterableFields");
    expect(builder).toContain("selectObjectSortableFields");
    expect(builder).toContain("WORKSPACE_METADATA_SELECTORS");
  });

  it("WorkflowSurface imports the workflow node + run-input metadata selectors", () => {
    const surface = appText("app/workflows/WorkflowSurface.jsx");
    expect(surface).toContain("describeRunInputMetadataItems");
    expect(surface).toContain("selectWorkflowNodeInputSchema");
    expect(surface).toContain("WORKFLOW_METADATA_SELECTORS");
  });
});

describe("metadata-graph route — response envelope coverage", () => {
  it("response envelope exposes every V1 metadata group", () => {
    const route = appText("app/api/workspace/metadata-graph/route.js");
    const required = [
      "objects",
      "fields",
      "views",
      "filters",
      "sorts",
      "widgets",
      "dashboards",
      "workflows",
      "workflowNodes",
      "workflowActions",
      "runInputs",
      "agentHosts",
      "sandboxes",
      "integrations",
      "integrationEntities",
      "sourceRecords",
      "runs",
      "outputArtifacts",
      "workerKits",
      "pipelineHealth",
    ];
    for (const key of required) {
      expect(route).toMatch(new RegExp(`${key}:\\s*metadataStore\\.${key}`));
    }
  });

  it("route is GET-only and never references any write helper", () => {
    const route = appText("app/api/workspace/metadata-graph/route.js");
    expect(route).toMatch(/export\s*\{[^}]*\bGET\b[^}]*\}/);
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(route).not.toMatch(new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`));
    }
  });

  it("route declares an httpEnabled selector manifest covering stale-group lookup", () => {
    const route = appText("app/api/workspace/metadata-graph/route.js");
    // V1: only selectStaleMetadataGroups is wired through HTTP via
    // `?staleKind=&staleId=`. The remaining selectors stay helperOnly.
    expect(route).toContain("httpEnabled");
    expect(route).toContain("selectStaleMetadataGroups");
    expect(route).toContain("staleKind");
    expect(route).toContain("staleId");
  });

  it("route falls back to an empty store envelope when helpers throw", () => {
    const route = appText("app/api/workspace/metadata-graph/route.js");
    // Defensive try/catch wraps store + graph builders so the inspector and
    // agents always receive a typed envelope, never a 500.
    expect(route).toContain("Failed to build metadata store");
    expect(route).toContain("Failed to build metadata graph");
    expect(route).toContain("Failed to compute stale groups");
    expect(route).toContain("emptyMetadataStore");
  });
});

// ---------------------------------------------------------------------------
// 14. Metadata Graph V1 — run history + secret/redaction full-envelope checks
// ---------------------------------------------------------------------------

describe("workspace-metadata-store — sandbox run history from source-records sidecar", () => {
  let buildWorkspaceMetadataStore: (input: unknown) => {
    runs: Array<{ runId: string; ok: boolean; ranAt: string }>;
    outputArtifacts: unknown[];
    sourceRecords: Array<{ id: string; sourceKind: string }>;
  };

  beforeEach(async () => {
    const mod = await import(`file://${path.join(APP_ROOT, "lib/workspace-metadata-store.js")}?t=${Date.now()}`) as {
      buildWorkspaceMetadataStore: typeof buildWorkspaceMetadataStore;
    };
    buildWorkspaceMetadataStore = mod.buildWorkspaceMetadataStore;
  });

  it("derives multiple runs from workspaceSourceRecords[sandbox:objectId:rowSlug] history", () => {
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          objects: [{
            id: "sandbox-env",
            objectType: "sandbox-environment",
            columns: ["Name"],
            rows: [{
              Name: "LeadShark Tool",
              adapter: "local-agent-host",
              agentHost: "claude_local",
              runLocality: "local",
              lastSourceId: "sandbox:sandbox-env:leadshark-tool",
              lastResponse: JSON.stringify({ runId: "run-3", exitCode: 0, durationMs: 50, ranAt: "2026-05-21T19:30:00.000Z", output: { items: [] } }),
            }],
          }],
        },
      },
      workspaceSourceRecords: {
        "sandbox:sandbox-env:leadshark-tool": {
          records: [
            { runId: "run-1", exitCode: 0, durationMs: 100, ranAt: "2026-05-21T19:28:00.000Z", output: { items: [{ id: 1 }] } },
            { runId: "run-2", exitCode: 1, durationMs: 80, ranAt: "2026-05-21T19:29:00.000Z", error: "boom", stdout: "fail" },
            { runId: "run-3", exitCode: 0, durationMs: 50, ranAt: "2026-05-21T19:30:00.000Z", output: { items: [] } },
          ],
          fetchedAt: "2026-05-21T19:30:00.000Z",
          recordCount: 3,
        },
      },
    });
    const runIds = store.runs.map((r) => r.runId).sort();
    expect(runIds).toEqual(["run-1", "run-2", "run-3"]);
    // The latest run (also in row.lastResponse) is deduplicated.
    expect(store.runs.filter((r) => r.runId === "run-3")).toHaveLength(1);
    // Failed runs are marked ok=false and never crash the projection.
    expect(store.runs.find((r) => r.runId === "run-2")!.ok).toBe(false);
    // The sandbox-run sidecar is tagged so the inspector distinguishes
    // it from live data-source records.
    const sidecar = store.sourceRecords.find((s) => s.id === "sandbox:sandbox-env:leadshark-tool");
    expect(sidecar).toBeDefined();
    expect(sidecar!.sourceKind).toBe("sandbox-run-history");
  });
});

describe("metadata-graph projection — full-envelope secret/redaction guarantees", () => {
  let buildWorkspaceMetadataStore: (input: unknown) => unknown;
  let buildWorkspaceMetadataGraph: (store: unknown) => unknown;

  beforeEach(async () => {
    const storeMod = await import(`file://${path.join(APP_ROOT, "lib/workspace-metadata-store.js")}?t=${Date.now()}`) as { buildWorkspaceMetadataStore: typeof buildWorkspaceMetadataStore };
    const graphMod = await import(`file://${path.join(APP_ROOT, "lib/workspace-metadata-graph.js")}?t=${Date.now()}`) as { buildWorkspaceMetadataGraph: typeof buildWorkspaceMetadataGraph };
    buildWorkspaceMetadataStore = storeMod.buildWorkspaceMetadataStore;
    buildWorkspaceMetadataGraph = graphMod.buildWorkspaceMetadataGraph;
  });

  it("never echoes raw stdout / stderr / token-shaped values into the envelope JSON", () => {
    const store = buildWorkspaceMetadataStore({
      workspaceConfig: {
        dataModel: {
          objects: [{
            id: "creds",
            columns: ["name", "apiKey", "accessToken", "refreshToken", "authHeaderValue"],
            rows: [{
              name: "x",
              apiKey: "sk-ant-LEAK-1",
              accessToken: "Bearer LEAK-2",
              refreshToken: "refresh_LEAK_3",
              authHeaderValue: "Authorization: Bearer LEAK-4",
            }],
            binding: { mode: "manual", source: "Creds" },
          }, {
            id: "sandbox-env",
            objectType: "sandbox-environment",
            columns: ["Name"],
            rows: [{
              Name: "Tool",
              adapter: "local-agent-host",
              agentHost: "claude_local",
              runLocality: "local",
              lastResponse: JSON.stringify({
                runId: "run-1",
                exitCode: 0,
                durationMs: 10,
                ranAt: "2026-05-21T19:28:00.000Z",
                stdout: "Authorization: Bearer secret-stdout-XYZ",
                stderr: "x-api-key=secret-stderr-XYZ",
                output: { token: "raw-output-XYZ" },
              }),
            }],
          }],
        },
      },
    });
    const graph = buildWorkspaceMetadataGraph(store);
    const json = JSON.stringify({ store, graph });
    // No secret values from creds row.
    expect(json).not.toContain("sk-ant-LEAK-1");
    expect(json).not.toContain("LEAK-2");
    expect(json).not.toContain("LEAK_3");
    expect(json).not.toContain("LEAK-4");
    // No raw stdout / stderr / output from run record.
    expect(json).not.toContain("secret-stdout-XYZ");
    expect(json).not.toContain("secret-stderr-XYZ");
    expect(json).not.toContain("raw-output-XYZ");
  });
});

// ---------------------------------------------------------------------------
// 15. Customer Activation Layer V1 — files ship, derivation safe, panel mounted
// ---------------------------------------------------------------------------

describe("workspace-activation — Customer Activation Layer V1", () => {
  it("workspace-activation.js ships in lib/", () => {
    expect(appExists("lib/workspace-activation.js")).toBe(true);
    const source = appText("lib/workspace-activation.js");
    expect(source).toContain("function deriveWorkspaceActivationState");
    expect(source).toContain("function deriveProjectManagementActivationState");
    expect(source).toContain("function deriveBlankWorkspaceActivationState");
    expect(source).toMatch(/export\s*\{[^}]*deriveWorkspaceActivationState[^}]*\}/s);
  });

  it("WorkspaceActivationPanel.jsx ships in app/components/", () => {
    expect(appExists("app/components/WorkspaceActivationPanel.jsx")).toBe(true);
    const source = appText("app/components/WorkspaceActivationPanel.jsx");
    expect(source).toContain("WorkspaceActivationPanel");
    expect(source).toContain("@/lib/workspace-activation");
  });

  it("workspace-rail.jsx accepts an activationSlot prop and renders it in Home", () => {
    const rail = appText("app/workspace-rail.jsx");
    expect(rail).toContain("activationSlot");
    expect(rail).toContain("workspace-rail-activation-slot");
  });

  it("workspace-builder.jsx mounts WorkspaceActivationPanel in the dashboards view", () => {
    const builder = appText("app/workspace-builder.jsx");
    expect(builder).toContain("WorkspaceActivationPanel");
    expect(builder).toContain('from "./components/WorkspaceActivationPanel.jsx"');
  });

  it("WorkflowSurface.jsx wires a template-aware context banner", () => {
    const surface = appText("app/workflows/WorkflowSurface.jsx");
    expect(surface).toContain("@/lib/workspace-activation");
    expect(surface).toContain("templateBanner");
    expect(surface).toContain("workspace-template-context-banner");
  });

  it("NangoConnectionPanel.jsx accepts optional template context CTAs", () => {
    const panel = appText("app/data-model/components/NangoConnectionPanel.jsx");
    expect(panel).toContain("templateContext");
    expect(panel).toContain("workspace-template-context-banner");
  });

  it("workspace-metadata-store exposes a provenance projection (safe, no secrets)", () => {
    const store = appText("lib/workspace-metadata-store.js");
    expect(store).toContain("function deriveWorkspaceProvenanceMetadataItems");
    expect(store).toContain('kind: "workspaceProvenance"');
    expect(store).toContain("hasProvenance");
    expect(store).toContain("connectionsConfigured");
    expect(store).toMatch(/export\s*\{[^}]*deriveWorkspaceProvenanceMetadataItems[^}]*\}/s);
  });

  it("metadata-graph route exposes the new provenance metadata block", () => {
    const route = appText("app/api/workspace/metadata-graph/route.js");
    expect(route).toMatch(/provenance:\s*metadataStore\.provenance/);
  });

  it("project-management seed has provenance + uses the runtime rows schema", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const seedPath = path.join(root, "assets/worker-kits/growthub-custom-workspace-starter-v1/templates/seeded-configs/project-management.config.json");
    const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
    expect(seed.provenance).toBeDefined();
    expect(seed.provenance.template).toBe("project-management");
    expect(seed.provenance.templateKind).toBe("workspace-template");
    // The runtime contract uses dataModel.objects[].rows[], not .records[].
    for (const object of seed.dataModel.objects) {
      expect("records" in object).toBe(false);
      expect(Array.isArray(object.rows)).toBe(true);
    }
  });

  it("project-management seed ships no provider secrets or connection IDs", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const seedPath = path.join(root, "assets/worker-kits/growthub-custom-workspace-starter-v1/templates/seeded-configs/project-management.config.json");
    const seedJson = fs.readFileSync(seedPath, "utf8");
    expect(seedJson).not.toMatch(/Bearer\s+\w+/);
    expect(seedJson).not.toMatch(/sk-ant-[A-Za-z0-9_-]+/);
    // The api-registry row may declare the providerConfigKey but must not
    // pre-populate any connectionIds — those are operator-owned post-OAuth.
    const seed = JSON.parse(seedJson);
    const apiRegistry = seed.dataModel.objects.find((o: { objectType?: string }) => o.objectType === "api-registry");
    expect(apiRegistry).toBeDefined();
    for (const row of apiRegistry.rows) {
      const connectionIds = typeof row.connectionIds === "string"
        ? row.connectionIds.trim()
        : row.connectionIds;
      expect(connectionIds || "").toBe("");
    }
  });

  it("activation kit assets are listed as frozen assets in kit.json", () => {
    const kitJson = JSON.parse(readText("kit.json"));
    const frozen: string[] = kitJson.frozenAssetPaths ?? [];
    expect(frozen).toContain("apps/workspace/lib/workspace-activation.js");
    expect(frozen).toContain("apps/workspace/app/components/WorkspaceActivationPanel.jsx");
  });
});
