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
import { parseOrchestrationGraph, isAgentSwarmGraph } from "./orchestration-graph.js";
import { deriveSwarmWorkflowExecutionEligibility } from "./workspace-swarm-proposal.js";
import { deriveSwarmRunProjection } from "./orchestration-run-console.js";

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

function safeReceiptsOf(receipts) {
  return Array.isArray(receipts) ? receipts.filter(Boolean) : [];
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

/** Human status labels — the ONLY status vocabulary the cockpit renders.
 * Real states, real capitalization, no synthetic chips. */
export const HEARTBEAT_STATUS_LABEL = {
  idle: "Idle",
  running: "Running",
  healthy: "Healthy",
  failed: "Failed",
  stalled: "Stalled",
};

function truncate(text, max = 96) {
  const s = clean(text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

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

    if (ruleKind === "max-swarm-tokens-24h") {
      const s = packet.swarm || {};
      const limit = threshold == null ? 0 : threshold;
      if ((s.reportedTokens24h || 0) > limit) {
        findings.push(buildFinding(policy, {
          observed: s.reportedTokens24h,
          expected: `<= ${limit} reported tokens/24h`,
          message: `Agent swarms used ${s.reportedTokens24h} reported tokens in 24h (limit ${limit}).${s.unreportedRuns24h ? ` ${s.unreportedRuns24h} run${s.unreportedRuns24h === 1 ? "" : "s"} reported no token count and ${s.unreportedRuns24h === 1 ? "is" : "are"} not included.` : ""}`,
          sensorTag: PULSE_SENSOR_TAGS.GOVERNANCE_BLOCKED,
          nextAction: { kind: "open-ceo", label: "Review swarm spend", handoff: "ceo-cockpit", explain: "The CEO cockpit shows each swarm's runs and truthful per-agent telemetry." },
          autoApprove,
        }));
      }
      continue;
    }

    if (ruleKind === "min-swarm-outcome-score") {
      const s = packet.swarm || {};
      const floor = threshold == null ? 0.5 : threshold;
      if (s.worst && s.worst.score < floor) {
        findings.push(buildFinding(policy, {
          observed: s.worst.score,
          expected: `>= ${floor}`,
          message: `"${s.worst.name}" scored ${s.worst.score} on its last swarm run${s.worst.rewardKind === "structural-fallback" ? " (structural score — the synthesizer returned no semantic outcome)" : ""}.`,
          sensorTag: PULSE_SENSOR_TAGS.RUN_FAILED,
          nextAction: {
            kind: "seed-proposal",
            label: "Delegate improvement",
            handoff: "helper-proposal",
            targetCardIds: [s.worst.cardId],
            seedIntent: "swarm",
            seedPrompt: `Propose a governed agent swarm to improve the workflow "${s.worst.name}": its last outcome score was ${s.worst.score} (floor ${floor}). Review the previous run's outputs, sharpen the task prompts and outcome criteria, and finish only when a fresh run scores at or above ${floor}:`,
          },
          autoApprove,
        }));
      }
      continue;
    }

    if (ruleKind === "max-failed-agent-nodes") {
      const a = packet.agents || {};
      const limit = threshold == null ? 0 : threshold;
      if ((a.failedNodes || 0) > limit) {
        findings.push(buildFinding(policy, {
          observed: a.failedNodes,
          expected: `<= ${limit}`,
          message: `${a.failedNodes} AI-agent node${a.failedNodes === 1 ? "" : "s"} failed or ${a.failedNodes === 1 ? "was" : "were"} skipped in the latest runs of ${(a.failedNames || []).slice(0, 3).map((n) => `"${n}"`).join(", ")}${(a.failedNames || []).length > 3 ? "…" : ""}.`,
          sensorTag: PULSE_SENSOR_TAGS.RUN_FAILED,
          nextAction: { kind: "open-checks", label: "Open affected workflows", handoff: "checks-tab", targetCardIds: a.failedCardIds || [], explain: "Each affected workflow's card shows its state and recovery; open it to re-run the agent node with fresh inputs." },
          autoApprove,
        }));
      }
      continue;
    }

    if (ruleKind === "max-blocked-swarms") {
      const s = packet.swarm || {};
      const limit = threshold == null ? 0 : threshold;
      if ((s.blocked || 0) > limit) {
        findings.push(buildFinding(policy, {
          observed: s.blocked,
          expected: `<= ${limit}`,
          message: `${s.blocked} agent swarm${s.blocked === 1 ? " is" : "s are"} not runnable — the eligibility gate names what each is missing.`,
          sensorTag: PULSE_SENSOR_TAGS.BLOCKED_READINESS,
          nextAction: { kind: "open-checks", label: "Open blocked swarms", handoff: "checks-tab", targetCardIds: s.blockedCardIds || [], explain: "The Checks tab lists each blocked swarm; open a card to see and fix what it is missing." },
          autoApprove,
        }));
      }
      continue;
    }

    const rule = RULE_TABLE[ruleKind];
    if (!rule) {
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

/** Plain-language copy per rule kind — what the check IS, why it fired, what
 * the action DOES, and what outcome to expect. No-code users read this; the
 * rule-kind slug is metadata, never the message. */
function plainCopyFor(finding) {
  const { ruleKind, observed, expected, goal } = finding;
  const goalLine = goal ? ` Your goal: ${truncate(goal, 80)}` : "";
  const COPY = {
    "max-stalled-runs": {
      title: "Runs are sitting stuck",
      why: `${observed} workflow run${observed === 1 ? "" : "s"} started but never finished within the runtime budget (you allow ${clean(String(expected)).replace("<= ", "up to ")}).${goalLine}`,
      actionDoes: "Runs a read-only check on each affected workflow and names exactly what is blocking it.",
      actionOutcome: "Each workflow reports Ready or names its blocker. Nothing changes without you.",
    },
    "max-failed-runs": {
      title: "Runs are failing",
      why: `${observed} workflow run${observed === 1 ? "" : "s"} ended in failure (you allow ${clean(String(expected)).replace("<= ", "up to ")}).${goalLine}`,
      actionDoes: "Runs a read-only check on each failing workflow to name the broken piece.",
      actionOutcome: "You see the exact blocker per workflow, with a fix path.",
    },
    "max-blocked-workflows": {
      title: "Workflows are blocked",
      why: `${observed} workflow${observed === 1 ? " is" : "s are"} blocked from running (you allow ${clean(String(expected)).replace("<= ", "up to ")}).${goalLine}`,
      actionDoes: "Re-checks readiness on each blocked workflow.",
      actionOutcome: "Each blocked workflow names what it needs to run.",
    },
    "max-drifted-workflows": {
      title: "Schedules drifted from their workflows",
      why: `${observed} scheduled workflow${observed === 1 ? " no longer matches" : "s no longer match"} the schedule that runs ${observed === 1 ? "it" : "them"}.${goalLine}`,
      actionDoes: "Re-checks each drifted binding.",
      actionOutcome: "You see what changed and how to re-align it.",
    },
    "max-blocked-attempts": {
      title: "Governance blocked some attempts",
      why: `${observed} action${observed === 1 ? " was" : "s were"} blocked by workspace rules and should be reviewed.${goalLine}`,
      actionDoes: "Opens the CEO cockpit, which folds the audit trail of blocked attempts.",
      actionOutcome: "You see who tried what, and why it was blocked.",
    },
    "max-missing-secrets": {
      title: "Credentials are missing",
      why: `${observed} workflow${observed === 1 ? " references a credential" : "s reference credentials"} that ${observed === 1 ? "is" : "are"} not configured.${goalLine}`,
      actionDoes: "Opens workspace settings where credentials are configured (server-side only).",
      actionOutcome: "Once the credential resolves, the affected workflows unblock on the next pulse.",
    },
    "require-deployment-live": {
      title: "No live deployment",
      why: `This workspace should be live, but no deployment shows live evidence yet.${goalLine}`,
      actionDoes: "Opens /settings/apps to review and redeploy through the governed deploy flow.",
      actionOutcome: "A successful deploy writes proof the pulse reads on its next beat.",
    },
    "max-swarm-tokens-24h": {
      title: "Agent swarms are over budget",
      why: `Swarms used ${observed} reported tokens in the last 24 hours — above the ceiling you set.${goalLine}`,
      actionDoes: "Opens the CEO cockpit, which shows each swarm's runs with truthful per-agent token counts.",
      actionOutcome: "You see where the spend goes; pause or reshape the expensive swarm.",
    },
    "min-swarm-outcome-score": {
      title: "A swarm's output quality dropped",
      why: `A swarm's last run scored ${observed} — below the floor you set.${goalLine}`,
      actionDoes: "Drafts a governed improvement proposal for that exact workflow — reviewed before anything runs.",
      actionOutcome: "After you approve, agents rework the swarm until a fresh run clears your floor.",
    },
    "max-blocked-swarms": {
      title: "Agent swarms can't run",
      why: `${observed} swarm${observed === 1 ? " is" : "s are"} blocked before launch — each names exactly what it is missing.${goalLine}`,
      actionDoes: "Opens the affected swarms in Checks so you can fix what each one is missing.",
      actionOutcome: "Once the missing pieces resolve, the swarms become runnable again.",
    },
    "max-failed-agent-nodes": {
      title: "AI agent steps are failing",
      why: `${observed} AI-agent step${observed === 1 ? "" : "s"} inside your workflows failed or ${observed === 1 ? "was" : "were"} skipped on the latest runs.${goalLine}`,
      actionDoes: "Opens the affected workflows in Checks; each card offers its recovery (re-run, retest, or rebind).",
      actionOutcome: "A fresh run with every agent step completed clears this on the next pulse.",
    },
    "pulse-cadence-minutes": {
      title: "The workspace heartbeat is silent",
      why: finding.nextAction?.kind === "seed-proposal"
        ? `No heartbeat workflow exists yet, so the workspace cannot check on itself.${goalLine}`
        : `The heartbeat workflow has no fresh successful beat.${goalLine}`,
      actionDoes: finding.nextAction?.kind === "seed-proposal"
        ? "Drafts a governed proposal that creates the heartbeat workflow — you review it before anything runs."
        : "Runs a read-only check on the heartbeat workflow's binding.",
      actionOutcome: finding.nextAction?.kind === "seed-proposal"
        ? "After you approve, the workspace checks on itself on a schedule."
        : "The heartbeat reports Ready or names its blocker.",
    },
  };
  return COPY[ruleKind] || {
    title: "A policy rule can't be evaluated",
    why: `The rule kind "${truncate(String(observed), 40)}" is not one the pulse understands.`,
    actionDoes: "Opens the policy table so you can correct the rule.",
    actionOutcome: "The rule evaluates on the next pulse.",
  };
}

/** Exported list of evaluable rule kinds (tests + docs + the policy editor). */
export const PULSE_RULE_KINDS = Object.keys(RULE_TABLE).concat([
  "require-deployment-live",
  "pulse-cadence-minutes",
  "max-swarm-tokens-24h",
  "min-swarm-outcome-score",
  "max-blocked-swarms",
  "max-failed-agent-nodes",
]);

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
export function derivePulseCockpit({ workspaceConfig, configuredEnvRefs = [], receipts = [], runRecordsByCard = {}, nowMs = null } = {}) {
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

    // Agent lenses. Two DISTINCT shapes share nothing but vocabulary:
    //   - agent-swarm-v1 graphs (orchestrator→workers→synthesizer) with their
    //     own eligibility gate, outcome score, and token telemetry;
    //   - a plain pipeline graph carrying one or more standalone `ai-agent`
    //     NODES, whose per-node completion truth is already on the row in
    //     `lastScheduledRunNodeTrace` (written by the destination door).
    // Policy must cover BOTH — a workspace with a single ai-agent node and no
    // swarm still gets agent-health findings.
    let swarm = null;
    let agentNodes = null;
    const graph = row ? parseOrchestrationGraph(row.orchestrationConfig || row.orchestrationGraph) : null;
    const isSwarmGraph = Boolean(graph && isAgentSwarmGraph(graph));
    if (graph && !isSwarmGraph) {
      const declared = (Array.isArray(graph.nodes) ? graph.nodes : []).filter((n) => n?.type === "ai-agent");
      if (declared.length > 0) {
        // Per-node truth from the row's own trace — no fetch, no estimate.
        let trace = [];
        try { trace = JSON.parse(clean(row?.lastScheduledRunNodeTrace) || "[]"); } catch { trace = []; }
        const traceById = new Map((Array.isArray(trace) ? trace : []).filter(Boolean).map((t) => [clean(t.nodeId || t.id), t]));
        const nodes = declared.map((n) => {
          const t = traceById.get(clean(n.id));
          return { nodeId: clean(n.id), status: t ? clean(t.status) || "unknown" : "untraced" };
        });
        agentNodes = {
          count: declared.length,
          traced: nodes.filter((n) => n.status !== "untraced").length,
          failed: nodes.filter((n) => ["failed", "skipped"].includes(n.status)).map((n) => n.nodeId),
        };
      }
    }
    if (graph && isSwarmGraph) {
      const eligibility = deriveSwarmWorkflowExecutionEligibility({ row, workspaceConfig });
      const record = runRecordsByCard[card.cardId] || null;
      const projection = record ? deriveSwarmRunProjection(record) : null;
      const reward = record?.swarm?.reward && typeof record.swarm.reward === "object" ? record.swarm.reward : null;
      swarm = {
        isSwarm: true,
        eligibilityReady: Boolean(eligibility?.ready),
        eligibilityMissing: Array.isArray(eligibility?.missing) ? eligibility.missing : [],
        lastRun: record
          ? {
            ranAtMs: toMs(record.ranAt),
            status: clean(projection?.status || record.status),
            score: Number.isFinite(reward?.score) ? reward.score : null,
            rewardKind: clean(reward?.kind),
            totalTokens: Number.isFinite(projection?.totalTokens) ? projection.totalTokens : null,
          }
          : null,
      };
    }
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
      statusLabel: HEARTBEAT_STATUS_LABEL[heartbeat.state] || "Idle",
      // One truncated, stable reason line — cards never grow with payload size.
      reasonLine: heartbeat.reason && heartbeat.reason !== "no-clock" ? truncate(heartbeat.reason, 72) : "",
      sensorTags,
      recovery,
      // Personalized delegation: heal this workflow through the existing
      // governed agent-swarm lane (proposal-gated; CEO cockpit oversees runs).
      delegate: (heartbeat.state === "stalled" || heartbeat.state === "failed")
        ? {
          label: "Delegate to agents",
          seedIntent: "swarm",
          seedPrompt: `Propose a governed agent swarm to heal the workflow "${card.name}": diagnose why its last run ${heartbeat.state === "stalled" ? "never completed" : "failed"}${heartbeat.reason && heartbeat.reason !== "no-clock" ? ` (${truncate(heartbeat.reason, 60)})` : ""}, fix the graph or its inputs, and finish only when a fresh test run returns verified 200:`,
        }
        : null,
      swarm,
      agentNodes,
      artifact: card.artifact,
    };
  });

  // Standalone ai-agent node aggregates (single-agent workflows, NOT swarms).
  const agentEntries = heartbeats.filter((h) => h.agentNodes);
  const agentSignals = {
    workflows: agentEntries.length,
    failedNodes: agentEntries.reduce((n, h) => n + h.agentNodes.failed.length, 0),
    failedCardIds: agentEntries.filter((h) => h.agentNodes.failed.length > 0).map((h) => h.cardId),
    failedNames: agentEntries.filter((h) => h.agentNodes.failed.length > 0).map((h) => h.name),
  };

  // Swarm aggregates for the budget / quality / health rules — truthful:
  // reported tokens only, unreported runs counted separately, worst score
  // named with its workflow.
  const swarmEntries = heartbeats.filter((h) => h.swarm);
  const swarmWindowStart = nowMs != null ? nowMs - 24 * 3600_000 : null;
  let swarmReportedTokens24h = 0;
  let swarmUnreportedRuns24h = 0;
  let swarmWorst = null;
  for (const h of swarmEntries) {
    const run = h.swarm.lastRun;
    if (!run) continue;
    const inWindow = swarmWindowStart == null || run.ranAtMs == null || run.ranAtMs >= swarmWindowStart;
    if (inWindow) {
      if (run.totalTokens != null) swarmReportedTokens24h += run.totalTokens;
      else swarmUnreportedRuns24h += 1;
    }
    if (run.score != null && (swarmWorst == null || run.score < swarmWorst.score)) {
      swarmWorst = { cardId: h.cardId, name: h.name, score: run.score, rewardKind: run.rewardKind };
    }
  }
  const swarmSignals = {
    swarms: swarmEntries.length,
    blocked: swarmEntries.filter((h) => !h.swarm.eligibilityReady).length,
    blockedCardIds: swarmEntries.filter((h) => !h.swarm.eligibilityReady).map((h) => h.cardId),
    reportedTokens24h: swarmReportedTokens24h,
    unreportedRuns24h: swarmUnreportedRuns24h,
    worst: swarmWorst,
  };

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
    swarm: swarmSignals,
    agents: agentSignals,
    targets: {
      stalled: cardIdsWhere((h) => h.heartbeat.state === "stalled"),
      failed: cardIdsWhere((h) => h.heartbeat.state === "failed"),
      blocked: cardIdsWhere((h) => h.fleetState === "blocked"),
      drifted: cardIdsWhere((h) => h.fleetState === "drifted"),
      pulse: cardIdsWhere((h) => h.name === WORKSPACE_PULSE_WORKFLOW_NAME),
    },
  };
  const findings = evaluatePulsePolicies({ packet, policyRows }).map((f) => ({ ...f, plain: plainCopyFor(f) }));

  // Auto-recovery scope: exactly the union of target cards on auto-approvable
  // findings, restricted to cards whose recovery is the safe read-only kind —
  // and executed WITHOUT any mutating chain. Count shown = work done.
  const heartbeatById = new Map(heartbeats.map((h) => [h.cardId, h]));
  const autoRecoveryTargets = [...new Set(
    findings.filter((f) => f.autoApprovable).flatMap((f) => f.nextAction?.targetCardIds || []),
  )].map((id) => heartbeatById.get(id)).filter((h) => h && h.recovery?.kind === "readiness");

  // Attention: worst heartbeat first (stalled → failed), then worst finding —
  // always carrying causation-derived, personalized one-click actions.
  const stalledOrFailed = heartbeats.find((h) => h.heartbeat.state === "stalled")
    || heartbeats.find((h) => h.heartbeat.state === "failed");
  const attention = stalledOrFailed
    ? {
      kind: "heartbeat",
      heartbeat: stalledOrFailed,
      headline: `"${stalledOrFailed.name}" is ${HEARTBEAT_STATUS_LABEL[stalledOrFailed.heartbeat.state].toLowerCase()}`,
      explain: stalledOrFailed.recovery?.explain || "",
      oneClick: stalledOrFailed.recovery
        ? { label: stalledOrFailed.recovery.label, does: stalledOrFailed.recovery.explain }
        : null,
      delegate: stalledOrFailed.delegate,
    }
    : findings.length > 0
      ? {
        kind: "finding",
        finding: findings[0],
        headline: findings[0].plain.title,
        explain: findings[0].plain.why,
        oneClick: findings[0].nextAction
          ? { label: findings[0].nextAction.label, does: findings[0].plain.actionDoes }
          : null,
        delegate: null,
      }
      : null;

  const filters = [
    { id: "all", label: "All", count: heartbeats.length },
    { id: "stalled", label: "Stalled", count: counts.stalled },
    { id: "failed", label: "Failed", count: counts.failed },
    { id: "running", label: "Running", count: counts.running },
    { id: "healthy", label: "Healthy", count: counts.healthy },
    { id: "blocked", label: "Blocked", count: counts.blocked + counts.drifted },
  ].filter((f) => f.id === "all" || f.count > 0);

  // ---- Daily report: a pure causation digest of the last 24 hours ----
  const dayAgoMs = nowMs != null ? nowMs - 24 * 3600_000 : null;
  const inWindow = (r) => {
    if (dayAgoMs == null) return true;
    const t = toMs(r?.at || r?.createdAt || r?.timestamp);
    return t == null ? true : t >= dayAgoMs;
  };
  const runReceipts = safeReceiptsOf(receipts).filter((r) => clean(r?.kind).includes("run")).filter(inWindow);
  const runsOk = runReceipts.filter((r) => r?.outcomeStatus === "published").length;
  const runsFailed = runReceipts.filter((r) => ["failed", "blocked"].includes(clean(r?.outcomeStatus))).length;

  const insights = [];
  if (counts.stalled > 0) insights.push(`${counts.stalled} run${counts.stalled === 1 ? "" : "s"} sitting stuck — the one-click check names each blocker.`);
  if (counts.failed > 0) insights.push(`${counts.failed} workflow${counts.failed === 1 ? "" : "s"} failing — delegate to agents to diagnose and heal.`);
  if (runsFailed === 0 && runReceipts.length > 0) insights.push(`All ${runReceipts.length} recorded run${runReceipts.length === 1 ? "" : "s"} in the last day succeeded.`);
  if (governance.blockedAttempts > 0) insights.push(`${governance.blockedAttempts} action${governance.blockedAttempts === 1 ? " was" : "s were"} blocked by workspace rules — review in the CEO cockpit.`);
  if (deployment.projects > 0 && !deployment.anyLive) insights.push("No deployment shows live evidence — the workspace may not be reachable externally.");
  if (swarmSignals.swarms > 0) {
    insights.push(`Agent swarms: ${swarmSignals.swarms} governed, ${swarmSignals.blocked} blocked, ${swarmSignals.reportedTokens24h} reported tokens in 24h${swarmSignals.unreportedRuns24h ? ` (${swarmSignals.unreportedRuns24h} run${swarmSignals.unreportedRuns24h === 1 ? "" : "s"} reported no count)` : ""}.`);
    if (swarmSignals.worst) insights.push(`Lowest swarm outcome: "${swarmSignals.worst.name}" at ${swarmSignals.worst.score} — delegation can rework it.`);
  }
  if (agentSignals.workflows > 0 && agentSignals.failedNodes > 0) {
    insights.push(`${agentSignals.failedNodes} AI-agent step${agentSignals.failedNodes === 1 ? "" : "s"} failed in single-agent workflows — open them in Checks to recover.`);
  }
  if (insights.length === 0) insights.push("Everything the pulse watches is healthy. Add or tighten policies to watch more.");

  // Self-run readiness: what stands between this workspace and running itself.
  // Every incomplete step carries a governed one-click seed or hand-off.
  const ruleKindsPresent = new Set(policyRows.map((p) => p.ruleKind));
  const selfRun = [
    {
      id: "policies",
      label: "Rules & goal recorded",
      done: policyRows.length > 0,
      explain: "Your thresholds and use-case goal live as rows the pulse evaluates every beat.",
      action: policyRows.length > 0 ? null : { kind: "seed-proposal", label: "Propose policy object", seedIntent: "create_object", seedPrompt: "Create a custom business object named \"workspace-policy\" with columns ruleKind, threshold, severity, autoApprove, enabled, goal, description — rows will hold my pulse rules and use-case goal:" },
    },
    {
      id: "heartbeat",
      label: "Heartbeat workflow exists",
      done: pulseProof.workflowFound,
      explain: "A scheduler-bound workflow that beats on a cadence, so the workspace checks on itself with no one watching.",
      action: pulseProof.workflowFound ? null : { kind: "seed-proposal", label: "Propose heartbeat", seedIntent: "swarm", seedPrompt: `Propose a governed loop: create a scheduler-bound "${WORKSPACE_PULSE_WORKFLOW_NAME}" heartbeat workflow that reads workspace readiness and outcome receipts each beat, so stalled or failed runs surface with governed recovery:` },
    },
    {
      id: "coverage",
      label: "Stall & failure rules active",
      done: ruleKindsPresent.has("max-stalled-runs") && ruleKindsPresent.has("max-failed-runs"),
      explain: "With both rules on, no run can go bad silently.",
      action: null,
    },
    {
      id: "auto-recovery",
      label: "Safe auto-recovery enabled",
      done: policyRows.some((p) => p.autoApprove),
      explain: "Read-only recovery checks run themselves; anything that mutates still waits for you.",
      action: null,
    },
    {
      id: "beat-fresh",
      label: "Heartbeat beating",
      done: pulseProof.workflowFound && pulseProof.state === "healthy",
      explain: "The last beat succeeded — the loop is alive.",
      action: null,
    },
  ];

  const report = {
    windowLabel: "Last 24 hours",
    runsOk,
    runsFailed,
    blockedAttempts: governance.blockedAttempts,
    deploymentsLive: deployment.live,
    insights,
    selfRun,
    selfRunComplete: selfRun.filter((s) => s.done).length,
    selfRunTotal: selfRun.length,
  };

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
    swarm: swarmSignals,
    agents: agentSignals,
    report,
    policyRows,
    targets: packet.targets,
    generatedFromReceipts: fleet.generatedFromReceipts,
  };
}

export default derivePulseCockpit;
