/**
 * Autonomic pulse projection — the governed "/pulse" heartbeat lens over the
 * whole workspace (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1, same primitive
 * class as the CEO and Schedule cockpits).
 *
 * PURE deriver — no React, no fetch, no fs, no config writes, no clock reads.
 * Callers pass `nowMs` explicitly so every sensor is deterministic and
 * offline-testable with `node --test`. It introduces NO new governed object,
 * NO new API route, NO new PATCH field, and NO second readiness check: fleet
 * truth comes from `deriveScheduleCockpit`, run truth from the existing
 * `lastScheduledRun*` proof columns (the destination door stamps
 * `lastScheduledRunAttemptedAt` BEFORE executing the graph, so a hung run
 * leaves a dangling attempt this sensor can see), deployment truth from the
 * `workspace-app-registry` / `vercel-projects` governed rows, and policy truth
 * from rows in a user-created CUSTOM object (conventional id/label
 * `workspace-policy` — created through the existing `create_object` helper
 * lane; never a new object type or preset).
 *
 *   autonomic pulse =
 *     heartbeat sensors (stall / timeout / failure recovery detection)
 *   + policy evaluation (human rules · preferences · use-case goal, as rows)
 *   + governed recovery hand-offs over EXISTING routes only
 *
 * Heartbeat rationale (serverless): the destination door executes published
 * graphs within SERVERLESS_RUN_BUDGET_MS (shared constant — the sensor can
 * never drift from the route's real timeout) and stamps the attempt at
 * dispatch. Attempt newer than any completion past budget+grace = STALLED —
 * the same watchdog shape the upstream Paperclip heartbeat service applies to
 * agent runs, projected over governed proof columns so a bad run can never
 * sit stuck without a visible, recoverable pulse finding.
 *
 * MCP alignment (GOVERNED_MCP_CONSOLE_V1): this deriver is the same class of
 * read-only intelligence as the Workspace MCP tools (`app_readiness`,
 * `outcome_ledger`); every `nextAction`/`recovery` emitted here is a hand-off
 * to an existing governed surface — never a mutation — mirroring the MCP loop
 * `read → reason → dry-run → governed mutate → re-read`.
 *
 * AUTO-APPROVE RULE: a policy row may declare `autoApprove`, but it can only
 * ever authorize SAFE recovery kinds (read-only readiness rescans, never a
 * chained resume or any other mutation). The deriver clamps everything else
 * to manual and scopes auto-recovery to the exact cards the breached finding
 * covers — the human gate is the trust boundary, exactly like helper
 * propose→apply.
 */

import { deriveScheduleCockpit } from "./schedule-cockpit-console.js";
import { READINESS_DELTA_TAGS } from "./serverless-readiness.js";

// CLIENT-BUNDLE RULE: this module is imported by a "use client" component, so
// it must not (transitively) import node:crypto modules. The two values below
// mirror server-side canon (workspace-add-on-scheduler.SERVERLESS_RUN_BUDGET_MS
// and workspace-inbound-invocation.INBOUND_INVOCATION_LANES); the unit suite
// imports both sides and fails if they ever drift.
const SERVERLESS_RUN_BUDGET_MS = 60_000;
const INBOUND_INVOCATION_LANES = ["inbound-webhook", "api-request"];

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function truthy(value) {
  return ["true", "1", "on", "yes"].includes(clean(value).toLowerCase()) || value === true;
}

function toMs(value) {
  const t = Date.parse(clean(value));
  return Number.isFinite(t) ? t : null;
}

/** Canonical slug — same transform the data-model layer applies to labels
 * (lowercase, any non-alphanumeric run → "-", trimmed), so a policy object
 * named "Workspace Policy!" or "Workspace_Policy" still resolves. */
