/**
 * Source Import Agent — deterministic plan builder.
 *
 * Pure function: takes a union source probe, an optional detection report,
 * an optional security report, and operator options — emits a
 * `SourceImportPlan` with an ordered list of actions the materializer
 * will execute.
 *
 * The plan shape mirrors the Fork Sync Agent's heal plan: fully structured,
 * traceable, and explicit about which actions require operator
 * confirmation. Two mandatory confirmation surfaces:
 *
 *   1. `inspect_security` for every skill import, and for any repo import
 *      with a non-safe risk class.
 *   2. `materialize_starter_shell` for non-empty destinations (agent
 *      refuses silent overwrites).
 */

import fs from "node:fs";
import path from "node:path";
import type {
  ImportPlanAction,
  SourceAccessProbe,
  SourceDetectionReport,
  SourceImportMode,
  SourceImportPlan,
  SourceSecurityReport,
} from "./types.js";

export interface BuildSourceImportPlanInput {
  probe: SourceAccessProbe;
  destination: string;
  starterKitId: string;
  importMode: SourceImportMode;
  /** Shape detection (optional — produced post-fetch by the agent). */
  detection?: SourceDetectionReport;
  /** Security inspection report (required for skill imports at execution time). */
  security?: SourceSecurityReport;
}

function generateImportId(): string {
  return `si-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function destinationState(absDest: string): {
  exists: boolean;
  nonEmpty: boolean;
} {
  if (!fs.existsSync(absDest)) return { exists: false, nonEmpty: false };
  const stats = fs.statSync(absDest);
  if (!stats.isDirectory()) {
    throw new Error(`Destination is not a directory: ${absDest}`);
  }
  const entries = fs.readdirSync(absDest);
  return { exists: true, nonEmpty: entries.length > 0 };
}

function describeSource(probe: SourceAccessProbe): string {
  if (probe.kind === "github-repo") {
    return `${probe.repo.owner}/${probe.repo.repo} via ${probe.mode} auth`;
  }
  return `skill ${probe.skillId}@${probe.version} (skills.sh)`;
}

/**
 * Build a deterministic import plan. No side effects besides a `fs.statSync`
 * on the destination directory.
 */
export function buildSourceImportPlan(
  input: BuildSourceImportPlanInput,
): SourceImportPlan {
  const absDest = path.resolve(input.destination);
  const state = destinationState(absDest);
  const payloadPath = "imported";
  const warnings: string[] = [...input.probe.warnings];
  if (input.detection) warnings.push(...input.detection.warnings);

  if (state.nonEmpty) {
    warnings.push(
      `Destination ${absDest} is not empty — import requires operator confirmation.`,
    );
  }

  const isSkill = input.probe.kind === "skills-skill";
  const securityNeedsConfirmation =
    isSkill ||
    (input.security !== undefined && input.security.riskClass !== "safe");

  const actions: ImportPlanAction[] = [];

  actions.push({
    actionType: "fetch_source",
    targetPath: ".source-staging",
    description: `Fetch ${describeSource(input.probe)}`,
    detail:
      input.probe.kind === "github-repo"
        ? {
            repo: input.probe.repo,
            defaultBranch: input.probe.defaultBranch,
            accessMode: input.probe.mode,
            cloneUrl: input.probe.cloneUrl,
          }
        : {
            skillId: input.probe.skillId,
            version: input.probe.version,
            author: input.probe.author,
            title: input.probe.title,
          },
  });

  actions.push({
    actionType: "inspect_security",
    targetPath: ".source-staging",
    description: "Run shared security inspection over the fetched payload",
    detail: {
      sourceKind: input.probe.kind,
      riskClass: input.security?.riskClass,
      blocked: input.security?.blocked ?? false,
    },
    needsConfirmation: securityNeedsConfirmation,
    confirmationLabel: "security-report",
  });

  actions.push({
    actionType: "materialize_starter_shell",
    targetPath: ".",
    description: `Materialize starter kit ${input.starterKitId} into destination`,
    detail: { kitId: input.starterKitId },
    needsConfirmation: state.nonEmpty,
    confirmationLabel: state.nonEmpty ? "non-empty-destination" : undefined,
  });

  actions.push({
    actionType: "place_imported_payload",
    targetPath: payloadPath,
    description: `Place imported payload under ${payloadPath}/ (mode=${input.importMode})`,
    detail: {
      importMode: input.importMode,
      payloadRelativePath: payloadPath,
    },
  });

  actions.push({
    actionType: "write_import_manifest",
    targetPath: ".growthub-fork/source-import.json",
    description: "Write canonical in-fork import manifest",
    detail: {
      payloadRelativePath: payloadPath,
      sourceKind: input.probe.kind,
    },
  });

  actions.push({
    actionType: "register_fork",
    targetPath: ".growthub-fork/fork.json",
    description: "Register imported workspace as a Growthub kit-fork",
    detail: { kitId: input.starterKitId },
  });

  actions.push({
    actionType: "seed_policy",
    targetPath: ".growthub-fork/policy.json",
    description: "Seed fork-sync policy with the requested remote-sync mode",
  });

  actions.push({
    actionType: "seed_trace",
    targetPath: ".growthub-fork/trace.jsonl",
    description: "Append initial trace events for registration + import",
  });

  actions.push({
    actionType: "summarize",
    targetPath: "IMPORT_SUMMARY.md",
    description: "Write operator-visible import summary",
  });

  return {
    importId: generateImportId(),
    source: input.probe,
    destination: {
      forkPath: absDest,
      starterKitId: input.starterKitId,
      importMode: input.importMode,
    },
    detection: input.detection,
    security: input.security,
    actions,
    generatedAt: new Date().toISOString(),
    warnings,
  };
}

/**
 * Return the list of target paths in a plan that require explicit operator
 * confirmation before the agent will execute them.
 */
export function pendingConfirmations(plan: SourceImportPlan): string[] {
  return plan.actions
    .filter((a) => a.needsConfirmation)
    .map((a) => a.targetPath);
}
