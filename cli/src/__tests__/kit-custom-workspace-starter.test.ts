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

  it("item with unknown type → must be dashboard|view", () => {
    const r = tryValidate([{ id: "fld_a", name: "Ops", items: [{ id: "x", type: "iframe" }] }]);
    expect(r.code).toBe("INVALID_WORKSPACE_CONFIG");
    expect(r.details!.some((d) => d.includes("type"))).toBe(true);
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
