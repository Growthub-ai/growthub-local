/**
 * GET /api/workspace/env-status
 *
 * The honest, secret-safe auth-readiness signal the creation cockpit needs.
 * Returns the referenced auth/env ref SLUGS that currently resolve to a value
 * in the server runtime (process.env) — so the api-registry drawer can mark
 * "auth configured" from real runtime truth instead of guessing. Never returns,
 * logs, or hashes a value.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, describePersistenceMode } from "@/lib/workspace-config";
import { computeConfiguredEnvRefs, listPersistenceAdapterReadiness } from "@/lib/env-status";

async function GET() {
  let workspaceConfig = {};
  try {
    workspaceConfig = await readWorkspaceConfig();
  } catch {
    workspaceConfig = {};
  }
  const configuredEnvRefs = computeConfiguredEnvRefs(workspaceConfig, process.env);
  const persistenceAdapters = listPersistenceAdapterReadiness(process.env);
  // Persistence mode + canSave so the scheduler provisioning cockpit can honestly
  // gate the "set it up for me" action (server-file writes need a writable runtime).
  const persistence = describePersistenceMode();
  return NextResponse.json({
    kind: "growthub-env-status-v1",
    configuredEnvRefs,
    persistenceAdapters,
    persistence: { mode: persistence.mode, canSave: persistence.canSave === true },
  });
}

export { GET };
