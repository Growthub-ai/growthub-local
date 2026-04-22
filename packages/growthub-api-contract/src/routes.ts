/**
 * Growthub API v1 — Canonical Route Names
 *
 * Single source of truth for the HTTP routes that make up v1. The CLI
 * and hosted server both import from here so renaming a path is a
 * one-file change.
 *
 * Stability: v1. Paths are additive-only until v2.
 */

export const GROWTHUB_API_VERSION = "1" as const;

export const GROWTHUB_API_ROUTES = {
  cliSession: "/api/cli/session",
  cliProfile: "/api/cli/profile",
  cliCapabilities: "/api/cli/capabilities",
  executeWorkflow: "/api/execute-workflow",
  threadBind: "/api/projects/threads/bind",
  providerReport: "/api/sandbox/provider-report",
  providerProbe: "/api/providers/growthub-local/probe",
} as const;

export type GrowthubApiRouteKey = keyof typeof GROWTHUB_API_ROUTES;

/**
 * Required HTTP headers the CLI attaches to every authenticated request.
 */
export const GROWTHUB_API_HEADERS = {
  authorization: "authorization",
  userId: "x-user-id",
  manifestHash: "x-growthub-manifest-hash",
  apiVersion: "x-growthub-api-version",
} as const;
