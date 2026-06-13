/**
 * Swarm Society Simulation V1 — empirically-grounded agent-based modeling over
 * the governed Agent Outcome Receipt stream.
 *
 * Academic separation (intuition vs mechanism):
 *   The *intuition* is classic agent-based modeling — Epstein & Axtell's
 *   Sugarscape (simple local rules → emergent macro behavior), Bonabeau's
 *   stigmergy (agents leave traces in the environment), Orcutt-style
 *   microsimulation (behavioral parameters estimated from data). NONE of that
 *   is hard-coded here. The *mechanism* is concrete and Growthub-specific:
 *     - the environment is the governed workspace (objects + the fixed
 *       mutation routes) ;
 *     - the agents follow the SAME scoped rules real agents follow — every
 *       action is a PATCH-lane / sandbox-run-lane attempt ;
 *     - the behavioral parameters are ESTIMATED from the real
 *       `workspace:agent-outcomes` receipt stream this kit already ships
 *       (Agent Outcome Loop V1) — not invented ;
 *     - the "traces" are simulation receipts in the identical receipt schema,
 *       flagged `isSimulation: true`.
 *
 * Hard boundaries (identical to every other deriver in this kit):
 *   - PURE & deterministic: seeded RNG, no I/O, no fetch, no fs, no mutation,
 *     never throws.
 *   - NO SDK contract change, NO new schema, NO new mutation path. Simulation
 *     receipts are in-memory return data ONLY — they are NEVER persisted
 *     through a real lane. The real receipt stream is read, never written.
 *
 * The product (B1/B2/B3):
 *   B2 deriveSwarmBehaviorProfiles  — learn per-agent behavior from receipts.
 *   B1 simulateSwarmSociety         — run virtual agents through a workload,
 *                                     emit predictability metrics.
 *   B3 deriveSwarmPredictabilityReport — the enterprise "Swarm Predictability
 *                                     Report" (expected violation rate, safe
 *                                     concurrency limit) before cloning a
 *                                     workspace to a new tenant.
 */

const SOCIETY_KIND = "growthub-swarm-society-simulation-v1";
const PREDICTABILITY_KIND = "growthub-swarm-predictability-report-v1";
const VERSION = 1;

const DEFAULT_AGENTS = 8;
const DEFAULT_TASKS_PER_AGENT = 10;
const DEFAULT_SEED = 1;
const DEFAULT_REPAIR_TICKS = 2; // mean ticks a repaired block costs to resolve
const MAX_AGENTS = 512;
const MAX_TASKS = 5000;
const SAFE_VIOLATION_DENSITY = 50; // violations per 1000 actions considered safe
const STABILITY_CV_THRESHOLD = 0.5; // coefficient of variation cutoff for "stable"

// Lanes from the shipped Agent Outcome Loop V1.
const DIRECT_LANE = "untrusted-direct"; // PATCH /api/workspace
const EXECUTION_LANE = "execution-proof"; // POST /api/workspace/sandbox-run

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function safeString(value) {
  return value == null ? "" : String(value);
}
function clampInt(value, fallback, lo, hi) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Deterministic 32-bit PRNG (mulberry32). Seeded ⇒ reproducible societies. */
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

function isBlocked(receipt) {
  return safeString(receipt?.outcomeStatus).toLowerCase() === "blocked";
}
function isFailed(receipt) {
  const s = safeString(receipt?.outcomeStatus).toLowerCase();
  return s === "failed" || s === "error";
}
function hasRepairGuidance(receipt) {
  return Array.isArray(receipt?.nextActions) && receipt.nextActions.length > 0;
}

// ── B2 — Behavior profiling (empirically-grounded ABM) ──────────────────────

/**
 * Learn behavioral parameters per agent (or per lane/kind) from the real
 * receipt stream. These become the simulation agents' rule parameters.
 *
 * @param {Array}  receipts            workspace:agent-outcomes stream
 * @param {object} [options]           { groupBy: "actor"|"lane"|"kind" }
 * @returns {{ profiles: Array, global: object }}
 */