function slugify(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Conventional id/label of the CUSTOM business object carrying human rules /
 * preferences / goals — created via the existing governed `create_object`
 * lane. The pulse only READS it. */
export const WORKSPACE_POLICY_OBJECT_ID = "workspace-policy";

/** Conventional Name of the self-invoking heartbeat workflow (optional). */
export const WORKSPACE_PULSE_WORKFLOW_NAME = "workspace-pulse";

/** Re-exported so tests and callers share the door's real execution budget. */
export const PULSE_RUN_BUDGET_MS = SERVERLESS_RUN_BUDGET_MS;
/** Grace on top of the budget before an attempted run counts as stalled —
 * covers provider retry delivery and cold-start scheduling jitter. */
export const PULSE_STALL_GRACE_MS = 120_000;

/** Canonical heartbeat sensor tags. MISSING_SECRET reuses the readiness
 * driver's own delta tag — one vocabulary, never a second one. */
export const PULSE_SENSOR_TAGS = {
  STALLED_RUN: "stalled-run",
  RUN_FAILED: "run-failed",
  SCHEDULE_DRIFT: "schedule-drift",
  BLOCKED_READINESS: "blocked-readiness",
  MISSING_SECRET: READINESS_DELTA_TAGS.MISSING_SERVER_SECRET,
  GOVERNANCE_BLOCKED: "governance-blocked-attempts",
  PULSE_PROOF_STALE: "pulse-proof-stale",
  DEPLOYMENT_ERROR: "deployment-error",
};

/** Recovery kinds a policy row's autoApprove MAY authorize. Everything else —
 * including the resume chain on a paused card — keeps the human gate. */
export const SAFE_AUTO_RECOVERY_KINDS = ["readiness"];

/* ------------------------------------------------------------------ */
/* Heartbeat sensors                                                    */
/* ------------------------------------------------------------------ */

/**
 * Classify one workflow row's run heartbeat from its governed proof columns.
 * Deterministic: all time math uses the caller's `nowMs`. Timestamp presence
 * is null-checked (never truthiness) so an epoch-0 timestamp still counts.
 *
 * States: idle | running | healthy | failed | stalled.
 */
export function senseRunHeartbeat(row, { nowMs = null } = {}) {
  const attemptedAt = toMs(row?.lastScheduledRunAttemptedAt);
  const succeededAt = toMs(row?.lastScheduledRunSucceededAt);
  const failedAt = toMs(row?.lastScheduledRunFailedAt);
  const status = clean(row?.lastScheduledRunStatus);
  const failureReason = clean(row?.lastScheduledRunFailureReason);
  const completedAt = succeededAt == null && failedAt == null
    ? null
    : Math.max(succeededAt == null ? -Infinity : succeededAt, failedAt == null ? -Infinity : failedAt);

  if (attemptedAt == null && completedAt == null && !status) {
    return { state: "idle", attemptedAt: null, completedAt: null, ageMs: null, reason: "" };
  }

  // Attempt newer than any completion → in flight or stuck.
  if (attemptedAt != null && (completedAt == null || attemptedAt > completedAt)) {
    if (nowMs == null) {
      // No clock → conservative: report running, never a false stall alarm.
      return { state: "running", attemptedAt, completedAt, ageMs: null, reason: "no-clock" };
    }
    const ageMs = nowMs - attemptedAt;
    if (ageMs > PULSE_RUN_BUDGET_MS + PULSE_STALL_GRACE_MS) {
      return { state: "stalled", attemptedAt, completedAt, ageMs, reason: "attempt-past-budget-without-completion" };
    }
    return { state: "running", attemptedAt, completedAt, ageMs, reason: "" };
  }

  // NOTE: unlike the Schedule cockpit's card.lastRunFailed (scoped to bound
  // serverless rows), the pulse deliberately counts a failure signal on ANY
  // row — unbound rows with failing runs are health facts too.
  const failed = Boolean(failureReason)
    || (failedAt != null && (succeededAt == null || failedAt > succeededAt))
    || (status && !status.startsWith("2"));
  if (failed) {
    return { state: "failed", attemptedAt, completedAt, ageMs: nowMs != null && completedAt != null ? nowMs - completedAt : null, reason: failureReason || (status ? `status-${status}` : "failure") };
  }
  return { state: "healthy", attemptedAt, completedAt, ageMs: nowMs != null && completedAt != null ? nowMs - completedAt : null, reason: "" };
}

/**
 * Governed recovery hand-off for one heartbeat — existing surfaces ONLY, and
 * binding-aware: the schedule route is only targeted when the row actually
 * carries a scheduler binding (scheduleId + provider); inbound bindings hand
 * to the sidecar retest lane; unbound rows hand to the canvas. A chained
 * resume is marked `mutating: true` so auto-recovery can refuse it.
 */
function recoveryFor({ heartbeat, card, row }) {
  if (heartbeat.state !== "stalled" && heartbeat.state !== "failed") return null;
  const inbound = INBOUND_INVOCATION_LANES.includes(clean(row?.schedulerTriggerKind));
  const schedulerBound = Boolean(card?.scheduleId) && !inbound;

  if (inbound) {
    return {
      kind: "retest",
      label: "Send fresh test event",
      then: null,
      mutating: false,
      handoff: "workflow-sidecar",
      explain: "Re-prove the inbound binding with a fresh test event through the sidecar; publish stays gated on fresh proof.",
    };
  }
  if (schedulerBound) {
    const chainResume = heartbeat.state === "stalled" && card?.paused;
    return {
      kind: "readiness",
      label: chainResume ? "Rescan & recover" : "Rescan readiness",
      then: chainResume ? "resume" : null,
      // The resume chain re-arms a paused schedule — a mutation. It renders
      // for the human click but is NEVER run by auto-recovery.
      mutating: Boolean(chainResume),
      handoff: "add-ons-schedule-route",
      explain: chainResume
        ? "Run the readiness scan (read-only); resume then re-verifies server-side before re-arming the paused schedule."
        : "Read-only readiness rescan to re-derive binding truth and name any blocking node.",
    };
  }
  return {
    kind: "open-canvas",
    label: "Open & re-run",
    then: null,
    mutating: false,
    handoff: "workflow-canvas",
    explain: "This row has no scheduler binding — open the canvas to re-run or bind it; fresh proof clears the stall.",
  };
}

/* ------------------------------------------------------------------ */
/* Governed-row readers (deployment + policy)                          */
/* ------------------------------------------------------------------ */

/** Deployment posture from the governed app/deploy rows (release-freeze
 * shapes). "Live" is evidence-based: a READY latest deployment, an explicit
 * live status, or a recorded deployment URL — the real writers stamp rows
 * `linked` with a deployment URL, and `latestDeploymentState` only reaches
 * READY on a later project re-sync, so URL presence must count. */
export function senseDeploymentPosture(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  let appSurfaces = 0;
  let projects = 0;
  let live = 0;
  let errored = 0;
  for (const object of objects) {
    const isApp = clean(object?.objectType) === "app-surface" || clean(object?.id) === "workspace-app-registry";
    const isProject = clean(object?.id) === "vercel-projects" || slugify(object?.label || object?.name) === "vercel-projects";
    if (!isApp && !isProject) continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (isApp) { appSurfaces += 1; continue; }
      projects += 1;
      const state = clean(row?.latestDeploymentState).toUpperCase();
      const isLive = state === "READY" || clean(row?.status) === "live" || Boolean(clean(row?.latestDeploymentUrl) || clean(row?.deploymentUrl));
      if (isLive) live += 1;
      if (["ERROR", "CANCELED", "FAILED"].includes(state) || clean(row?.lastDeployStatus) === "failed") errored += 1;
    }
  }
  return { appSurfaces, projects, live, errored, anyLive: live > 0 };
}

