/**
 * Workspace Causal Simulation V1 — a pure, deterministic PREDICTIVE deriver.
 *
 * This is the forward-looking continuation of the Causation ITT eligibility
 * drivers (docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md). Those drivers answer
 * "given the current workspace artifact, what is eligible NEXT". This deriver
 * answers the predictive question:
 *
 *   "given the current workspace artifact and its recorded run evidence, what
 *    is the likely OUTCOME of pursuing a use case, what does completing it
 *    unlock, and which causal drivers most move that prediction?"
 *
 * It is a deriver, not a runtime. Hard boundaries (identical to every other
 * driver in this kit):
 *   - PURE: a deterministic function over the same { workspaceConfig,
 *     workspaceSourceRecords, metadataGraph } envelope deriveWorkspaceState
 *     consumes. No I/O, no fetch, no fs, no config writes, no mutation.
 *   - NO new SDK contract, NO new schema, NO new mutation path. It reads the
 *     canonical eligibility substrate (deriveWorkspaceState) and the recorded
 *     run evidence already persisted on sandbox-environment rows.
 *   - NEVER throws — every access is guarded; bad input yields a typed,
 *     low-confidence prediction with a rationale.
 *
 * Algorithmic design (causation-derivation prediction):
 *   1. Eligibility substrate  — deriveWorkspaceState gives the lens steps
 *      (complete | pending | blocked | optional) for the target use case.
 *   2. Empirical priors       — recorded sandbox run evidence (ok/failed
 *      counts + parsed swarm reward scores) gives a Laplace-smoothed base
 *      success probability per step.
 *   3. Analytic prediction    — sequential reliability over the incomplete
 *      required steps: P(complete) = Π p(step). Blocked steps carry a
 *      prerequisite gate factor.
 *   4. Monte-Carlo simulation — a SEEDED (reproducible) first-failure-depth
 *      model over the same per-step probabilities yields the "simulated
 *      reality" distribution: completion rate + how far a typical run gets.
 *   5. Causal drivers         — counterfactual sensitivity: for each incomplete
 *      step, the marginal lift in P(complete) if that one driver were resolved,
 *      ranked. This is the "what to fix first" signal, derived not guessed.
 */

import { deriveWorkspaceState } from "./workspace-activation.js";

const SIMULATION_KIND = "growthub-workspace-simulation-v1";
const SIMULATION_VERSION = 1;

const DEFAULT_TRIALS = 500;
const MAX_TRIALS = 5000;
const DEFAULT_SEED = 1;
const LAPLACE_ALPHA = 1; // additive smoothing so zero evidence ⇒ 0.5, not 0/1
const BLOCKED_GATE = 0.6; // a blocked step is harder until its prerequisite clears
const PROB_FLOOR = 0.02;
const PROB_CEIL = 0.98;
const NO_EVIDENCE_PRIOR = 0.5;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value) {
  return value == null ? "" : String(value);
}

function clampProb(p) {
  if (!Number.isFinite(p)) return PROB_FLOOR;
  return Math.max(PROB_FLOOR, Math.min(PROB_CEIL, p));
}

function clampInt(value, fallback, lo, hi) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

