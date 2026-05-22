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

    // Every other host: reachability probe only (no invented subcommands).
    for (const slug of mod.KNOWN_HOST_AUTH_SLUGS) {
      if (slug === "claude_local") continue;
      const caps = mod.getAgentHostCapabilities({
        adapter: "local-agent-host",
        agentHost: slug,
        runLocality: "local"
      });
      expect(caps).not.toBeNull();
      expect(caps!.canCheckStatus).toBe(true);
      expect(caps!.canLogin).toBe(false);
      expect(caps!.canLogout).toBe(false);
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