/** Read enabled policy rows from the user-created custom object (matched by
 * conventional id or canonical label slug — never by a dedicated type). */
export function readPolicyRows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const rows = [];
  for (const object of objects) {
    const matches = clean(object?.id) === WORKSPACE_POLICY_OBJECT_ID
      || slugify(object?.label || object?.name) === WORKSPACE_POLICY_OBJECT_ID;
    if (!matches) continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) rows.push(row);
  }
  return rows
    .filter((r) => clean(r?.Name) && (r?.enabled === undefined || truthy(r?.enabled)))
    .map((r) => ({
      policyId: clean(r?.Name),
      ruleKind: clean(r?.ruleKind),
      threshold: Number.isFinite(Number(r?.threshold)) && clean(r?.threshold) !== "" ? Number(r?.threshold) : null,
      severity: ["info", "warn", "critical"].includes(clean(r?.severity)) ? clean(r?.severity) : "warn",
      autoApprove: truthy(r?.autoApprove),
      goal: clean(r?.goal),
      description: clean(r?.description),
    }));
}

/* ------------------------------------------------------------------ */
/* Policy evaluation                                                   */
/* ------------------------------------------------------------------ */

/** One table per rule kind: metric + sensor tag + governed nextAction. Adding
 * a rule kind is one entry here — nothing to keep in sync across ternaries. */
