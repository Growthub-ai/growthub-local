/**
 * Autonomic pulse projection — the governed "/pulse" heartbeat lens over the
 * whole workspace (GOVERNED_COCKPIT_ENTRY_POINT_PATTERN_V1, same primitive
 * class as the CEO and Schedule cockpits).
 *
 * PURE deriver — no React, no fetch, no fs, no config writes, no clock reads.
 * Callers pass `nowMs` explicitly so every sensor is deterministic and
 * offline-testable with `node --test`. It introduces NO new governed object
 * runtime, NO new API route, NO new PATCH field, and NO second readiness
 * check: fleet truth comes from `deriveScheduleCockpit`, run truth from the
 * existing `lastScheduledRun*` proof columns, deployment truth from the
 * `workspace-app-registry` / `vercel-projects` governed rows, and policy truth
 * from `workspace-policy` rows (plain data-model rows — the human-authored
 * objective function).
 *
 *   autonomic pulse =
 *     heartbeat sensors (stall / timeout / failure recovery detection)
 *   + policy evaluation (human rules · preferences · use-case goal, as rows)
 *   + governed recovery hand-offs over EXISTING routes only
 *
 * Heartbeat rationale (serverless): the destination door executes published
 * graphs with a 60s budget (`workflows/[providerId]/route.js` timeoutMs) and
 * writes `lastScheduledRunAttemptedAt` at dispatch, then a success/failure
 * timestamp at completion. A run whose attempt timestamp is newer than any
 * completion timestamp past budget+grace is a STALLED run — the exact watchdog
 * shape the upstream Paperclip heartbeat service applies to agent runs
 * (queued → running → stuck detection → recovery), projected here over the
 * governed proof columns so a bad run can never sit stuck without a visible,
 * recoverable pulse finding.
 *
 * MCP alignment (GOVERNED_MCP_CONSOLE_V1): this deriver is the same class of
 * read-only intelligence as the Workspace MCP tools (`app_readiness`,
 * `outcome_ledger`, `next_actions`). Every `nextAction`/`recovery` emitted here
 * is a hand-off to an existing governed route — never a mutation — mirroring
 * the MCP operating loop `read → reason → dry-run → governed mutate → re-read`.
 * Agents may consume this packet directly or reach the identical truth through
 * `growthub serve --mcp`.
 *
 * AUTO-APPROVE RULE: a policy row may declare `autoApprove`, but it can only
 * ever authorize SAFE recovery kinds (read-only readiness rescans). Any policy
 * row attempting to auto-approve a mutating recovery is clamped to manual —
 * the human gate is the trust boundary, exactly like helper propose→apply.
 */

import { deriveScheduleCockpit } from "./schedule-cockpit-console.js";

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

/**
 * Conventional id/label of the CUSTOM business object carrying human rules /
 * preferences / goals. NOT a new object type or preset — the user creates it
 * through the existing governed `create_object` helper lane (a plain custom
 * object with these columns), exactly like any other business object. The
 * pulse only READS it; zero schema, zero new preset, zero new object runtime.
 */
export const WORKSPACE_POLICY_OBJECT_ID = "workspace-policy";

/** Conventional Name of the self-invoking heartbeat workflow (optional). */
export const WORKSPACE_PULSE_WORKFLOW_NAME = "workspace-pulse";

/** Serverless run budget at the destination door (workflows/[providerId]). */
export const PULSE_RUN_BUDGET_MS = 60_000;
/** Grace on top of the budget before an attempted run counts as stalled —
 * covers provider retry delivery and cold-start scheduling jitter. */
export const PULSE_STALL_GRACE_MS = 120_000;

/** Canonical heartbeat sensor tags (the pulse's delta vocabulary). */
export const PULSE_SENSOR_TAGS = {
  STALLED_RUN: "stalled-run",
  RUN_FAILED: "run-failed",
  SCHEDULE_DRIFT: "schedule-drift",
  BLOCKED_READINESS: "blocked-readiness",
  MISSING_SECRET: "missing-server-secret",
  GOVERNANCE_BLOCKED: "governance-blocked-attempts",
  PULSE_PROOF_STALE: "pulse-proof-stale",
  DEPLOYMENT_ERROR: "deployment-error",
};