/** Deterministic 32-bit PRNG (mulberry32). Seeded ⇒ reproducible simulations. */
function makeRng(seed = DEFAULT_SEED) {
  let state = (Number(seed) >>> 0) || 1;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseSafe(value) {
  if (isPlainObject(value)) return value;
  const text = safeString(value).trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Empirical run priors from the workspace artifact. Scans sandbox-environment
 * rows' recorded last run (`row.lastResponse`) for ok/failed outcomes and any
 * parsed swarm reward score. Returns a Laplace-smoothed base success rate.
 */
function collectRunEvidence(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  let okRuns = 0;
  let failedRuns = 0;
  const rewardScores = [];
  for (const object of objects) {
    if (!isPlainObject(object) || object.objectType !== "sandbox-environment") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (!isPlainObject(row)) continue;
      const last = parseSafe(row.lastResponse);
      const statusField = safeString(row.status).trim().toLowerCase();
      if (last) {
        const exitCode = Number.isFinite(last.exitCode) ? Number(last.exitCode) : null;
        const ok = exitCode === 0 && !safeString(last.error).trim();
        if (exitCode != null || safeString(last.error).trim()) {
          if (ok) okRuns += 1; else failedRuns += 1;
        }
        const score = Number(last?.swarm?.reward?.score);
        if (Number.isFinite(score)) rewardScores.push(Math.max(0, Math.min(1, score)));
      } else if (statusField === "ok" || statusField === "tested" || statusField === "success") {
        okRuns += 1;
      } else if (statusField === "failed" || statusField === "error") {
        failedRuns += 1;
      }
    }
  }
  const runs = okRuns + failedRuns;
  const meanReward = rewardScores.length
    ? rewardScores.reduce((s, v) => s + v, 0) / rewardScores.length
    : null;
  const baseSuccess = runs === 0
    ? NO_EVIDENCE_PRIOR
    : (okRuns + LAPLACE_ALPHA) / (runs + 2 * LAPLACE_ALPHA);
  return {
    runs,
    okRuns,
    failedRuns,
    rewardSamples: rewardScores.length,
    meanReward: meanReward == null ? null : Number(meanReward.toFixed(4)),
    baseSuccess: Number(baseSuccess.toFixed(4)),
  };
}

function stepIsDone(step) {
  const status = safeString(step?.status).trim().toLowerCase();
  return status === "complete" || status === "optional";
}

function stepIsBlocked(step) {
  return safeString(step?.status).trim().toLowerCase() === "blocked";
}

/**
 * Per-step success probability: empirical base blended with mean reward, gated
 * down when the step is blocked (its prerequisite is not yet met).
 */
function stepSuccessProbability(step, evidence) {
  const base = evidence.meanReward == null
    ? evidence.baseSuccess
    : 0.5 * evidence.baseSuccess + 0.5 * evidence.meanReward;
  const gated = stepIsBlocked(step) ? base * BLOCKED_GATE : base;
  return clampProb(gated);
}

/**
 * Seeded Monte-Carlo first-failure-depth simulation over the incomplete steps,
 * in declared order. Each trial advances step-by-step; a step clears with its
 * probability, otherwise the trial stops (its prerequisite chain breaks). The
 * depth distribution is the "simulated reality": how far a typical attempt
 * gets, and how often it completes the whole use case.
 */
function simulateDepthDistribution(stepProbs, trials, seed) {
  const n = stepProbs.length;
  const histogram = new Array(n + 1).fill(0);
  if (n === 0) {
    histogram[0] = trials;
    return { histogram, completions: trials };
  }
  const rng = makeRng(seed);
  let completions = 0;
  for (let t = 0; t < trials; t += 1) {
    let depth = 0;
    for (let i = 0; i < n; i += 1) {
      if (rng() < stepProbs[i]) depth += 1; else break;
    }
    histogram[depth] += 1;
    if (depth === n) completions += 1;
  }
  return { histogram, completions };
}

function percentileDepth(histogram, trials, q) {
  if (trials <= 0) return 0;
  const target = q * trials;
  let cumulative = 0;
  for (let depth = 0; depth < histogram.length; depth += 1) {
    cumulative += histogram[depth];
    if (cumulative >= target) return depth;
  }
  return histogram.length - 1;
}

function meanDepth(histogram, trials) {
  if (trials <= 0) return 0;
  let sum = 0;
  for (let depth = 0; depth < histogram.length; depth += 1) sum += depth * histogram[depth];
  return Number((sum / trials).toFixed(3));
}

function classifyDriver(step) {
  if (stepIsBlocked(step)) return "prerequisite";
  return "next-step";
}

/**
 * Resolve the target lens state for the use case. Defaults to the lens the
 * workspace's own nextAction points at, else the primary activation lens.
 */
function resolveTargetLens(state, requestedLensId) {
  const lensId = safeString(requestedLensId).trim()
    || safeString(state?.nextAction?.lensId).trim()
    || "activation";
  if (lensId === "activation") {
    return { lensId: "activation", lensState: state.primary };
  }
  const lensState = isPlainObject(state?.lenses) ? state.lenses[lensId] : null;
  if (lensState) return { lensId, lensState };
  return { lensId: "activation", lensState: state.primary };
}

/**
 * Pure prediction core: given the target's lens steps and the empirical run
 * evidence, produce the analytic prediction, the seeded Monte-Carlo
 * distribution, the ranked causal drivers, and the eligibility trajectory.
 * Extracted so the math is unit-testable with synthetic steps, independent of
 * how the steps were derived.
 *
 * @param {Array}  steps     lens steps ({ id, label, status })
 * @param {object} evidence  collectRunEvidence() output
 * @param {object} [options] { trials, seed }
 */
function predictFromSteps(steps, evidence, options = {}) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  const trials = clampInt(options.trials, DEFAULT_TRIALS, 1, MAX_TRIALS);
  const seed = clampInt(options.seed, DEFAULT_SEED, 0, 2 ** 31 - 1);

  // Incomplete REQUIRED steps, in declared order — the path to the outcome.
  const incomplete = safeSteps.filter((s) => !stepIsDone(s));
  const stepProbs = incomplete.map((s) => stepSuccessProbability(s, evidence));

  // Analytic prediction: sequential reliability P(complete) = Π p(step).
  const analyticCompletion = stepProbs.reduce((acc, p) => acc * p, 1);

  // Monte-Carlo simulated reality (seeded ⇒ reproducible).
  const { histogram, completions } = simulateDepthDistribution(stepProbs, trials, seed);
  const completionRate = completions / trials;

  // Confidence grows with recorded run evidence (Laplace-style), and is high
  // when there is nothing left to do.
  const confidence = incomplete.length === 0
    ? 1
    : Number((evidence.runs / (evidence.runs + 3)).toFixed(4));

  let expectedOutcome;
  if (incomplete.length === 0) expectedOutcome = "complete";
  else if (completionRate >= 0.5) expectedOutcome = "likely-complete";
  else if (incomplete.some(stepIsBlocked)) expectedOutcome = "blocked-pending-prerequisite";
  else expectedOutcome = "uncertain";

  // Causal drivers: counterfactual marginal lift in P(complete) if each single
  // incomplete step were resolved (p→1). impact = Π/p(step) − Π. Ranked.
  const drivers = incomplete
    .map((step, i) => {
      const p = stepProbs[i];
      const lifted = p > 0 ? analyticCompletion / p : analyticCompletion;
      const impact = Number((lifted - analyticCompletion).toFixed(4));
      return {
        stepId: safeString(step.id),
        label: safeString(step.label),
        kind: classifyDriver(step),
        probability: Number(p.toFixed(4)),
        impact,
        detail: stepIsBlocked(step)
          ? "Prerequisite unmet — resolving it unblocks the rest of the path."
          : "Incomplete step on the critical path to this outcome.",
      };
    })
    .sort((a, b) => b.impact - a.impact);

  const trajectory = {
    predictedComplete: analyticCompletion >= 0.5,
    predictedStepsToComplete: incomplete.length,
    steps: safeSteps.map((step, order) => {
      const done = stepIsDone(step);
      const p = done ? 1 : stepSuccessProbability(step, evidence);
      return {
        stepId: safeString(step.id),
        label: safeString(step.label),
        order,
        probability: Number(p.toFixed(4)),
        predictedStatus: done
          ? "done"
          : (p >= 0.5 ? "predicted-clear" : "predicted-block"),
      };
    }),
  };

  return {
    incompleteCount: incomplete.length,
    prediction: {
      successProbability: Number(analyticCompletion.toFixed(4)),
      completionRate: Number(completionRate.toFixed(4)),
      confidence,
      expectedOutcome,
    },
    drivers,
    trajectory,
    distribution: {
      trials,
      seed,
      completionRate: Number(completionRate.toFixed(4)),
      depthHistogram: histogram,
      meanDepth: meanDepth(histogram, trials),
      p50Depth: percentileDepth(histogram, trials, 0.5),
      p90Depth: percentileDepth(histogram, trials, 0.9),
    },
  };
}