const RULE_TABLE = {
  "max-stalled-runs": {
    metric: (p) => p.counts.stalled,
    sensorTag: PULSE_SENSOR_TAGS.STALLED_RUN,
    targets: (p) => p.targets?.stalled || [],
    nextAction: () => ({ kind: "readiness", label: "Rescan affected workflows", handoff: "add-ons-schedule-route", explain: "Read-only readiness rescan per affected card; recovery re-verifies server-side." }),
  },
  "max-failed-runs": {
    metric: (p) => p.counts.failed,
    sensorTag: PULSE_SENSOR_TAGS.RUN_FAILED,
    targets: (p) => p.targets?.failed || [],
    nextAction: () => ({ kind: "readiness", label: "Rescan affected workflows", handoff: "add-ons-schedule-route", explain: "Read-only readiness rescan per affected card; recovery re-verifies server-side." }),
  },
  "max-blocked-workflows": {
    metric: (p) => p.counts.blocked,
    sensorTag: PULSE_SENSOR_TAGS.BLOCKED_READINESS,
    targets: (p) => p.targets?.blocked || [],
    nextAction: () => ({ kind: "readiness", label: "Rescan affected workflows", handoff: "add-ons-schedule-route", explain: "Read-only readiness rescan per affected card; recovery re-verifies server-side." }),
  },
  "max-drifted-workflows": {
    metric: (p) => p.counts.drifted,
    sensorTag: PULSE_SENSOR_TAGS.SCHEDULE_DRIFT,
    targets: (p) => p.targets?.drifted || [],
    nextAction: () => ({ kind: "readiness", label: "Rescan affected workflows", handoff: "add-ons-schedule-route", explain: "Read-only readiness rescan per affected card; recovery re-verifies server-side." }),
  },
  "max-blocked-attempts": {
    metric: (p) => p.governance.blockedAttempts,
    sensorTag: PULSE_SENSOR_TAGS.GOVERNANCE_BLOCKED,
    targets: () => [],
    nextAction: () => ({ kind: "open-ceo", label: "Review in CEO cockpit", handoff: "ceo-cockpit", explain: "The CEO cockpit folds the receipt stream's blocked governance attempts for review." }),
  },
  "max-missing-secrets": {
    metric: (p) => p.counts.missingSecrets,
    sensorTag: PULSE_SENSOR_TAGS.MISSING_SECRET,
    targets: () => [],
    nextAction: () => ({ kind: "open-settings", label: "Configure secrets", handoff: "settings-env", explain: "Resolve the missing env refs in workspace settings (server-side only)." }),
  },
};

/**
 * Evaluate policy rows against the condition packet. Pure and deterministic.
 * Every finding's nextAction is a governed hand-off; `autoApprovable` is true
 * ONLY when the row opted in AND the action is a safe read-only kind AND the
 * action carries the exact target cards it covers (auto-recovery never runs
 * wider than what the breached finding authorizes).
 */
