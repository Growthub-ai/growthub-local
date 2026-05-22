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
    expect(info.requiredPaths).toContain("studio");
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
