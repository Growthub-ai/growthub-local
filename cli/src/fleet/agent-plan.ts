/**
 * Agent-led maintenance flow — draft heal plan document.
 *
 * Produces a durable, human-reviewable plan document for a specific fork.
 * The document is:
 *   1. Built from the already-shipping detector + plan builder.
 *   2. Projected through the policy via buildDriftArtifactSummary.
 *   3. Captured as a trace event ('agent_checkpoint') for durability.
 *   4. NEVER auto-applied — the operator must explicitly run
 *      `growthub kit fork heal <fork-id>` or `fleet heal` to act on it.
 *
 * This is the "agent inspects, drafts, waits, resumes, documents" flow the
 * user asked for, built as a thin composition over the engine.
 */

import { detectKitForkDrift, buildKitForkHealPlan } from "../kits/fork-sync.js";
import { readKitForkPolicy } from "../kits/fork-policy.js";
import { appendKitForkTraceEvent } from "../kits/fork-trace.js";
import { buildDriftArtifactSummary, summariseArtifactSummaryAsNarrative } from "./drift-summary.js";
import type { KitForkRegistration } from "../kits/fork-types.js";
import type { AgentHealPlanDocument } from "./types.js";

export function buildAgentHealPlanDocument(
  reg: KitForkRegistration,
  opts: { captureInTrace?: boolean } = {},
): AgentHealPlanDocument {
  const policy = readKitForkPolicy(reg.forkPath);
  const driftReport = detectKitForkDrift(reg);
  const plan = buildKitForkHealPlan(driftReport, { policy });
  const artifactBreakdown = buildDriftArtifactSummary(driftReport, plan, policy);
  const narrative = summariseArtifactSummaryAsNarrative(artifactBreakdown);
  const awaitsConfirmation = plan.actions
    .filter((a) => a.needsConfirmation)
    .map((a) => a.targetPath);

  const doc: AgentHealPlanDocument = {
    forkId: reg.forkId,
    kitId: reg.kitId,
    generatedAt: new Date().toISOString(),
    summary:
      awaitsConfirmation.length > 0
        ? `Plan drafted — ${awaitsConfirmation.length} action(s) await your confirmation before applying.`
        : plan.actions.length === 0
          ? "Fork is clean — no actionable plan."
          : `Plan drafted — ${plan.actions.length} action(s) ready to apply.`,
    driftReport,
    plan,
    artifactBreakdown,
    policySnapshot: policy,
    awaitsConfirmation,
    narrative,
    registrationAtDraftTime: reg,
  };

  if (opts.captureInTrace !== false) {
    appendKitForkTraceEvent(reg.forkPath, {
      forkId: reg.forkId,
      kitId: reg.kitId,
      type: "agent_checkpoint",
      summary: `Agent drafted heal plan — awaits=${awaitsConfirmation.length}, actions=${plan.actions.length}`,
      detail: {
        severity: driftReport.overallSeverity,
        fromVersion: plan.fromVersion,
        toVersion: plan.toVersion,
        awaitsConfirmation,
      },
    });
  }

  return doc;
}
