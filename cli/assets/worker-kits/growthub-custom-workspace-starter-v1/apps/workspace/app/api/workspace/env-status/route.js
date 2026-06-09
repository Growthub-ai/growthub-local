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
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { computeConfiguredEnvRefs } from "@/lib/env-status";

async function GET() {
  let workspaceConfig = {};
  try {
    workspaceConfig = await readWorkspaceConfig();
  } catch {
    workspaceConfig = {};
  }
  const configuredEnvRefs = computeConfiguredEnvRefs(workspaceConfig, process.env);
  return NextResponse.json({
    kind: "growthub-env-status-v1",
    configuredEnvRefs,
  });
}

export { GET };