export function evaluatePulsePolicies({ packet, policyRows = [] } = {}) {
  const findings = [];
  for (const policy of policyRows) {
    const { policyId, ruleKind, threshold, autoApprove } = policy;

    if (ruleKind === "require-deployment-live") {
      if (!packet.deployment.anyLive) {
        findings.push(buildFinding(policy, {
          observed: packet.deployment.live,
          expected: ">=1 live deployment",
          message: "No live deployment evidence (READY state, live status, or deployment URL) in the governed vercel-projects rows.",
          sensorTag: PULSE_SENSOR_TAGS.DEPLOYMENT_ERROR,
          nextAction: { kind: "open-settings-apps", label: "Open /settings/apps", handoff: "settings-apps", explain: "Review deployment rows and redeploy through the governed Vercel deploy route." },
          autoApprove,
        }));
      }
      continue;
    }

    if (ruleKind === "pulse-cadence-minutes") {
      const maxAgeMs = (threshold == null ? 60 : threshold) * 60_000;
      const proof = packet.pulseProof;
      // Only a SUCCESSFUL beat counts — a heartbeat workflow failing on
      // schedule is precisely what this watchdog must flag.
      const stale = proof.lastBeatMs == null || (packet.nowMs != null && packet.nowMs - proof.lastBeatMs > maxAgeMs);
      if (stale) {
        findings.push(buildFinding(policy, {
          observed: proof.lastBeatAt || "never",
          expected: `a successful pulse beat within ${threshold == null ? 60 : threshold}m`,
          message: proof.workflowFound
            ? `The pulse workflow has no fresh successful beat (state: ${proof.state}).`
            : `No workflow named "${WORKSPACE_PULSE_WORKFLOW_NAME}" exists yet — the heartbeat has no owner.`,
          sensorTag: PULSE_SENSOR_TAGS.PULSE_PROOF_STALE,
          nextAction: proof.workflowFound
            ? { kind: "readiness", label: "Rescan pulse workflow", handoff: "add-ons-schedule-route", targetCardIds: packet.targets?.pulse || [], explain: "Read-only readiness rescan of the pulse workflow binding." }
            : {
              kind: "seed-proposal",
              label: "Propose pulse workflow",
              handoff: "helper-proposal",
              seedIntent: "swarm",
              seedPrompt: `Propose a governed loop: create a scheduler-bound "${WORKSPACE_PULSE_WORKFLOW_NAME}" heartbeat workflow that reads workspace readiness and outcome receipts each beat, so stalled or failed runs surface with governed recovery:`,
              explain: "Seed a governed proposal creating the scheduler-bound pulse workflow — reviewed before anything runs.",
            },
          autoApprove,
        }));
      }
      continue;
    }

    const rule = RULE_TABLE[ruleKind];
    if (!rule) {
      findings.push(buildFinding(policy, {
        observed: ruleKind || "(empty)",
        expected: `one of: ${Object.keys(RULE_TABLE).concat(["require-deployment-live", "pulse-cadence-minutes"]).join(", ")}`,
        message: `Unknown policy rule kind "${ruleKind}" — this row cannot be evaluated.`,
        sensorTag: PULSE_SENSOR_TAGS.GOVERNANCE_BLOCKED,
        severityOverride: "warn",
        nextAction: { kind: "open-data-model", label: "Fix policy row", handoff: "data-model", explain: "Edit the workspace-policy row to a supported ruleKind." },
        autoApprove: false,
      }));
      continue;
    }

    const observed = rule.metric(packet);
    const limit = threshold == null ? 0 : threshold;
    if (observed > limit) {
      const action = rule.nextAction();
      findings.push(buildFinding(policy, {
        observed,
        expected: `<= ${limit}`,
        message: `${policyId}: observed ${observed}, allowed ${limit}.`,
        sensorTag: rule.sensorTag,
        nextAction: { ...action, targetCardIds: rule.targets(packet) },
        autoApprove,
      }));
    }
  }

  const SEVERITY_ORDER = { critical: 0, warn: 1, info: 2 };
  findings.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3));
  return findings;
}

