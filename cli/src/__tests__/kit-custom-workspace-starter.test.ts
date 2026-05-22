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