/** Policy rule kinds the evaluator understands. Anything else is reported as
 * an unknown-rule finding (never silently ignored — a policy the workspace
 * cannot evaluate is itself a governance signal). */
export const PULSE_RULE_KINDS = [
  "max-stalled-runs",
  "max-failed-runs",
  "max-blocked-workflows",
  "max-drifted-workflows",
  "max-blocked-attempts",
  "max-missing-secrets",
  "require-deployment-live",
  "pulse-cadence-minutes",
];

/** Recovery kinds that MAY be auto-approved by a policy row. Everything else
 * requires the human gate regardless of what the row declares. */
export const SAFE_AUTO_RECOVERY_KINDS = ["readiness"];

/* ------------------------------------------------------------------ */
/* Heartbeat sensors                                                    */
/* ------------------------------------------------------------------ */

/**
 * Classify one workflow row's run heartbeat from its governed proof columns.
 * Deterministic: all time math uses the caller's `nowMs`.
 *
 * States:
 *   idle     — never attempted (or no binding)
 *   running  — attempted, within budget+grace, no completion yet
 *   healthy  — last completion is a success and is the latest signal
 *   failed   — last completion is a failure (or non-2xx status)
 *   stalled  — attempted, past budget+grace, no completion since the attempt
 */
export function senseRunHeartbeat(row, { nowMs = null } = {}) {
  const attemptedAt = toMs(row?.lastScheduledRunAttemptedAt);
  const succeededAt = toMs(row?.lastScheduledRunSucceededAt);
  const failedAt = toMs(row?.lastScheduledRunFailedAt);
  const status = clean(row?.lastScheduledRunStatus);
  const failureReason = clean(row?.lastScheduledRunFailureReason);
  const completedAt = Math.max(succeededAt || 0, failedAt || 0) || null;

  if (!attemptedAt && !completedAt && !status) {
    return { state: "idle", attemptedAt: null, completedAt: null, ageMs: null, reason: "" };
  }

  // Attempt newer than any completion → the run is in flight or stuck.
  if (attemptedAt && (!completedAt || attemptedAt > completedAt)) {
    if (nowMs == null) {
      // Without a clock we cannot distinguish running from stalled — report
      // running (the conservative, non-alarming read) and say why.
      return { state: "running", attemptedAt, completedAt, ageMs: null, reason: "no-clock" };
    }
    const ageMs = nowMs - attemptedAt;
    if (ageMs > PULSE_RUN_BUDGET_MS + PULSE_STALL_GRACE_MS) {
      return { state: "stalled", attemptedAt, completedAt, ageMs, reason: "attempt-past-budget-without-completion" };
    }
    return { state: "running", attemptedAt, completedAt, ageMs, reason: "" };
  }

  const failed = Boolean(failureReason) || (failedAt && (!succeededAt || failedAt > succeededAt)) || (status && !status.startsWith("2"));
  if (failed) {
    return { state: "failed", attemptedAt, completedAt, ageMs: nowMs != null && completedAt ? nowMs - completedAt : null, reason: failureReason || (status ? `status-${status}` : "failure") };
  }
  return { state: "healthy", attemptedAt, completedAt, ageMs: nowMs != null && completedAt ? nowMs - completedAt : null, reason: "" };
}

/** Governed recovery hand-off for a heartbeat state — existing routes ONLY.
 * `readiness` and `resume` map to POST /api/workspace/add-ons/:providerId/
 * schedule actions (the ScheduleCockpit action lane); `open-canvas` hands to
 * the workflow canvas; `retest` hands to the sidecar test-event flow. */