/**
 * Derive a deterministic causal prediction for a workspace use case.
 *
 * @param {object} input    { workspaceConfig, workspaceSourceRecords, metadataGraph }
 * @param {object} [options] { lensId, trials, seed }
 * @returns {object} typed simulation envelope (never throws)
 */
function deriveWorkspaceSimulation(input = {}, options = {}) {
  const safeInput = {
    workspaceConfig: isPlainObject(input.workspaceConfig) ? input.workspaceConfig : {},
    workspaceSourceRecords: isPlainObject(input.workspaceSourceRecords) ? input.workspaceSourceRecords : {},
    metadataGraph: isPlainObject(input.metadataGraph) ? input.metadataGraph : null,
  };

  let state;
  try {
    state = deriveWorkspaceState(safeInput);
  } catch {
    state = { primary: { steps: [], complete: false, nextStepId: null }, lenses: {}, nextAction: null, complete: false };
  }

  const { lensId, lensState } = resolveTargetLens(state, options.lensId);
  const steps = Array.isArray(lensState?.steps) ? lensState.steps : [];
  const evidence = collectRunEvidence(safeInput.workspaceConfig);
  const core = predictFromSteps(steps, evidence, options);

  return {
    kind: SIMULATION_KIND,
    version: SIMULATION_VERSION,
    target: { lensId, label: safeString(lensState?.label || lensId), complete: Boolean(lensState?.complete) },
    prediction: {
      ...core.prediction,
      rationale: core.incompleteCount === 0
        ? `"${lensId}" use case is already complete in the current workspace artifact.`
        : `${core.incompleteCount} step(s) remain; predicted completion ${(core.prediction.completionRate * 100).toFixed(0)}% from ${evidence.runs} recorded run(s)${evidence.meanReward == null ? "" : `, mean reward ${evidence.meanReward}`}.`,
    },
    drivers: core.drivers,
    trajectory: core.trajectory,
    distribution: core.distribution,
    evidence,
  };
}

export {
  SIMULATION_KIND,
  SIMULATION_VERSION,
  deriveWorkspaceSimulation,
  predictFromSteps,
  collectRunEvidence,
  stepSuccessProbability,
  makeRng,
};
