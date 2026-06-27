/**
 * GET /api/workspace/apps
 *
 * Governed Application Control Plane V1 — the fleet read surface (contract:
 * `@growthub/api-contract/workspace-apps::WorkspaceAppsResponse`).
 *
 * Returns, read-only and secret-free:
 *
 *   - `apps[]`      — every application registered as a governed row of the
 *                     `workspace-app-registry` Data Model object: resolved
 *                     links (dashboards / workflows / data sources / APIs),
 *                     health rollup with computed blockers, the single next
 *                     action (with an href into the real surface), and the
 *                     machine-readable agent assignment packet.
 *   - `detected[]`  — app surfaces detected on the artifact's own filesystem
 *                     (same probe heuristics as the CLI's `workspace surface
 *                     list`, bridged into the runtime so registration never
 *                     requires a separate tool). Detection is advisory: an
 *                     app becomes GOVERNED only when a human/agent registers
 *                     it as a row via the normal PATCH lane.
 *   - `lens`        — the Fleet lens state (same deriver the Workspace Lens
 *                     panel renders), so humans and agents read one truth.
 *   - `summary`     — fleet counters.
 *
 * Authority invariants: GET only; mutations flow through the existing
 * governed routes; this route never throws on partial/absent config.
 */

import { NextResponse } from "next/server";
import fsSync from "node:fs";
import path from "node:path";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  readWorkspaceSourceRecords
} from "@/lib/workspace-config";
import { readAdapterConfig } from "@/lib/adapters/env";
import {
  APP_REGISTRY_OBJECT_ID,
  buildAppAssignmentPacket,
  deriveAppHealth,
  deriveAppNextAction,
  listAppSurfaceRows,
  summarizeFleet
} from "@/lib/workspace-app-registry";
import {
  deriveDeployLensState,
  deriveFleetLensState,
  deriveRuntimeDurability
} from "@/lib/workspace-activation";

/** Same safe runtime descriptor the swarm-condition route assembles. */
function safeRuntime(warnings) {
  const runtime = { persistenceMode: "", persistenceAdapter: null, allowFsWrite: false, nangoConfigured: false, deploy: {} };
  try {
    const persistence = describePersistenceMode();
    runtime.persistenceMode = persistence.mode;
    runtime.allowFsWrite = persistence.mode === "filesystem" && persistence.canSave === true;
    const adapter = readAdapterConfig();
    runtime.persistenceAdapter = persistence.mode === "database" ? (adapter.dataAdapter || null) : null;
    runtime.nangoConfigured = Boolean(adapter?.nango?.hasSecretKey);
    runtime.deploy = { target: adapter.deployTarget || "" };
  } catch (error) {
    warnings.push(`Failed to read runtime descriptor: ${error?.message || "unknown error"}`);
  }
  return runtime;
}

// Mirrors the CLI probe (cli/src/commands/workspace-surface.ts) so detection
// lives inside the artifact too — the bridge roadmap Item 4 called for.
const KNOWN_APP_DIRS = ["apps/workspace", "apps/agency-portal", "apps/portal", "studio", "app", "src"];

function detectFramework(absPath) {
  try {
    const entries = fsSync.readdirSync(absPath);
    if (entries.some((e) => e.startsWith("next.config."))) return "nextjs";
    if (entries.some((e) => e.startsWith("vite.config."))) return "vite";
  } catch {
    /* unreadable */
  }
  return "unknown";
}

function looksLikeAppSurface(absPath) {
  try {
    const has = (rel) => fsSync.existsSync(path.join(absPath, rel));
    return has("package.json") || has("index.html") || has("app") || has("pages") || has("src");
  } catch {
    return false;
  }
}

/** Read-only filesystem probe of the artifact root. Never throws. */
function detectAppSurfaces(warnings) {
  const detected = [];
  try {
    // The workspace app runs from <artifact>/apps/workspace.
    const artifactRoot = path.resolve(process.cwd(), "..", "..");
    const candidates = new Set(KNOWN_APP_DIRS);
    const appsDir = path.join(artifactRoot, "apps");
    if (fsSync.existsSync(appsDir)) {
      for (const entry of fsSync.readdirSync(appsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) candidates.add(`apps/${entry.name}`);
      }
    }
    for (const rel of Array.from(candidates).sort()) {
      const abs = path.join(artifactRoot, rel);
      if (!fsSync.existsSync(abs) || !fsSync.statSync(abs).isDirectory()) continue;
      if (!looksLikeAppSurface(abs)) continue;
      let packageName;
      try {
        packageName = JSON.parse(fsSync.readFileSync(path.join(abs, "package.json"), "utf8")).name;
      } catch {
        packageName = undefined;
      }
      detected.push({
        name: rel.split("/").pop(),
        relPath: rel,
        framework: detectFramework(abs),
        hasEnvExample: fsSync.existsSync(path.join(abs, ".env.example")),
        hasVercelJson: fsSync.existsSync(path.join(abs, "vercel.json")),
        hasGrowthubConfig: fsSync.existsSync(path.join(abs, "growthub.config.json")),
        ...(packageName ? { packageName } : {})
      });
    }
  } catch (error) {
    warnings.push(`Surface detection failed: ${error?.message || "unknown error"}`);
  }
  return detected;
}

async function GET() {
  const warnings = [];

  let workspaceConfig = {};
  try {
    workspaceConfig = (await readWorkspaceConfig()) || {};
  } catch (error) {
    warnings.push(`Failed to read workspace config: ${error?.message || "unknown error"}`);
  }
  let workspaceSourceRecords = {};
  try {
    workspaceSourceRecords = (await readWorkspaceSourceRecords()) || {};
  } catch {
    workspaceSourceRecords = {};
  }

  const runtime = safeRuntime(warnings);
  const metadataGraph = { runtime };
  const lensInput = { workspaceConfig, workspaceSourceRecords, metadataGraph };
  const dur = deriveRuntimeDurability(metadataGraph);
  const runtimeFlags = {
    durable: dur.durable,
    readOnly: dur.readOnly,
    deployReady: deriveDeployLensState(lensInput).complete
  };

  const apps = listAppSurfaceRows(workspaceConfig).map((row) => {
    const health = deriveAppHealth(workspaceConfig, workspaceSourceRecords, row, runtimeFlags);
    return {
      appId: String(row.appId || row.Name || "").trim(),
      name: String(row.Name || "").trim(),
      surfacePath: String(row.surfacePath || "").trim() || null,
      framework: String(row.framework || "").trim() || null,
      owner: String(row.owner || "").trim() || null,
      environment: String(row.environment || "").trim() || null,
      deployTarget: String(row.deployTarget || "").trim() || null,
      registryHref: `/data-model?object=${APP_REGISTRY_OBJECT_ID}`,
      health: { status: health.status, blockers: health.blockers, linkedCount: health.linkedCount },
      links: health.links,
      nextAction: deriveAppNextAction(row, health),
      assignment: buildAppAssignmentPacket(workspaceConfig, workspaceSourceRecords, row, runtimeFlags)
    };
  });

  return NextResponse.json({
    ok: true,
    registryObjectId: APP_REGISTRY_OBJECT_ID,
    apps,
    detected: detectAppSurfaces(warnings),
    lens: deriveFleetLensState(lensInput),
    summary: summarizeFleet(apps),
    ...(warnings.length ? { warnings } : {})
  });
}

export { GET };
