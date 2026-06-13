/**
 * GET /api/workspace/simulation
 *
 * Growthub Workspace Causal Simulation V1 — read-only predictive projection.
 *
 * The forward-looking sibling of /api/workspace/swarm-condition: instead of
 * "what is eligible next", it returns a deterministic PREDICTION for a use case
 * — likely outcome, completion distribution (a seeded "simulated reality"), the
 * eligibility trajectory, and the ranked causal drivers that most move the
 * prediction. All derived from the same workspace artifact + recorded run
 * evidence; nothing executes.
 *
 * Optional query parameters:
 *   - lensId: "activation" (default — or the workspace's own nextAction lens)
 *             | "persistence" | "observability" | "deploy" | "tasks"
 *             | "app-build" | "fleet". Unknown ids fall back to "activation".
 *   - trials: Monte-Carlo trials (1..5000, default 500).
 *   - seed:   RNG seed for reproducibility (default 1).
 *
 * Authority invariants (identical to swarm-condition):
 *   - GET only. Writes still flow through the existing governed routes
 *     (`PATCH /api/workspace`, `POST /api/workspace/sandbox-run`, etc.).
 *   - growthub.config.json remains the authoritative artifact.
 *   - No secrets, connection IDs, or tokens are returned.
 *   - Read OR derivation failures fall back to a typed envelope with warnings —
 *     this route never throws.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, readWorkspaceSourceRecords } from "@/lib/workspace-config";
import { deriveWorkspaceSimulation, SIMULATION_KIND, SIMULATION_VERSION } from "@/lib/workspace-simulation";

async function GET(request) {
  const warnings = [];

  let lensId = "";
  let trials;
  let seed;
  try {
    const url = request && request.url ? new URL(request.url) : null;
    if (url) {
      lensId = (url.searchParams.get("lensId") || "").trim();
      const t = url.searchParams.get("trials");
      const s = url.searchParams.get("seed");
      if (t != null && t !== "") trials = Number(t);
      if (s != null && s !== "") seed = Number(s);
    }
  } catch (error) {
    warnings.push(`Failed to parse query: ${error?.message || "unknown error"}`);
  }

  let workspaceConfig = {};
  try {
    workspaceConfig = (await readWorkspaceConfig()) || {};
  } catch (error) {
    warnings.push(`Failed to read workspace config: ${error?.message || "unknown error"}`);
  }

  let workspaceSourceRecords = {};
  try {
    workspaceSourceRecords = (await readWorkspaceSourceRecords()) || {};
  } catch (error) {
    warnings.push(`Failed to read source records sidecar: ${error?.message || "unknown error"}`);
  }

  let simulation;
  try {
    simulation = deriveWorkspaceSimulation(
      { workspaceConfig, workspaceSourceRecords },
      { lensId, trials, seed },
    );
  } catch (error) {
    warnings.push(`Failed to derive simulation: ${error?.message || "unknown error"}`);
    simulation = {
      kind: SIMULATION_KIND,
      version: SIMULATION_VERSION,
      target: { lensId: "activation", label: "activation", complete: false },
      prediction: { successProbability: 0, completionRate: 0, confidence: 0, expectedOutcome: "uncertain", rationale: "Derivation failed." },
      drivers: [],
      trajectory: { predictedComplete: false, predictedStepsToComplete: 0, steps: [] },
      distribution: { trials: 0, seed: 0, completionRate: 0, depthHistogram: [], meanDepth: 0, p50Depth: 0, p90Depth: 0 },
      evidence: { runs: 0, okRuns: 0, failedRuns: 0, rewardSamples: 0, meanReward: null, baseSuccess: 0.5 },
    };
  }

  return NextResponse.json({ ...simulation, warnings });
}

export { GET };