/** Exported list of evaluable rule kinds (tests + docs). */
export const PULSE_RULE_KINDS = Object.keys(RULE_TABLE).concat(["require-deployment-live", "pulse-cadence-minutes"]);

function buildFinding(policy, { observed, expected, message, sensorTag, nextAction, autoApprove, severityOverride }) {
  const safe = SAFE_AUTO_RECOVERY_KINDS.includes(nextAction?.kind);
  return {
    policyId: policy.policyId,
    ruleKind: policy.ruleKind,
    severity: severityOverride || policy.severity,
    goal: policy.goal,
    observed,
    expected,
    message,
    sensorTag,
    nextAction,
    // The clamp: opting in never widens past SAFE kinds.
    autoApprovable: Boolean(autoApprove) && safe,
    autoApproveClamped: Boolean(autoApprove) && !safe,
  };
}

/* ------------------------------------------------------------------ */
/* The cockpit view-model (= the agent condition packet)               */
/* ------------------------------------------------------------------ */

/**
 * Build the pulse cockpit view-model.
 *
 * @param {object}   args
 * @param {object}   args.workspaceConfig
 * @param {string[]} [args.configuredEnvRefs]  resolved credential ref slugs (env-status; never values)
 * @param {Array}    [args.receipts]           workspace outcome receipts
 * @param {number}   [args.nowMs]              caller-supplied clock (determinism; null skips time sensors)
 * @returns {object} view-model consumed by PulseCockpit.jsx — and a valid
 *                   agent condition packet in the binding-loop sense.
 */
