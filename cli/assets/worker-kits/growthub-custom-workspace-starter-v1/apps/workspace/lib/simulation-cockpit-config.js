/**
 * Shared Simulation Cockpit configuration (pure module — no React, no fetch,
 * no config writes). This is the SINGLE contract that the simulation cockpit
 * uses everywhere it appears: the Workspace Lens action button and the
 * `/simulate` helper command both open the same cockpit driven by this config,
 * exactly as the swarm cockpit is shared between the workflow canvas and the
 * helper sidecar.
 *
 * It exposes:
 *   - the read-only endpoint the cockpit calls (swarm-predictability route) ;
 *   - the governed parameter fields (agents / tasks / concurrency / seed) with
 *     clamps identical to the server deriver ;
 *   - pure presenters (verdict → dot variant + label, one-line summary) so the
 *     UI never invents its own vocabulary.
 *
 * Boundaries: read-only. The cockpit it configures calls a GET route and
 * writes nothing. No new mutation path, no SDK contract change.
 */

export const SIMULATION_VIEW = "simulation";
export const SIMULATION_ENDPOINT = "/api/workspace/swarm-predictability";

// Clamps mirror lib/swarm-society-simulation.js exactly so the cockpit cannot
// request a simulation the deriver would reject.
export const SIMULATION_PARAM_FIELDS = [
  { key: "agents", label: "Virtual agents", min: 1, max: 512, fallback: 8, hint: "Population size for the simulated swarm." },
  { key: "tasksPerAgent", label: "Tasks per agent", min: 1, max: 5000, fallback: 10, hint: "Workload each agent runs." },
  { key: "concurrency", label: "Concurrency", min: 1, max: 512, fallback: 8, hint: "Agents acting per tick (≤ population)." },
  { key: "seed", label: "Seed", min: 0, max: 2 ** 31 - 1, fallback: 1, hint: "Same seed ⇒ identical simulation." },
];

export const DEFAULT_SIMULATION_PARAMS = SIMULATION_PARAM_FIELDS.reduce((acc, f) => {
  acc[f.key] = f.fallback;
  return acc;
}, {});

export function clampSimulationParam(key, value) {
  const field = SIMULATION_PARAM_FIELDS.find((f) => f.key === key);
  if (!field) return value;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return field.fallback;
  return Math.max(field.min, Math.min(field.max, n));
}

/** Build the read-only query string for the swarm-predictability route. */
export function buildSimulationQuery(params = {}) {
  const merged = { ...DEFAULT_SIMULATION_PARAMS, ...params };
  const qs = SIMULATION_PARAM_FIELDS
    .map((f) => `${f.key}=${encodeURIComponent(clampSimulationParam(f.key, merged[f.key]))}`)
    .join("&");
  return `${SIMULATION_ENDPOINT}?${qs}`;
}

/**
 * Map a predictability verdict to the SAME dot vocabulary the swarm cockpit
 * uses (dm-run-console__tree-dot data-variant) plus a human label.
 */
export function verdictPresentation(verdict) {
  switch (String(verdict || "")) {
    case "safe-to-clone":
      return { variant: "ok", label: "Safe to clone", tone: "ok" };
    case "review-before-clone":
      return { variant: "active", label: "Review before clone", tone: "warn" };
    case "unsafe-diverging":
      return { variant: "fail", label: "Unsafe — diverging", tone: "fail" };
    case "insufficient-evidence":
    default:
      return { variant: "pending", label: "Insufficient evidence", tone: "pending" };
  }
}

/** One-line summary for the cockpit header / receipts. */
export function summarizeSimulationReport(report) {
  if (!report || typeof report !== "object") return "No simulation yet.";
  const v = verdictPresentation(report.verdict);
  const rate = Number(report.expectedViolationRatePer1000);
  const safe = report.safeConcurrency;
  return `${v.label} · ${Number.isFinite(rate) ? rate : "—"}/1k violations · safe concurrency ${safe ?? "—"}`;
}
