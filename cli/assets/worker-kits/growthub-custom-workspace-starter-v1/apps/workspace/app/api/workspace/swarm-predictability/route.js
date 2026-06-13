/**
 * GET /api/workspace/swarm-predictability
 *
 * Swarm Society Simulation V1 — read-only predictability projection.
 *
 * Empirically-grounded agent-based modeling over the SHIPPED Agent Outcome
 * Receipt stream (`workspace:agent-outcomes`). Learns per-agent behavior from
 * real receipts, runs a virtual swarm society through a workload over the
 * governed object environment, and returns a Swarm Predictability Report —
 * expected violation rate, contention hotspots, swarm stability, and a safe
 * concurrency limit — BEFORE a workspace is cloned to a new tenant.
 *
 * Optional query parameters:
 *   - agents:        virtual agent population (1..512; default = profiled count).
 *   - tasksPerAgent: workload per agent (1..5000; default 10).
 *   - concurrency:   agents acting per tick (default = agents).
 *   - seed:          RNG seed for reproducibility (default 1).
 *   - groupBy:       "actor" (default) | "lane" | "kind".
 *
 * Authority invariants (identical to swarm-condition / simulation):
 *   - GET only. The simulator WRITES NOTHING — simulation receipts are
 *     in-memory return data flagged isSimulation:true; the real receipt stream
 *     is read, never mutated. Writes still flow only through PATCH
 *     /api/workspace and POST /api/workspace/sandbox-run.
 *   - No secrets returned. Read/derivation failures fall back to a typed
 *     envelope with warnings — this route never throws.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig } from "@/lib/workspace-config";
import { readOutcomeReceipts } from "@/lib/workspace-outcome-receipts";
import { deriveSwarmPredictabilityReport, PREDICTABILITY_KIND, VERSION } from "@/lib/swarm-society-simulation";

function numParam(url, key) {
  const v = url ? url.searchParams.get(key) : null;
  return v != null && v !== "" ? Number(v) : undefined;
}

async function GET(request) {
  const warnings = [];

  const options = {};
  try {
    const url = request && request.url ? new URL(request.url) : null;
    if (url) {
      options.agents = numParam(url, "agents");
      options.tasksPerAgent = numParam(url, "tasksPerAgent");
      options.concurrency = numParam(url, "concurrency");
      options.seed = numParam(url, "seed");
      const groupBy = (url.searchParams.get("groupBy") || "").trim();
      if (groupBy) options.groupBy = groupBy;
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

  let receipts = [];
  try {
    const stream = await readOutcomeReceipts();
    receipts = Array.isArray(stream) ? stream : (Array.isArray(stream?.records) ? stream.records : []);
  } catch (error) {
    warnings.push(`Failed to read agent-outcome receipts: ${error?.message || "unknown error"}`);
  }

  let report;
  try {
    report = deriveSwarmPredictabilityReport({ receipts, workspaceConfig, options });
  } catch (error) {
    warnings.push(`Failed to derive predictability report: ${error?.message || "unknown error"}`);
    report = {
      kind: PREDICTABILITY_KIND,
      version: VERSION,
      verdict: "insufficient-evidence",
      fidelity: 0,
      expectedViolationRatePer1000: 0,
      meanTimeToResolveTicks: 0,
      swarmStability: "stable",
      safeConcurrency: 1,
      concurrencyLadder: [],
      contentionHotspots: [],
      behaviorProfiles: [],
      global: { receiptCount: 0 },
      simulation: null,
      rationale: "Derivation failed.",
    };
  }

  return NextResponse.json({ ...report, warnings });
}

export { GET };