function recoveryFor({ heartbeat, card }) {
  if (heartbeat.state === "stalled") {
    return {
      kind: "readiness",
      label: "Rescan & recover",
      then: card?.paused ? "resume" : null,
      handoff: "add-ons-schedule-route",
      explain: "Run the readiness scan (read-only) to re-derive binding truth; a stale or drifted binding surfaces its blocking node, and resume re-verifies server-side before re-arming.",
    };
  }
  if (heartbeat.state === "failed") {
    const inbound = ["inbound-webhook", "api-request"].includes(clean(card?.row?.schedulerTriggerKind));
    return inbound
      ? { kind: "retest", label: "Send fresh test event", then: null, handoff: "workflow-sidecar", explain: "Re-prove the inbound binding with a fresh test event through the sidecar; publish stays gated on fresh proof." }
      : { kind: "readiness", label: "Rescan readiness", then: null, handoff: "add-ons-schedule-route", explain: "Read-only rescan to name the blocking node before any re-run." };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Governed-row readers (deployment + policy)                          */
/* ------------------------------------------------------------------ */

function rowsOfObject(workspaceConfig, matcher) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const out = [];
  for (const object of objects) {
    if (!matcher(object)) continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) out.push(row);
  }
  return out;
}

/** Deployment posture from the governed app/deploy rows (release-freeze shapes). */
export function senseDeploymentPosture(workspaceConfig) {
  const appRows = rowsOfObject(workspaceConfig, (o) => clean(o?.objectType) === "app-surface" || clean(o?.id) === "workspace-app-registry");
  const projectRows = rowsOfObject(workspaceConfig, (o) => clean(o?.id) === "vercel-projects" || clean(o?.label).toLowerCase() === "vercel projects");
  const live = projectRows.filter((r) => clean(r?.status) === "live" || clean(r?.latestDeploymentState).toUpperCase() === "READY").length;
  const errored = projectRows.filter((r) => ["ERROR", "CANCELED", "FAILED"].includes(clean(r?.latestDeploymentState).toUpperCase()) || clean(r?.lastDeployStatus) === "failed").length;
  return {
    appSurfaces: appRows.length,
    projects: projectRows.length,
    live,
    errored,
    anyLive: live > 0,
  };
}

/** Read enabled policy rows from the user-created custom object (matched by
 * conventional id or label — never by a dedicated object type). */