export function derivePulseCockpit({ workspaceConfig, configuredEnvRefs = [], receipts = [], nowMs = null } = {}) {
  const fleet = deriveScheduleCockpit({ workspaceConfig, configuredEnvRefs, receipts });

  // Join fleet cards back to their owning rows by replicating the EXACT card
  // identity the fleet builder writes (`objectId::rowId-or-name::index`), so
  // duplicate row Names can never collide onto one row.
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const rowByCardId = new Map();
  let pulseRow = null;
  objects.forEach((object) => {
    if (clean(object?.objectType) !== "sandbox-environment") return;
    const objectId = clean(object?.id);
    (Array.isArray(object.rows) ? object.rows : []).forEach((row, index) => {
      const name = clean(row?.Name);
      if (!name) return;
      rowByCardId.set(`${objectId}::${clean(row?.id) || name}::${index}`, row);
      if (name === WORKSPACE_PULSE_WORKFLOW_NAME && !pulseRow) pulseRow = row;
    });
  });

  const heartbeats = fleet.workflowCards.map((card) => {
    const row = rowByCardId.get(card.cardId) || null;
    const heartbeat = senseRunHeartbeat(row || {}, { nowMs });
    const recovery = recoveryFor({ heartbeat, card, row });
    const sensorTags = [];
    if (heartbeat.state === "stalled") sensorTags.push(PULSE_SENSOR_TAGS.STALLED_RUN);
    if (heartbeat.state === "failed") sensorTags.push(PULSE_SENSOR_TAGS.RUN_FAILED);
    if (card.state === "drifted") sensorTags.push(PULSE_SENSOR_TAGS.SCHEDULE_DRIFT);
    if (card.state === "blocked") sensorTags.push(PULSE_SENSOR_TAGS.BLOCKED_READINESS);
    if ((card.readiness?.deltaTags || []).includes(READINESS_DELTA_TAGS.MISSING_SERVER_SECRET)) sensorTags.push(PULSE_SENSOR_TAGS.MISSING_SECRET);
    return {
      cardId: card.cardId,
      objectId: card.objectId,
      name: card.name,
      fleetState: card.state,
      providerId: card.providerId,
      productId: card.productId,
      scheduleId: card.scheduleId,
      triggerKind: clean(row?.schedulerTriggerKind),
      heartbeat,
      sensorTags,
      recovery,
      artifact: card.artifact,
    };
  });

  // Pulse-of-the-pulse: only a SUCCESSFUL completion is a beat.
  const pulseBeat = pulseRow ? senseRunHeartbeat(pulseRow, { nowMs }) : null;
  const pulseSucceededMs = pulseRow ? toMs(pulseRow.lastScheduledRunSucceededAt) : null;
  const pulseProof = {
    workflowFound: Boolean(pulseRow),
    lastBeatMs: pulseSucceededMs,
    lastBeatAt: pulseRow ? clean(pulseRow.lastScheduledRunSucceededAt) : "",
    state: pulseBeat?.state || "absent",
  };

  const deployment = senseDeploymentPosture(workspaceConfig);
  const policyRows = readPolicyRows(workspaceConfig);

  const counts = heartbeats.reduce((acc, h) => {
    acc[h.heartbeat.state] = (acc[h.heartbeat.state] || 0) + 1;
    return acc;
  }, { workflows: fleet.counts.total, scheduled: fleet.counts.scheduled, blocked: fleet.counts.blocked, drifted: fleet.counts.drifted, missingSecrets: fleet.counts.missingSecret, stalled: 0, failed: 0, running: 0, healthy: 0, idle: 0, policies: policyRows.length });

  const governance = fleet.governance;

  const cardIdsWhere = (pred) => heartbeats.filter(pred).map((h) => h.cardId);
  const packet = {
    nowMs,
    counts,
    governance,
    deployment,
    pulseProof,
    targets: {
      stalled: cardIdsWhere((h) => h.heartbeat.state === "stalled"),
      failed: cardIdsWhere((h) => h.heartbeat.state === "failed"),
      blocked: cardIdsWhere((h) => h.fleetState === "blocked"),
      drifted: cardIdsWhere((h) => h.fleetState === "drifted"),
      pulse: cardIdsWhere((h) => h.name === WORKSPACE_PULSE_WORKFLOW_NAME),
    },
  };
  const findings = evaluatePulsePolicies({ packet, policyRows });

  // Auto-recovery scope: exactly the union of target cards on auto-approvable
  // findings, restricted to cards whose recovery is the safe read-only kind —
  // and executed WITHOUT any mutating chain. Count shown = work done.
  const heartbeatById = new Map(heartbeats.map((h) => [h.cardId, h]));
  const autoRecoveryTargets = [...new Set(
    findings.filter((f) => f.autoApprovable).flatMap((f) => f.nextAction?.targetCardIds || []),
  )].map((id) => heartbeatById.get(id)).filter((h) => h && h.recovery?.kind === "readiness");

  // Attention: worst heartbeat first (stalled → failed), then worst finding.
  const stalledOrFailed = heartbeats.find((h) => h.heartbeat.state === "stalled")
    || heartbeats.find((h) => h.heartbeat.state === "failed");
  const attention = stalledOrFailed
    ? { kind: "heartbeat", heartbeat: stalledOrFailed }
    : findings.length > 0
      ? { kind: "finding", finding: findings[0] }
      : null;

  const filters = [
    { id: "all", label: "All", count: heartbeats.length },
    { id: "stalled", label: "Stalled", count: counts.stalled },
    { id: "failed", label: "Failed", count: counts.failed },
    { id: "running", label: "Running", count: counts.running },
    { id: "healthy", label: "Healthy", count: counts.healthy },
    { id: "blocked", label: "Blocked", count: counts.blocked + counts.drifted },
  ].filter((f) => f.id === "all" || f.count > 0);

  return {
    title: "Pulse Cockpit",
    policySetupState: policyRows.length > 0 ? "configured" : "none",
    defaultProvider: fleet.defaultProvider,
    heartbeats,
    findings,
    autoRecoveryTargets,
    attention,
    filters,
    defaultFilter: "all",
    counts,
    governance,
    deployment,
    pulseProof,
    targets: packet.targets,
    generatedFromReceipts: fleet.generatedFromReceipts,
  };
}

export default derivePulseCockpit;