function deriveSwarmBehaviorProfiles(receipts, options = {}) {
  const stream = Array.isArray(receipts) ? receipts.filter(isPlainObject) : [];
  const groupBy = ["actor", "lane", "kind"].includes(options.groupBy) ? options.groupBy : "actor";

  // Chronological order so route-shopping (blocked PATCH → sandbox-run by the
  // same actor) is detectable as a sequence, not just a count.
  const ordered = stream.slice().sort((a, b) => safeString(a.createdAt).localeCompare(safeString(b.createdAt)));

  const groups = new Map();
  const keyOf = (r) => safeString(r[groupBy]) || (groupBy === "actor" ? "anonymous" : "unknown");
  for (let i = 0; i < ordered.length; i += 1) {
    const r = ordered[i];
    const key = keyOf(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ r, i });
  }

  const profiles = [];
  for (const [key, entries] of groups) {
    const total = entries.length;
    const blocked = entries.filter((e) => isBlocked(e.r)).length;
    const failed = entries.filter((e) => isFailed(e.r)).length;
    const repairs = entries.filter((e) => hasRepairGuidance(e.r)).length;

    // Route-shopping: a blocked untrusted-direct (PATCH) receipt followed, in
    // this actor's own chronological tail, by an execution-proof attempt.
    let blockedDirect = 0;
    let routeShop = 0;
    for (let j = 0; j < entries.length; j += 1) {
      const cur = entries[j].r;
      if (isBlocked(cur) && safeString(cur.lane) === DIRECT_LANE) {
        blockedDirect += 1;
        const nxt = entries[j + 1]?.r;
        if (nxt && safeString(nxt.lane) === EXECUTION_LANE) routeShop += 1;
      }
    }

    profiles.push({
      key,
      groupBy,
      actionCount: total,
      blockedRate: total ? Number((blocked / total).toFixed(4)) : 0,
      failureRate: total ? Number((failed / total).toFixed(4)) : 0,
      repairTriggerRate: total ? Number((repairs / total).toFixed(4)) : 0,
      // P(route-shop | blocked PATCH). No blocked PATCHes ⇒ 0 tendency.
      routeShoppingRate: blockedDirect ? Number((routeShop / blockedDirect).toFixed(4)) : 0,
      lanesUsed: Array.from(new Set(entries.map((e) => safeString(e.r.lane)).filter(Boolean))),
    });
  }
  profiles.sort((a, b) => b.actionCount - a.actionCount);

  // Global prior — used when the stream is too thin to profile per agent.
  const total = ordered.length;
  const global = {
    receiptCount: total,
    blockedRate: total ? Number((ordered.filter(isBlocked).length / total).toFixed(4)) : 0,
    failureRate: total ? Number((ordered.filter(isFailed).length / total).toFixed(4)) : 0,
    repairTriggerRate: total ? Number((ordered.filter(hasRepairGuidance).length / total).toFixed(4)) : 0,
    routeShoppingRate: profiles.length
      ? Number((profiles.reduce((s, p) => s + p.routeShoppingRate, 0) / profiles.length).toFixed(4))
      : 0,
    // Fidelity rises with corpus size (Laplace-style saturation).
    fidelity: Number((total / (total + 20)).toFixed(4)),
  };
  return { profiles, global };
}

// ── B1 — Workspace simulator (discrete-event ABM) ───────────────────────────

function envObjectIds(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const ids = objects.map((o) => safeString(o?.id) || safeString(o?.label)).filter(Boolean);
  return ids.length ? ids : ["object-0", "object-1", "object-2"];
}

function profileForAgent(profiles, global, index) {
  if (profiles.length) return profiles[index % profiles.length];
  return { key: "global-prior", blockedRate: global.blockedRate, failureRate: global.failureRate, repairTriggerRate: global.repairTriggerRate, routeShoppingRate: global.routeShoppingRate };
}

function stddev(values, mean) {
  if (values.length === 0) return 0;
  const v = values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;
  return Math.sqrt(v);
}

/**
 * Run a virtual swarm society through a workload over the governed environment.
 * Every virtual action is a governed-lane attempt and emits a simulation
 * receipt (isSimulation:true, in-memory only). Deterministic for a given seed.
 *
 * @param {object} args { profiles, global, environment, options }
 *   options: { agents, tasksPerAgent, concurrency, seed, repairTicks }
 * @returns {object} society simulation envelope (never throws)
 */