export function readPolicyRows(workspaceConfig) {
  const rows = rowsOfObject(workspaceConfig, (o) =>
    clean(o?.id) === WORKSPACE_POLICY_OBJECT_ID
    || clean(o?.label || o?.name).toLowerCase().replace(/\s+/g, "-") === WORKSPACE_POLICY_OBJECT_ID);
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

const METRIC_BY_RULE = {
  "max-stalled-runs": (packet) => packet.counts.stalled,
  "max-failed-runs": (packet) => packet.counts.failed,
  "max-blocked-workflows": (packet) => packet.counts.blocked,
  "max-drifted-workflows": (packet) => packet.counts.drifted,
  "max-blocked-attempts": (packet) => packet.governance.blockedAttempts,
  "max-missing-secrets": (packet) => packet.counts.missingSecrets,
};

/**
 * Evaluate policy rows against the condition packet. Pure and deterministic.
 * Returns findings sorted most-severe-first. Every finding's nextAction is a
 * governed hand-off; `autoApprovable` is true ONLY when the row opted in AND
 * the recovery kind is in SAFE_AUTO_RECOVERY_KINDS (the clamp is the point).
 */
export function evaluatePulsePolicies({ packet, policyRows = [] } = {}) {
  const findings = [];
  for (const policy of policyRows) {
    const { policyId, ruleKind, threshold, severity, autoApprove } = policy;

    if (ruleKind === "require-deployment-live") {
      if (!packet.deployment.anyLive) {
        findings.push(buildFinding(policy, {
          observed: packet.deployment.live,
          expected: ">=1 live deployment",
          message: "No live deployment found in the governed vercel-projects rows.",
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
      const stale = !proof.lastBeatMs || (packet.nowMs != null && packet.nowMs - proof.lastBeatMs > maxAgeMs);
      if (stale) {
        findings.push(buildFinding(policy, {
          observed: proof.lastBeatAt || "never",
          expected: `a pulse beat within ${threshold == null ? 60 : threshold}m`,
          message: proof.workflowFound
            ? "The pulse workflow has not produced fresh run proof within its cadence window."
            : `No workflow named "${WORKSPACE_PULSE_WORKFLOW_NAME}" exists yet — the heartbeat has no owner.`,
          sensorTag: PULSE_SENSOR_TAGS.PULSE_PROOF_STALE,
          nextAction: proof.workflowFound
            ? { kind: "readiness", label: "Rescan pulse workflow", handoff: "add-ons-schedule-route", explain: "Read-only readiness rescan of the pulse workflow binding." }
            : { kind: "seed-proposal", label: "Propose pulse workflow", handoff: "helper-proposal", explain: "Seed a governed /loop proposal creating the scheduler-bound pulse workflow." },
          autoApprove,
        }));
      }
      continue;
    }

    const metric = METRIC_BY_RULE[ruleKind];
    if (!metric) {
      findings.push(buildFinding(policy, {
        observed: ruleKind || "(empty)",
        expected: `one of: ${PULSE_RULE_KINDS.join(", ")}`,
        message: `Unknown policy rule kind "${ruleKind}" — this row cannot be evaluated.`,
        sensorTag: PULSE_SENSOR_TAGS.GOVERNANCE_BLOCKED,
        severityOverride: "warn",
        nextAction: { kind: "open-data-model", label: "Fix policy row", handoff: "data-model", explain: "Edit the workspace-policy row to a supported ruleKind." },
        autoApprove: false,
      }));
      continue;
    }

    const observed = metric(packet);
    const limit = threshold == null ? 0 : threshold;
    if (observed > limit) {
      const recoverySensor =
        ruleKind === "max-stalled-runs" ? PULSE_SENSOR_TAGS.STALLED_RUN
          : ruleKind === "max-failed-runs" ? PULSE_SENSOR_TAGS.RUN_FAILED
            : ruleKind === "max-drifted-workflows" ? PULSE_SENSOR_TAGS.SCHEDULE_DRIFT
              : ruleKind === "max-missing-secrets" ? PULSE_SENSOR_TAGS.MISSING_SECRET
                : ruleKind === "max-blocked-attempts" ? PULSE_SENSOR_TAGS.GOVERNANCE_BLOCKED
                  : PULSE_SENSOR_TAGS.BLOCKED_READINESS;
      findings.push(buildFinding(policy, {
        observed,
        expected: `<= ${limit}`,
        message: `${policyId}: observed ${observed}, allowed ${limit}.`,
        sensorTag: recoverySensor,
        nextAction: ["max-stalled-runs", "max-failed-runs", "max-drifted-workflows", "max-blocked-workflows"].includes(ruleKind)
          ? { kind: "readiness", label: "Rescan affected workflows", handoff: "add-ons-schedule-route", explain: "Read-only readiness rescan per affected card; recovery re-verifies server-side." }
          : ruleKind === "max-missing-secrets"
            ? { kind: "open-settings", label: "Configure secrets", handoff: "settings-env", explain: "Resolve the missing env refs in workspace settings (server-side only)." }
            : { kind: "open-outcomes", label: "Review blocked attempts", handoff: "agent-outcomes", explain: "Inspect the receipt stream for the blocked governance attempts." },
        autoApprove,
      }));
    }
  }

  const SEVERITY_ORDER = { critical: 0, warn: 1, info: 2 };
  findings.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3));
  return findings;
}

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

  // Heartbeat sensing over every fleet card's owning row.
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const rowByCard = new Map();
  for (const object of objects) {
    if (clean(object?.objectType) !== "sandbox-environment") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      rowByCard.set(`${clean(object?.id)}::${clean(row?.Name)}`, row);
    }
  }

  const heartbeats = fleet.workflowCards.map((card) => {
    const row = rowByCard.get(`${card.objectId}::${card.name}`) || null;
    const heartbeat = senseRunHeartbeat(row || {}, { nowMs });
    const cardWithRow = { ...card, row };
    const recovery = recoveryFor({ heartbeat, card: cardWithRow });
    const sensorTags = [];
    if (heartbeat.state === "stalled") sensorTags.push(PULSE_SENSOR_TAGS.STALLED_RUN);
    if (heartbeat.state === "failed") sensorTags.push(PULSE_SENSOR_TAGS.RUN_FAILED);
    if (card.state === "drifted") sensorTags.push(PULSE_SENSOR_TAGS.SCHEDULE_DRIFT);
    if (card.state === "blocked") sensorTags.push(PULSE_SENSOR_TAGS.BLOCKED_READINESS);
    if ((card.readiness?.deltaTags || []).includes("missing-server-secret")) sensorTags.push(PULSE_SENSOR_TAGS.MISSING_SECRET);
    return {
      cardId: card.cardId,
      objectId: card.objectId,
      name: card.name,
      fleetState: card.state,
      providerId: card.providerId,
      productId: card.productId,
      triggerKind: clean(row?.schedulerTriggerKind),
      heartbeat,
      sensorTags,
      recovery,
      artifact: card.artifact,
    };
  });

  // Pulse-of-the-pulse: the heartbeat workflow's own proof (watchdog watching
  // the watchdog — a silent pulse is itself a finding via pulse-cadence rule).
  const pulseRow = [...rowByCard.entries()].find(([key]) => key.endsWith(`::${WORKSPACE_PULSE_WORKFLOW_NAME}`))?.[1] || null;
  const pulseBeat = pulseRow ? senseRunHeartbeat(pulseRow, { nowMs }) : null;
  const pulseProof = {
    workflowFound: Boolean(pulseRow),
    lastBeatMs: pulseBeat?.completedAt || null,
    lastBeatAt: pulseRow ? clean(pulseRow?.lastScheduledRunSucceededAt) || clean(pulseRow?.lastScheduledRunAttemptedAt) : "",
    state: pulseBeat?.state || "absent",
  };

  const deployment = senseDeploymentPosture(workspaceConfig);
  const policyRows = readPolicyRows(workspaceConfig);

  const counts = {
    workflows: fleet.counts.total,
    scheduled: fleet.counts.scheduled,
    blocked: fleet.counts.blocked,
    drifted: fleet.counts.drifted,
    missingSecrets: fleet.counts.missingSecret,
    stalled: heartbeats.filter((h) => h.heartbeat.state === "stalled").length,
    failed: heartbeats.filter((h) => h.heartbeat.state === "failed").length,
    running: heartbeats.filter((h) => h.heartbeat.state === "running").length,
    healthy: heartbeats.filter((h) => h.heartbeat.state === "healthy").length,
    policies: policyRows.length,
  };

  const safeReceipts = Array.isArray(receipts) ? receipts : [];
  const governance = { blockedAttempts: safeReceipts.filter((r) => r && r.outcomeStatus === "blocked").length };

  const packet = { nowMs, counts, governance, deployment, pulseProof };
  const findings = evaluatePulsePolicies({ packet, policyRows });

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
    heartbeats,
    findings,
    autoApprovable: findings.filter((f) => f.autoApprovable),
    attention,
    filters,
    defaultFilter: "all",
    counts,
    governance,
    deployment,
    pulseProof,
    packet,
    // MCP correlation — the same truth is reachable through the Workspace MCP
    // console; mutation hand-offs mirror its `next_actions` contract.
    mcp: {
      console: "growthub serve --mcp",
      readTools: ["app_readiness", "outcome_ledger", "list_workflows"],
      handoffTool: "next_actions",
    },
    generatedFromReceipts: safeReceipts.length > 0,
  };
}

export default derivePulseCockpit;
