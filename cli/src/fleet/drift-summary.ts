/**
 * Artifact / path-level drift summary builder.
 *
 * Projects a KitForkDriftReport through the active KitForkPolicy to produce
 * an operator-friendly breakdown of what an upcoming heal would do. Purely
 * derivational — never mutates inputs, never touches disk.
 */

import { isUntouchable } from "../kits/fork-policy.js";
import type { KitForkPolicy } from "../kits/fork-policy.js";
import type { KitForkDriftReport, KitForkHealPlan } from "../kits/fork-types.js";
import type { DriftArtifactSummary, DriftEntry, PackageDriftEntry } from "./types.js";

export function buildDriftArtifactSummary(
  report: KitForkDriftReport,
  plan: KitForkHealPlan,
  policy: KitForkPolicy,
): DriftArtifactSummary {
  const safeAdditions: DriftEntry[] = [];
  const safeUpdates: DriftEntry[] = [];
  const skippedUserModified: DriftEntry[] = [];
  const skippedUntouchable: DriftEntry[] = [];
  const needsConfirmation: DriftEntry[] = [];
  const customSkills: DriftEntry[] = [];
  const unresolvedUpstreamDeletion: DriftEntry[] = [];
  const packageAdditions: PackageDriftEntry[] = [];
  const packageUpgrades: PackageDriftEntry[] = [];

  // File-level drift projection — upstream deletions surface separately
  for (const drift of report.fileDrifts) {
    if (drift.changeType === "deleted") {
      unresolvedUpstreamDeletion.push({
        path: drift.relativePath,
        note: "Upstream removed this file; the fork still has it — operator decides.",
      });
    }
  }

  // Plan-level projection (authoritative: what the agent would do)
  for (const action of plan.actions) {
    const p = action.targetPath;
    if (isUntouchable(policy, p)) {
      skippedUntouchable.push({ path: p, note: "Untouchable per policy.untouchablePaths." });
      continue;
    }
    if (action.needsConfirmation) {
      needsConfirmation.push({
        path: p,
        note: action.confirmationReason ?? "Policy requires explicit confirmation.",
      });
      continue;
    }
    switch (action.actionType) {
      case "add_file":
        safeAdditions.push({ path: p, note: "Upstream scaffold absent from fork — safe to add." });
        break;
      case "update_package_json_deps":
        safeUpdates.push({ path: p, note: "Dependency merge (additive-only)." });
        break;
      case "patch_manifest":
        safeUpdates.push({ path: p, note: "kit.json alignment field patch (safe allow-list)." });
        break;
      case "skip_user_modified":
        skippedUserModified.push({ path: p, note: "Preserved — user has modified this file." });
        break;
      case "add_custom_skill":
        customSkills.push({ path: p, note: "User-authored custom skill — preserved unchanged." });
        break;
    }
  }

  // Package-drift projection
  for (const pd of report.packageDrifts) {
    const entry: PackageDriftEntry = {
      packageName: pd.packageName,
      fromVersion: pd.forkVersion,
      toVersion: pd.upstreamVersion,
      changeType: pd.changeType,
    };
    if (pd.changeType === "added") packageAdditions.push(entry);
    else if (pd.changeType === "updated") packageUpgrades.push(entry);
  }

  return {
    forkId: report.forkId,
    kitId: report.kitId,
    fromVersion: report.forkVersion,
    toVersion: report.upstreamVersion,
    severity: report.overallSeverity,
    buckets: {
      safeAdditions,
      safeUpdates,
      skippedUserModified,
      skippedUntouchable,
      needsConfirmation,
      customSkills,
      unresolvedUpstreamDeletion,
      packageAdditions,
      packageUpgrades,
    },
    packageDriftCount: report.packageDrifts.length,
    fileDriftCount: report.fileDrifts.length,
  };
}

export function summariseArtifactSummaryAsNarrative(
  summary: DriftArtifactSummary,
): string[] {
  const lines: string[] = [];
  const b = summary.buckets;
  lines.push(
    `Upstream moved from ${summary.fromVersion} to ${summary.toVersion} with overall severity ${summary.severity}.`,
  );
  if (b.safeAdditions.length)
    lines.push(`I can add ${b.safeAdditions.length} new upstream scaffold file(s) safely.`);
  if (b.safeUpdates.length)
    lines.push(`I can apply ${b.safeUpdates.length} safe manifest/dependency alignment(s).`);
  if (b.packageAdditions.length)
    lines.push(`I can merge ${b.packageAdditions.length} upstream dependency addition(s).`);
  if (b.packageUpgrades.length)
    lines.push(`${b.packageUpgrades.length} dependency upgrade(s) need review — additive-only by default.`);
  if (b.needsConfirmation.length)
    lines.push(
      `${b.needsConfirmation.length} action(s) require your explicit confirmation before applying.`,
    );
  if (b.skippedUserModified.length)
    lines.push(
      `${b.skippedUserModified.length} file(s) you modified are preserved and will not be touched.`,
    );
  if (b.skippedUntouchable.length)
    lines.push(
      `${b.skippedUntouchable.length} file(s) flagged untouchable by policy remain locked.`,
    );
  if (b.customSkills.length)
    lines.push(`${b.customSkills.length} custom skill(s) detected and preserved.`);
  if (b.unresolvedUpstreamDeletion.length)
    lines.push(
      `${b.unresolvedUpstreamDeletion.length} file(s) removed upstream remain in your fork — your call.`,
    );
  if (lines.length === 1) lines.push("Fork is clean — no actionable changes.");
  return lines;
}
