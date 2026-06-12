/**
 * @growthub/api-contract — Governed Application Control Plane V1 (CMS SDK v1)
 *
 * Applications as first-class governed workspace entities. The source of
 * truth is one governed Data Model object — `workspace-app-registry`
 * (objectType `"app-surface"`), one row per application — flowing through
 * the same PATCH allowlist, mutation policy, validator, and outcome
 * receipts as every other governed object. No parallel registry service.
 *
 * Read surface: `GET /api/workspace/apps` (fleet state: resolved links,
 * health rollups, computed next actions, agent assignment packets, detected
 * filesystem surfaces, and the Fleet lens state). The Fleet lens itself is
 * registered in the workspace lens registry (roadmap Item 4, un-staged) and
 * is also addressable via `GET /api/workspace/swarm-condition?lensId=fleet`.
 *
 * Type-only plus frozen vocabulary constants. Runtime truth lives in the
 * workspace app (`lib/workspace-app-registry.js`).
 */

/** Well-known Data Model object id holding the registry rows. */
export const APP_REGISTRY_OBJECT_ID = "workspace-app-registry" as const;
/** objectType of the registry object (preset ships in the Data Model). */
export const APP_SURFACE_OBJECT_TYPE = "app-surface" as const;

/**
 * The governed registry row shape (Data Model grid columns). Reference
 * fields are comma-separated id lists; `workflowRefs` entries are
 * `"<objectId>:<RowName>"`. Rows reference governed parts — never embed them.
 */
export interface AppSurfaceRow {
  /** Capital-N row identity (Data Model convention). */
  Name: string;
  appId?: string;
  /** Repo-relative app surface path (e.g. `apps/workspace`). */
  surfacePath?: string;
  framework?: string;
  packageName?: string;
  owner?: string;
  environment?: string;
  deployTarget?: string;
  status?: string;
  dashboardIds?: string;
  workflowRefs?: string;
  dataSourceIds?: string;
  registryIds?: string;
  exportStatus?: string;
  description?: string;
}

export type AppHealthStatus = "ready" | "blocked" | "empty";

export interface AppLinkRollup {
  dashboards: { found: Array<{ id: string; name: string }>; missing: Array<{ id: string; name: string }> };
  workflows: {
    found: Array<{
      ref: string;
      objectId: string;
      rowName: string;
      lifecycleStatus: string;
      live: boolean;
      lastRunOk: boolean;
      hasDraft: boolean;
    }>;
    missing: Array<{ ref: string; objectId: string; rowName: string }>;
  };
  dataSources: { found: Array<{ id: string; sourceId: string | null; hydrated: boolean }>; missing: Array<{ id: string }> };
  apis: { found: Array<{ integrationId: string; connected: boolean }>; missing: Array<{ integrationId: string }> };
}

export interface AppNextAction {
  label: string;
  description: string;
  /** Deep link into the real surface that unblocks the app. */
  href: string;
}

/**
 * Machine-readable, app-scoped swarm assignment — the governed scope an
 * agent works inside: goal, blockers, allowed routes, forbidden actions,
 * expected evidence, and the object refs it may touch. Never secrets.
 */
export interface AppAssignmentPacket {
  kind: "growthub-app-assignment-packet-v1";
  version: 1;
  appId: string;
  appName: string;
  surfacePath: string | null;
  goal: string;
  currentState: AppHealthStatus | (string & {});
  blockers: string[];
  nextAction: AppNextAction;
  objectRefs: Array<{ objectId: string; rowName?: string }>;
  allowedRoutes: string[];
  forbiddenActions: string[];
  expectedEvidence: string[];
}

export interface WorkspaceAppEntry {
  appId: string;
  name: string;
  surfacePath: string | null;
  framework: string | null;
  owner: string | null;
  environment: string | null;
  deployTarget: string | null;
  registryHref: string;
  health: { status: AppHealthStatus | (string & {}); blockers: string[]; linkedCount: number };
  links: AppLinkRollup;
  nextAction: AppNextAction;
  assignment: AppAssignmentPacket;
}

/** Filesystem app-surface probe result (advisory — registration is governed). */
export interface DetectedAppSurface {
  name: string;
  relPath: string;
  framework: "nextjs" | "vite" | "unknown";
  hasEnvExample: boolean;
  hasVercelJson: boolean;
  hasGrowthubConfig: boolean;
  packageName?: string;
}

export interface WorkspaceFleetSummary {
  total: number;
  ready: number;
  blocked: number;
  empty: number;
}

/** Response of `GET /api/workspace/apps`. */
export interface WorkspaceAppsResponse {
  ok: boolean;
  registryObjectId: typeof APP_REGISTRY_OBJECT_ID;
  apps: WorkspaceAppEntry[];
  detected: DetectedAppSurface[];
  /** Fleet lens state (`growthub-workspace-lens-state-v1`). */
  lens: Record<string, unknown>;
  summary: WorkspaceFleetSummary;
  warnings?: string[];
}

export function isAppAssignmentPacket(value: unknown): value is AppAssignmentPacket {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "growthub-app-assignment-packet-v1" &&
    typeof (value as { appId?: unknown }).appId === "string" &&
    Array.isArray((value as { allowedRoutes?: unknown }).allowedRoutes)
  );
}

/** Additive changes keep the literal `1`. */
export const WORKSPACE_APPS_CONTRACT_VERSION = 1 as const;
