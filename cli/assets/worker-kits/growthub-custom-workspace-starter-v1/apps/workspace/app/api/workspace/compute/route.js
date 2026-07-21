/**
 * GET /api/workspace/compute
 *
 * Governed Compute Realization V1 — the compute read surface (contract:
 * `@growthub/api-contract/compute`).
 *
 * Returns, read-only and secret-free:
 *
 *   - `adapters[]`   — registered compute provider adapters (id/label/locality).
 *   - `providers[]`  — every derived compute provider: the builtin local
 *                      machine (capacity from the SAME stamped preflight
 *                      evidence the training probes produce) plus one entry
 *                      per governed API Registry row carrying
 *                      `metadata.computeProvider` (schema
 *                      growthub-compute-provider-v1), each with its honest
 *                      status ladder: invalid-row / adapter-missing /
 *                      credential-missing / ready. Credential state is
 *                      presence-only (env-var NAMES); values never appear.
 *   - `capacity`     — the current capacity plan for the workspace's training
 *                      identity: requirements derived from the adaptive
 *                      student plan + preflight, the resolved Capacity
 *                      Profile, and the local compatibility verdict.
 *
 * Authority invariants: GET only — this route has NO mutation behavior; the
 * governed provider rows change through the normal PATCH lane and execution
 * flows through the existing POST /api/workspace/sandbox-run. Never throws
 * on partial/absent config.
 */

import { NextResponse } from "next/server";
import {
  readWorkspaceConfig,
  readWorkspaceSourceRecords
} from "@/lib/workspace-config";
import {
  describeRegisteredComputeProviderAdapters,
  ensureComputeAdaptersLoaded,
  listComputeProviderAdapters
} from "@/lib/adapters/compute/index.js";
import { deriveComputeProviders } from "@/lib/compute-provider-registry";
import { deriveCapacityPlan } from "@/lib/compute-capacity-profiles";
import { buildAdaptiveStudentPlan } from "@/lib/distillation-student-plan";
import { deriveTrainingRunState } from "@/lib/training-run-receipts";

/** Latest stamped preflight evidence from the governed run receipts. */
function stampedPreflight(workspaceConfig, workspaceSourceRecords) {
  try {
    const runState = deriveTrainingRunState({ workspaceConfig, workspaceSourceRecords });
    return runState?.preflight || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const warnings = [];
  let workspaceConfig = {};
  let workspaceSourceRecords = {};
  try {
    workspaceConfig = await readWorkspaceConfig();
  } catch (error) {
    warnings.push(`workspace config unreadable: ${String(error?.message || error)}`);
  }
  try {
    workspaceSourceRecords = await readWorkspaceSourceRecords();
  } catch (error) {
    warnings.push(`source records unreadable: ${String(error?.message || error)}`);
  }

  await ensureComputeAdaptersLoaded();

  const preflight = stampedPreflight(workspaceConfig, workspaceSourceRecords);
  const providersState = deriveComputeProviders({
    workspaceConfig,
    registeredAdapterIds: listComputeProviderAdapters(),
    // Presence ONLY — the deriver never sees values; this route never
    // returns them.
    envPresent: (name) => Boolean(process.env[String(name)]),
    preflight,
  });

  const plan = buildAdaptiveStudentPlan({ preflight });
  const capacity = deriveCapacityPlan({ plan, preflight, workloadKind: "fine-tune" });

  return NextResponse.json({
    ok: true,
    contract: "growthub-compute-provider-v1",
    adapters: describeRegisteredComputeProviderAdapters(),
    providers: providersState.providers,
    invalidRows: providersState.invalid,
    capacity,
    preflightPresent: Boolean(preflight),
    ...(warnings.length ? { warnings } : {}),
  });
}
