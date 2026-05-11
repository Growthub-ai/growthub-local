/**
 * `growthub workspace resolvers` — Integration resolver management surface.
 *
 * Subcommands:
 *   growthub workspace resolvers              List resolver files, registered IDs, and data model objects
 *   growthub workspace resolvers test <id>    Test a resolver against the live dev server
 *   growthub workspace resolvers context      Full architectural mental model (agent troubleshooting)
 *
 * All subcommands support --json for agent-friendly machine-readable output.
 *
 * Architecture reference:
 *   apps/workspace/lib/adapters/integrations/resolvers/README.md
 *   docs/WORKSPACE_BUILDER_RUNTIME_V1.md
 *   docs/ADAPTER_CONTRACTS_V1.md
 */

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveForkPath(optFork: string | undefined): string {
  return optFork ? path.resolve(optFork) : process.cwd();
}

function findWorkspaceAppPath(forkPath: string): string | null {
  const candidates = [
    path.resolve(forkPath, "apps/workspace"),
    path.resolve(forkPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.resolve(candidate, "growthub.config.json"))) {
      return candidate;
    }
  }
  return null;
}

function readWorkspaceConfig(appPath: string): Record<string, unknown> | null {
  const configPath = path.resolve(appPath, "growthub.config.json");
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function listResolverFiles(appPath: string): string[] {
  const resolversDir = path.resolve(appPath, "lib/adapters/integrations/resolvers");
  if (!fs.existsSync(resolversDir)) return [];
  return fs
    .readdirSync(resolversDir)
    .filter((f) => f.endsWith(".js") && !f.startsWith("_") && !f.startsWith("."));
}

function extractDataModelResolverObjects(config: Record<string, unknown>): Array<{
  id: string;
  label: string;
  integrationId: string;
  sourceId: string;
  entityType: string;
  objectType: string;
}> {
  const wc = config as {
    workspaceConfig?: {
      dataModel?: {
        objects?: Array<{
          id: string;
          label: string;
          objectType?: string;
          binding?: {
            integrationId?: string;
            sourceId?: string;
            entityType?: string;
            sourceStorage?: string;
          };
        }>;
      };
    };
  };
  const objects = wc?.workspaceConfig?.dataModel?.objects ?? [];
  return objects
    .filter((o) => o.binding?.sourceStorage === "workspace-source-records")
    .map((o) => ({
      id: o.id,
      label: o.label,
      integrationId: o.binding?.integrationId ?? "",
      sourceId: o.binding?.sourceId ?? o.id,
      entityType: o.binding?.entityType ?? "",
      objectType: o.objectType ?? "",
    }));
}

async function callWorkspaceApi(
  port: number,
  method: "GET" | "POST",
  pathname: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await fetch(`http://localhost:${port}${pathname}`, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ---------------------------------------------------------------------------
// list — default subcommand
// ---------------------------------------------------------------------------

async function runResolverList(opts: {
  fork?: string;
  port?: string;
  json?: boolean;
}): Promise<void> {
  const forkPath = resolveForkPath(opts.fork);
  const appPath = findWorkspaceAppPath(forkPath);
  const port = Number(opts.port ?? 3000);

  const files = appPath ? listResolverFiles(appPath) : [];
  const config = appPath ? readWorkspaceConfig(appPath) : null;
  const dataModelObjects = config ? extractDataModelResolverObjects(config) : [];

  // Try live API for registered IDs
  const apiResult = await callWorkspaceApi(port, "GET", "/api/workspace/resolvers");
  const registeredIds: string[] = apiResult.ok
    ? ((apiResult.data as { registeredIds?: string[] })?.registeredIds ?? [])
    : [];
  const serverReachable = apiResult.ok;

  const result = {
    appPath: appPath ?? null,
    serverPort: port,
    serverReachable,
    resolverFiles: files,
    registeredIds,
    dataModelObjects,
    sourceDropdownSources: dataModelObjects.map((o) => ({
      id: o.id,
      label: o.label,
      resolverBacked: true,
      integrationId: o.integrationId,
      visibleInSourceDropdown: true,
    })),
    docs: {
      resolverReadme: "apps/workspace/lib/adapters/integrations/resolvers/README.md",
      architectureRef: "docs/WORKSPACE_BUILDER_RUNTIME_V1.md",
      adapterContracts: "docs/ADAPTER_CONTRACTS_V1.md",
    },
  };

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const tick = (ok: boolean) => (ok ? pc.green("✓") : pc.red("✗"));

  console.log("");
  console.log(pc.bold("Workspace Resolvers"));
  console.log(pc.dim("─".repeat(60)));
  console.log(`  ${tick(Boolean(appPath))}  App path        ${appPath ? pc.dim(appPath) : pc.red("not found")}`);
  console.log(`  ${tick(serverReachable)}  Dev server      ${serverReachable ? pc.green(`localhost:${port}`) : pc.dim(`localhost:${port} not reachable`)}`);
  console.log("");

  console.log(pc.bold("  Resolver files"));
  if (files.length === 0) {
    console.log(pc.dim("    none — drop .js files in lib/adapters/integrations/resolvers/"));
  } else {
    for (const f of files) {
      const isRegistered = registeredIds.includes(f.replace(/\.js$/, ""));
      console.log(`    ${tick(isRegistered)} ${f}${isRegistered ? "" : pc.yellow(" (file found but not registered — restart server)")}`);
    }
  }

  console.log("");
  console.log(pc.bold("  Data model dynamic sources"));
  if (dataModelObjects.length === 0) {
    console.log(pc.dim("    none — PATCH /api/workspace with dataModel.objects to register a dynamic source"));
  } else {
    for (const o of dataModelObjects) {
      console.log(`    ${pc.cyan(o.id)}  "${o.label}"  integration=${o.integrationId}  entityType=${o.entityType}`);
    }
  }

  console.log("");
  console.log(pc.dim("  Resolver README:  apps/workspace/lib/adapters/integrations/resolvers/README.md"));
  console.log(pc.dim("  Architecture:     docs/WORKSPACE_BUILDER_RUNTIME_V1.md"));
  console.log(pc.dim("  Agent output:     growthub workspace resolvers --json"));
  console.log("");
}

// ---------------------------------------------------------------------------
// test — test-source against live server
// ---------------------------------------------------------------------------

async function runResolverTest(
  integrationId: string,
  opts: { fork?: string; port?: string; json?: boolean; entityType?: string; sourceId?: string },
): Promise<void> {
  const port = Number(opts.port ?? 3000);

  const body = {
    integrationId,
    binding: {
      entityType: opts.entityType ?? "",
      sourceStorage: "workspace-source-records",
      sourceId: opts.sourceId ?? integrationId,
    },
  };

  if (!opts.json) {
    p.intro(`Testing resolver: ${pc.cyan(integrationId)}`);
  }

  const result = await callWorkspaceApi(port, "POST", "/api/workspace/test-source", body);

  if (opts.json) {
    console.log(JSON.stringify({ integrationId, port, request: body, response: result.data }, null, 2));
    return;
  }

  if (!result.ok && result.status === 0) {
    p.outro(pc.red(`Dev server not reachable at localhost:${port}. Run: npm run dev`));
    return;
  }

  const data = result.data as {
    ok?: boolean;
    reason?: string;
    error?: string;
    recordCount?: number;
    columns?: string[];
    preview?: unknown[];
    entityTypes?: string[];
    registeredResolvers?: string[];
    hint?: string;
  };

  if (data?.ok) {
    p.outro(
      pc.green("✓ Resolver ok") + "\n" +
      `  recordCount:  ${data.recordCount ?? 0}\n` +
      `  columns:      ${(data.columns ?? []).join(", ")}\n` +
      `  entityTypes:  ${(data.entityTypes ?? []).join(", ")}\n` +
      `  preview rows: ${data.preview?.length ?? 0}`,
    );
  } else {
    const hint =
      data?.reason === "no-resolver"
        ? `No resolver registered for "${integrationId}". Drop a file at lib/adapters/integrations/resolvers/${integrationId}.js`
        : data?.reason === "fetch-error"
          ? `Resolver ran but fetch failed: ${data.error}`
          : `reason: ${data?.reason ?? "unknown"} — ${data?.error ?? ""}`;

    p.outro(
      pc.yellow("✗ " + hint) +
      (data?.registeredResolvers?.length
        ? `\n  Registered resolvers: ${data.registeredResolvers.join(", ")}`
        : "") +
      (data?.hint ? `\n  Hint: ${data.hint}` : ""),
    );
  }
}

// ---------------------------------------------------------------------------
// context — full architectural mental model for agent troubleshooting
// ---------------------------------------------------------------------------

function buildResolverContext(forkPath: string, port: number): Record<string, unknown> {
  const appPath = findWorkspaceAppPath(forkPath);
  const config = appPath ? readWorkspaceConfig(appPath) : null;
  const resolverFiles = appPath ? listResolverFiles(appPath) : [];
  const dataModelObjects = config ? extractDataModelResolverObjects(config) : [];

  return {
    mentalModel: {
      summary:
        "Integration resolvers are the server-side bridge between a connected integration and the workspace data model. " +
        "The Growthub Bridge confirms which integrations are active and provides auth token confirmation — it does not proxy data. " +
        "The resolver reads provider credentials from env vars (e.g. GOOGLE_ANALYTICS_ACCESS_TOKEN), " +
        "calls the provider API directly, normalizes the response into display-safe records, " +
        "and returns them to the workspace routes.",
      dataFlow: [
        "1. Integration is connected via Growthub Bridge (OAuth or API key) — confirms auth state only",
        "2. Operator drops a resolver .js file in lib/adapters/integrations/resolvers/",
        "3. Resolver calls registerSourceResolver({ integrationId, entityTypes, listEntities, fetchRecords })",
        "4. Dev server starts → resolver-loader imports all .js files → registry is populated",
        "5. Operator PATCHes /api/workspace with a dataModel.objects entry: binding.sourceStorage='workspace-source-records', binding.integrationId matches resolver",
        "6. growthub.config.json is updated on disk — this IS the database persistence layer in local dev",
        "7. Source dropdown in workspace builder reads dataModel.objects and shows resolver-backed objects under 'Dynamic sources'",
        "8. User selects the source in a widget → widget stores binding reference",
        "9. User clicks Refresh on tab bar → POST /api/workspace/refresh-sources → resolver.fetchRecords called → records written to growthub.source-records.json",
        "10. Workspace builder reloads → widgets render live data rows",
      ],
      databasePersistence: {
        description:
          "In local dev (GROWTHUB_WORKSPACE_DEPLOY_TARGET=local), growthub.config.json IS the database. " +
          "PATCH /api/workspace writes directly to this file. " +
          "WORKSPACE_CONFIG_ALLOW_FS_WRITE=true must be set in .env.local. " +
          "Source records (live data rows) persist to growthub.source-records.json beside the config. " +
          "In production (Vercel), the persistence adapter switches to provider-managed storage.",
        configFile: "apps/workspace/growthub.config.json",
        sourceRecordsFile: "apps/workspace/growthub.source-records.json",
        requiredEnvForFsWrite: "WORKSPACE_CONFIG_ALLOW_FS_WRITE=true",
        patchEndpoint: "PATCH /api/workspace",
        allowedPatchFields: ["canvas", "dashboards", "widgetTypes", "dataModel"],
      },
      sourceDropdown: {
        description:
          "The source dropdown in the workspace builder widget inspector shows ONLY objects already saved in dataModel.objects. " +
          "It never shows raw integration catalog entries or unvalidated sources. " +
          "Resolver-backed objects (binding.sourceStorage='workspace-source-records') appear in the 'Dynamic sources' section. " +
          "Objects without a resolver binding appear as static data model sources. " +
          "Integration brand icon + tooltip is shown for resolver-backed objects.",
        sections: ["Static rows", "Data model objects (static)", "Dynamic sources (resolver-backed)"],
        configuresFrom: "dataModel.objects in growthub.config.json",
      },
      envVarConvention: {
        description:
          "Each resolver reads its own provider token from env. " +
          "Naming convention: {PROVIDER_SLUG_UPPERCASE}_{TOKEN_TYPE}. " +
          "The bridge token (GROWTHUB_BRIDGE_ACCESS_TOKEN) authenticates to the bridge only — not to provider APIs.",
        examples: {
          "google-analytics": ["GOOGLE_ANALYTICS_ACCESS_TOKEN", "GOOGLE_ANALYTICS_PROPERTY_ID"],
          "meta-ads": ["META_ADS_ACCESS_TOKEN", "META_ADS_ACCOUNT_ID"],
          shopify: ["SHOPIFY_ACCESS_TOKEN", "SHOPIFY_SHOP_DOMAIN"],
          asana: ["ASANA_ACCESS_TOKEN", "ASANA_WORKSPACE_ID"],
          "go-high-level": ["GHL_API_TOKEN", "GHL_LOCATION_ID"],
        },
      },
      troubleshootingChecklist: [
        "1. Resolver file exists in lib/adapters/integrations/resolvers/ (.js, not .ts)",
        "2. File calls registerSourceResolver({ integrationId, fetchRecords }) at module load",
        "3. Server was restarted AFTER the resolver file was added (loadAttempted cache must reset)",
        "4. GET /api/workspace/resolvers shows the integrationId in registeredIds",
        "5. dataModel.objects entry exists in growthub.config.json with binding.integrationId matching the resolver",
        "6. Provider env vars are set in .env.local (e.g. GOOGLE_ANALYTICS_ACCESS_TOKEN)",
        "7. WORKSPACE_CONFIG_ALLOW_FS_WRITE=true is in .env.local",
        "8. POST /api/workspace/test-source returns ok:true before relying on refresh",
      ],
      cliCommands: {
        listResolvers: "growthub workspace resolvers [--json] [--fork <path>] [--port <port>]",
        testResolver: "growthub workspace resolvers test <integration-id> [--json] [--entity-type <type>] [--source-id <id>]",
        fullContext: "growthub workspace resolvers context [--json]",
        workspaceStatus: "growthub workspace status [--json]",
        patchDataModel: "curl -s -X PATCH http://localhost:3000/api/workspace -H 'Content-Type: application/json' -d '{\"dataModel\":{\"objects\":[...]}}'",
        testSource: "curl -s -X POST http://localhost:3000/api/workspace/test-source -H 'Content-Type: application/json' -d '{\"integrationId\":\"...\",\"binding\":{}}'",
        refreshSources: "curl -s -X POST http://localhost:3000/api/workspace/refresh-sources -H 'Content-Type: application/json' -d '{\"sourceIds\":[\"...\"]}'",
      },
      docs: {
        resolverReadme: "apps/workspace/lib/adapters/integrations/resolvers/README.md",
        workspaceRuntime: "docs/WORKSPACE_BUILDER_RUNTIME_V1.md",
        adapterContracts: "docs/ADAPTER_CONTRACTS_V1.md",
        governedTopology: "docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md",
        workspaceAppReadme: "apps/workspace/README.md",
      },
    },
    currentState: {
      forkPath,
      appPath: appPath ?? null,
      resolverFiles,
      dataModelDynamicSources: dataModelObjects,
      configFound: Boolean(config),
    },
  };
}

async function runResolverContext(opts: { fork?: string; port?: string; json?: boolean }): Promise<void> {
  const forkPath = resolveForkPath(opts.fork);
  const port = Number(opts.port ?? 3000);
  const context = buildResolverContext(forkPath, port);

  if (opts.json) {
    console.log(JSON.stringify(context, null, 2));
    return;
  }

  const m = context.mentalModel as ReturnType<typeof buildResolverContext>["mentalModel"];
  const s = context.currentState as ReturnType<typeof buildResolverContext>["currentState"];

  console.log("");
  console.log(pc.bold("Workspace Resolver Architecture"));
  console.log(pc.dim("─".repeat(60)));
  console.log("");
  console.log(pc.bold("  Data flow (10-step)"));
  for (const step of (m as { dataFlow: string[] }).dataFlow) {
    console.log(`  ${pc.dim(step)}`);
  }

  console.log("");
  console.log(pc.bold("  Database persistence"));
  const dp = (m as { databasePersistence: { description: string; configFile: string; requiredEnvForFsWrite: string } }).databasePersistence;
  console.log(pc.dim(`  ${dp.description}`));
  console.log(pc.dim(`  Config file: ${dp.configFile}`));
  console.log(pc.dim(`  Required env: ${dp.requiredEnvForFsWrite}`));

  console.log("");
  console.log(pc.bold("  Troubleshooting checklist"));
  for (const item of (m as { troubleshootingChecklist: string[] }).troubleshootingChecklist) {
    console.log(`  ${pc.dim(item)}`);
  }

  console.log("");
  console.log(pc.bold("  Current state"));
  const cs = s as { resolverFiles: string[]; dataModelDynamicSources: unknown[] };
  console.log(`  Resolver files:   ${cs.resolverFiles.length === 0 ? pc.dim("none") : cs.resolverFiles.join(", ")}`);
  console.log(`  Dynamic sources:  ${cs.dataModelDynamicSources.length === 0 ? pc.dim("none registered") : String(cs.dataModelDynamicSources.length)}`);

  console.log("");
  console.log(pc.dim("  Full JSON context: growthub workspace resolvers context --json"));
  console.log(pc.dim("  Resolver README:   apps/workspace/lib/adapters/integrations/resolvers/README.md"));
  console.log("");
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerWorkspaceResolverCommands(workspaceCmd: Command): void {
  const resolversCmd = workspaceCmd
    .command("resolvers")
    .description(
      "List, test, and inspect integration resolvers — the server-side layer that connects bridge integrations to the workspace data model and source dropdown",
    )
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--port <port>", "Dev server port (default: 3000)", "3000")
    .option("--json", "Emit machine-readable JSON (agent-friendly)")
    .addHelpText(
      "after",
      `
Architecture:
  Bridge (auth confirmation) → Resolver file (provider API call) → Data model object (PATCH /api/workspace) → Source dropdown → Widget binding → Refresh

Data persistence:
  growthub.config.json is the local database in dev. PATCH /api/workspace writes dataModel.objects to disk.
  Live data rows persist to growthub.source-records.json via POST /api/workspace/refresh-sources.

Resolver file convention:
  lib/adapters/integrations/resolvers/<integration-id>.js
  One file per integration. File calls registerSourceResolver({ integrationId, entityTypes, fetchRecords }).
  Tokens are read from env server-side — never from config or client state.

Examples:
  $ growthub workspace resolvers
  $ growthub workspace resolvers --json
  $ growthub workspace resolvers test google-analytics --json
  $ growthub workspace resolvers context --json

Docs:
  apps/workspace/lib/adapters/integrations/resolvers/README.md
  docs/WORKSPACE_BUILDER_RUNTIME_V1.md
  docs/ADAPTER_CONTRACTS_V1.md

JSON shape (list):
  { appPath, serverReachable, resolverFiles, registeredIds, dataModelObjects, sourceDropdownSources, docs }
`,
    )
    .action((opts: { fork?: string; port?: string; json?: boolean }) => {
      runResolverList(opts).catch((err) => {
        if (opts.json) {
          console.log(JSON.stringify({ status: "error", error: String(err) }));
        } else {
          console.error(pc.red(String(err)));
        }
        process.exitCode = 1;
      });
    });

  resolversCmd
    .command("test <integration-id>")
    .description("Test a resolver against the live dev server — returns preview rows or error reason")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--port <port>", "Dev server port (default: 3000)", "3000")
    .option("--json", "Emit machine-readable JSON (agent-friendly)")
    .option("--entity-type <type>", "entityType to include in binding (e.g. ga4.traffic)")
    .option("--source-id <id>", "sourceId to include in binding")
    .addHelpText(
      "after",
      `
Calls POST /api/workspace/test-source on the running dev server.
Returns preview rows when the resolver is registered and credentials are valid.

Response contracts:
  ok: true  → { ok, integrationId, recordCount, columns, preview, entityTypes }
  no-resolver → { ok: false, reason: "no-resolver", registeredResolvers, hint }
  fetch-error → { ok: false, reason: "fetch-error", error: "<token not set or API error>" }

Required env in .env.local:
  WORKSPACE_CONFIG_ALLOW_FS_WRITE=true
  GROWTHUB_WORKSPACE_INTEGRATION_ADAPTER=growthub-bridge
  GROWTHUB_BRIDGE_ACCESS_TOKEN=<your bridge token>
  <PROVIDER>_ACCESS_TOKEN=<provider OAuth token or API key>

Examples:
  $ growthub workspace resolvers test google-analytics
  $ growthub workspace resolvers test google-analytics --entity-type ga4.traffic --json
  $ growthub workspace resolvers test shopify --port 3001 --json
`,
    )
    .action((integrationId: string, opts: { fork?: string; port?: string; json?: boolean; entityType?: string; sourceId?: string }) => {
      runResolverTest(integrationId, opts).catch((err) => {
        if (opts.json) {
          console.log(JSON.stringify({ status: "error", error: String(err) }));
        } else {
          console.error(pc.red(String(err)));
        }
        process.exitCode = 1;
      });
    });

  resolversCmd
    .command("context")
    .description("Full architectural mental model for agent troubleshooting — resolver files, data persistence, source dropdown, env conventions")
    .option("--fork <path>", "Fork root path (default: cwd)")
    .option("--port <port>", "Dev server port (default: 3000)", "3000")
    .option("--json", "Emit machine-readable JSON (agent-friendly)")
    .addHelpText(
      "after",
      `
Returns the complete resolver architecture as structured JSON including:
  - 10-step data flow from integration → source dropdown → widget
  - Database persistence model (growthub.config.json, growthub.source-records.json)
  - Source dropdown population logic and section breakdown
  - Env var naming convention for all provider types
  - Troubleshooting checklist (8 steps)
  - All CLI commands and curl equivalents
  - Doc references

Designed for agent consumption: pipe through jq or pass --json to another agent context.

Examples:
  $ growthub workspace resolvers context --json
  $ growthub workspace resolvers context --json | jq '.mentalModel.troubleshootingChecklist'
  $ growthub workspace resolvers context --json | jq '.mentalModel.dataFlow'
  $ growthub workspace resolvers context --json | jq '.currentState'
`,
    )
    .action((opts: { fork?: string; port?: string; json?: boolean }) => {
      runResolverContext(opts).catch((err) => {
        if (opts.json) {
          console.log(JSON.stringify({ status: "error", error: String(err) }));
        } else {
          console.error(pc.red(String(err)));
        }
        process.exitCode = 1;
      });
    });
}