function simulateSwarmSociety(args = {}) {
  const profiles = Array.isArray(args.profiles) ? args.profiles : [];
  const global = isPlainObject(args.global) ? args.global : { blockedRate: 0.1, failureRate: 0.05, repairTriggerRate: 0.5, routeShoppingRate: 0.2 };
  const objectIds = Array.isArray(args.environment?.objectIds) && args.environment.objectIds.length
    ? args.environment.objectIds
    : ["object-0", "object-1", "object-2"];
  const o = args.options || {};
  const agents = clampInt(o.agents, profiles.length || DEFAULT_AGENTS, 1, MAX_AGENTS);
  const tasksPerAgent = clampInt(o.tasksPerAgent, DEFAULT_TASKS_PER_AGENT, 1, MAX_TASKS);
  const concurrency = clampInt(o.concurrency, agents, 1, agents);
  const seed = clampInt(o.seed, DEFAULT_SEED, 0, 2 ** 31 - 1);
  const repairTicks = clampInt(o.repairTicks, DEFAULT_REPAIR_TICKS, 1, 100);
  const rng = makeRng(seed);

  const agentState = Array.from({ length: agents }, (_, i) => ({
    id: `vagent-${i}`,
    profile: profileForAgent(profiles, global, i),
    remaining: tasksPerAgent,
  }));

  let totalActions = 0;
  let blockedActions = 0;
  let routeShopActions = 0;
  let failedActions = 0;
  const resolveTimes = [];
  const contentionByObject = new Map();
  const perTickViolations = [];
  let cursor = 0;
  let ticks = 0;
  const maxTicks = agents * tasksPerAgent * 4 + 10; // generous safety bound

  function emitReceipt(agentId, lane, outcomeStatus, objectId) {
    // Identical receipt schema, flagged as simulation. In-memory only.
    return { kind: "agent-outcome", lane, outcomeStatus, actor: agentId, objectRefs: [{ objectId }], isSimulation: true };
  }
  const sampleReceipts = [];

  while (agentState.some((a) => a.remaining > 0) && ticks < maxTicks) {
    // Form this tick's active batch: up to `concurrency` agents that still
    // have work, round-robin from the cursor (fair scheduling).
    const batch = [];
    let scanned = 0;
    while (batch.length < concurrency && scanned < agents) {
      const a = agentState[cursor % agents];
      cursor += 1;
      scanned += 1;
      if (a.remaining > 0) batch.push(a);
    }
    if (batch.length === 0) break;

    const tickObjectTargets = new Map();
    let tickViolations = 0;

    for (const a of batch) {
      const p = a.profile;
      const objectId = objectIds[Math.floor(rng() * objectIds.length)];
      tickObjectTargets.set(objectId, (tickObjectTargets.get(objectId) || 0) + 1);

      totalActions += 1;
      const blocked = rng() < clamp01(p.blockedRate);
      if (blocked) {
        blockedActions += 1;
        tickViolations += 1;
        if (sampleReceipts.length < 20) sampleReceipts.push(emitReceipt(a.id, DIRECT_LANE, "blocked", objectId));
        // Route-shopping: blocked PATCH → sandbox-run attempt (governance risk).
        if (rng() < clamp01(p.routeShoppingRate)) {
          routeShopActions += 1;
          tickViolations += 1;
          totalActions += 1;
          if (sampleReceipts.length < 20) sampleReceipts.push(emitReceipt(a.id, EXECUTION_LANE, "blocked", objectId));
        }
        // Repair path resolves the task after some ticks; otherwise it fails.
        if (rng() < clamp01(p.repairTriggerRate)) {
          resolveTimes.push(repairTicks);
        } else {
          failedActions += 1;
        }
      } else if (rng() < clamp01(p.failureRate)) {
        failedActions += 1;
        if (sampleReceipts.length < 20) sampleReceipts.push(emitReceipt(a.id, DIRECT_LANE, "failed", objectId));
      } else if (sampleReceipts.length < 20) {
        sampleReceipts.push(emitReceipt(a.id, DIRECT_LANE, "tested", objectId));
      }
      a.remaining -= 1;
    }

    // Contention: an object targeted by ≥2 agents in the same tick is contested.
    for (const [objectId, count] of tickObjectTargets) {
      if (count >= 2) {
        contentionByObject.set(objectId, (contentionByObject.get(objectId) || 0) + (count - 1));
        tickViolations += count - 1;
      }
    }
    perTickViolations.push(tickViolations);
    ticks += 1;
  }

  const violations = blockedActions + routeShopActions;
  const violationDensity = totalActions ? Number(((violations / totalActions) * 1000).toFixed(2)) : 0;

  // Swarm stability: compare the first vs second half of the violation series.
  const half = Math.floor(perTickViolations.length / 2);
  const front = perTickViolations.slice(0, half);
  const back = perTickViolations.slice(half);
  const mean = perTickViolations.length ? perTickViolations.reduce((s, x) => s + x, 0) / perTickViolations.length : 0;
  const cv = mean > 0 ? stddev(perTickViolations, mean) / mean : 0;
  const frontMean = front.length ? front.reduce((s, x) => s + x, 0) / front.length : 0;
  const backMean = back.length ? back.reduce((s, x) => s + x, 0) / back.length : 0;
  let stability;
  if (cv <= STABILITY_CV_THRESHOLD) stability = "stable";
  else if (backMean > frontMean * 1.25) stability = "diverging";
  else stability = "oscillating";

  const contentionHotspots = Array.from(contentionByObject.entries())
    .map(([objectId, count]) => ({ objectId, contention: count }))
    .sort((a, b) => b.contention - a.contention)
    .slice(0, 10);

  const meanTimeToResolve = resolveTimes.length
    ? Number((resolveTimes.reduce((s, x) => s + x, 0) / resolveTimes.length).toFixed(2))
    : 0;

  return {
    kind: SOCIETY_KIND,
    version: VERSION,
    config: { agents, tasksPerAgent, concurrency, seed, repairTicks, objectCount: objectIds.length },
    metrics: {
      totalActions,
      blockedActions,
      routeShopActions,
      failedActions,
      violations,
      violationDensity, // per 1000 actions
      meanTimeToResolveTicks: meanTimeToResolve,
      ticks,
      swarmStability: stability,
      stabilityCv: Number(cv.toFixed(4)),
    },
    contentionHotspots,
    sampleReceipts, // identical schema, isSimulation:true, in-memory only
  };
}

