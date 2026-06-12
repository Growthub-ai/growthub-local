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
export const APP_REGISTRY_OBJECT_ID = "workspace-app-registry";
/** objectType of the registry object (preset ships in the Data Model). */
export const APP_SURFACE_OBJECT_TYPE = "app-surface";
export function isAppAssignmentPacket(value) {
    return (typeof value === "object" &&
        value !== null &&
        value.kind === "growthub-app-assignment-packet-v1" &&
        typeof value.appId === "string" &&
        Array.isArray(value.allowedRoutes));
}
/** Additive changes keep the literal `1`. */
export const WORKSPACE_APPS_CONTRACT_VERSION = 1;
//# sourceMappingURL=workspace-apps.js.map