// ── B3 — Multi-tenant Swarm Predictability Report ───────────────────────────

/**
 * Sweep concurrency 1..agents and return the highest concurrency at which the
 * simulated violation density stays within budget and the swarm does not
 * diverge — the "safe concurrency limit" for a tenant clone.
 */
function findSafeConcurrency({ profiles, global, environment, options }) {
  const agents = clampInt(options?.agents, profiles.length || DEFAULT_AGENTS, 1, MAX_AGENTS);
  let safe = 1;
  const ladder = [];
  for (let c = 1; c <= agents; c += 1) {
    const sim = simulateSwarmSociety({ profiles, global, environment, options: { ...options, concurrency: c } });
    const ok = sim.metrics.violationDensity <= SAFE_VIOLATION_DENSITY && sim.metrics.swarmStability !== "diverging";
    ladder.push({ concurrency: c, violationDensity: sim.metrics.violationDensity, stability: sim.metrics.swarmStability, ok });
    if (ok) safe = c;
  }
  return { safeConcurrency: safe, ladder };
}

/**
 * The enterprise deliverable: a predictability report for a proposed workspace
 * config + workload, BEFORE cloning it to a new tenant.
 *
 * @param {object} args { receipts, workspaceConfig, options }
 * @returns {object} predictability report envelope (never throws)
 */
function deriveSwarmPredictabilityReport(args = {}) {
  const { profiles, global } = deriveSwarmBehaviorProfiles(args.receipts, { groupBy: args.options?.groupBy });
  const environment = { objectIds: envObjectIds(isPlainObject(args.workspaceConfig) ? args.workspaceConfig : {}) };
  const options = args.options || {};

  const simulation = simulateSwarmSociety({ profiles, global, environment, options });
  const { safeConcurrency, ladder } = findSafeConcurrency({ profiles, global, environment, options });

  const expectedViolationRate = simulation.metrics.violationDensity;
  let verdict;
  if (global.receiptCount === 0) verdict = "insufficient-evidence";
  else if (expectedViolationRate <= SAFE_VIOLATION_DENSITY && simulation.metrics.swarmStability === "stable") verdict = "safe-to-clone";
  else if (simulation.metrics.swarmStability === "diverging") verdict = "unsafe-diverging";
  else verdict = "review-before-clone";

  return {
    kind: PREDICTABILITY_KIND,
    version: VERSION,
    verdict,
    fidelity: global.fidelity, // confidence in the profile corpus (grows with receipts)
    expectedViolationRatePer1000: expectedViolationRate,
    meanTimeToResolveTicks: simulation.metrics.meanTimeToResolveTicks,
    swarmStability: simulation.metrics.swarmStability,
    safeConcurrency,
    concurrencyLadder: ladder,
    contentionHotspots: simulation.contentionHotspots,
    behaviorProfiles: profiles,
    global,
    simulation: { config: simulation.config, metrics: simulation.metrics },
    rationale: global.receiptCount === 0
      ? "No recorded agent-outcome receipts yet — run governed actions to build the behavior corpus before trusting a prediction."
      : `Profiled ${profiles.length} agent group(s) from ${global.receiptCount} receipt(s); expected ${expectedViolationRate}/1000 violations at the requested concurrency; safe concurrency limit ${safeConcurrency}.`,
  };
}

export {
  SOCIETY_KIND,
  PREDICTABILITY_KIND,
  VERSION,
  makeRng,
  deriveSwarmBehaviorProfiles,
  simulateSwarmSociety,
  findSafeConcurrency,
  deriveSwarmPredictabilityReport,
};
