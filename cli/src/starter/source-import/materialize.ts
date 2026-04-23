/**
 * Source Import Agent — materializer.
 *
 * Executes a `SourceImportPlan`. Composes already-shipping primitives:
 *
 *   - `copyBundledKitSource`      (kits/service)
 *   - `registerKitFork`           (kits/fork-registry)
 *   - `writeKitForkPolicy`        (kits/fork-policy)
 *   - `appendKitForkTraceEvent`   (kits/fork-trace)
 *
 * Plus two source-specific fetch surfaces:
 *
 *   - `cloneGithubRepo` + `narrowToSubdirectory` (github-source)
 *   - `fetchSkillPayload`                        (skills-source)
 *
 * The materializer never runs a skill script, never executes an imported
 * shell command, and never opens a network port. Its job is to place the
 * fetched payload into the starter shell and write the canonical manifest,
 * policy, and trace entries.
 *
 * Confirmation gating:
 *   - If the plan has pending confirmations that the caller has not
 *     acknowledged, the materializer throws and the agent parks the job.
 *   - If the security report is `blocked`, the materializer refuses even
 *     when the caller passes confirmations.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { copyBundledKitSource } from "../../kits/service.js";
import { registerKitFork } from "../../kits/fork-registry.js";
import {
  makeDefaultKitForkPolicy,
  writeKitForkPolicy,
} from "../../kits/fork-policy.js";
import { appendKitForkTraceEvent } from "../../kits/fork-trace.js";
import {
  cloneGithubRepo,
  narrowToSubdirectory,
  resolveGithubCloneToken,
} from "./github-source.js";
import { fetchSkillPayload } from "./skills-source.js";
import { detectSourceShape } from "./detect.js";
import { inspectSourcePayload } from "./security.js";
import { writeImportSummary } from "./summarize.js";
import { scaffoldSessionMemory } from "../scaffold-session-memory.js";
import type {
  GithubRepoAccessProbe,
  SkillsSkillAccessProbe,
  SourceAccessProbe,
  SourceImportManifest,
  SourceImportPlan,
  SourceImportResult,
  SourceKind,
} from "./types.js";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface MaterializeInput {
  plan: SourceImportPlan;
  /**
   * Operator-supplied confirmations (by `targetPath`) for actions the plan
   * flagged as needing confirmation.
   */
  confirmations?: string[];
  /**
   * Remote-sync mode seeded into policy. Defaults to "off".
   */
  remoteSyncMode?: "off" | "branch" | "pr";
  /** Human label for the registered fork. */
  label?: string;
  /** Progress callback. */
  onProgress?: (step: string) => void;
  /**
   * Optional subdirectory filter for github-repo sources. Mirrored into the
   * manifest detail.
   */
  subdirectory?: string;
  /** Optional explicit branch override for github-repo sources. */
  branch?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MANIFEST_RELATIVE_PATH = ".growthub-fork/source-import.json";
const SUMMARY_RELATIVE_PATH = "IMPORT_SUMMARY.md";

function resolveSourceKind(probe: SourceAccessProbe): SourceKind {
  return probe.kind === "github-repo" ? "github-repo" : "skills-skill";
}

function stagingDirFor(forkPath: string): string {
  return path.join(
    os.tmpdir(),
    `growthub-source-import-${path.basename(forkPath)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
}

async function fetchPayload(
  probe: SourceAccessProbe,
  stagingDir: string,
  opts: { subdirectory?: string; branch?: string; onProgress?: (step: string) => void },
): Promise<{ payloadRoot: string; gitSha?: string }> {
  if (probe.kind === "github-repo") {
    const ghProbe = probe as GithubRepoAccessProbe;
    const token = await resolveGithubCloneToken(ghProbe);
    opts.onProgress?.(
      `[source-import] cloning ${ghProbe.repo.owner}/${ghProbe.repo.repo}` +
        `@${opts.branch ?? ghProbe.defaultBranch} via ${ghProbe.mode}`,
    );
    const cloneRes = cloneGithubRepo({
      probe: ghProbe,
      branch: opts.branch,
      destination: stagingDir,
      token: token?.token,
    });
    if (opts.subdirectory) {
      opts.onProgress?.(
        `[source-import] narrowing clone to subdirectory '${opts.subdirectory}'`,
      );
      narrowToSubdirectory(stagingDir, opts.subdirectory);
    }
    return { payloadRoot: stagingDir, gitSha: cloneRes.sha };
  }

  const skillProbe = probe as SkillsSkillAccessProbe;
  opts.onProgress?.(
    `[source-import] fetching skill ${skillProbe.skillId}@${skillProbe.version}`,
  );
  await fetchSkillPayload({ probe: skillProbe, destination: stagingDir });
  return { payloadRoot: stagingDir };
}

function movePayloadIntoFork(
  payloadRoot: string,
  forkPath: string,
  payloadRelativePath: string,
): string {
  const target = path.resolve(forkPath, payloadRelativePath);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(payloadRoot, target);
  return target;
}

function writeManifest(
  forkPath: string,
  manifest: SourceImportManifest,
): string {
  const p = path.resolve(forkPath, MANIFEST_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return p;
}

function assertConfirmationsSatisfied(
  plan: SourceImportPlan,
  confirmations: string[],
): void {
  const confirmed = new Set(confirmations);
  const pending = plan.actions
    .filter((a) => {
      if (!a.needsConfirmation) return false;
      const token = a.confirmationLabel ?? a.targetPath;
      return !confirmed.has(token);
    })
    .map((a) => a.confirmationLabel ?? a.targetPath);
  if (pending.length > 0) {
    throw new PendingConfirmationError(pending);
  }
}

export class PendingConfirmationError extends Error {
  readonly pending: string[];
  constructor(pending: string[]) {
    super(
      `Import plan has ${pending.length} action(s) awaiting confirmation: ${pending.join(", ")}`,
    );
    this.name = "PendingConfirmationError";
    this.pending = pending;
  }
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

/**
 * Execute a `SourceImportPlan` end-to-end. Returns the final
 * `SourceImportResult`. Throws `PendingConfirmationError` when the plan
 * has unsatisfied confirmations.
 */
export async function materializeImportPlan(
  input: MaterializeInput,
): Promise<SourceImportResult> {
  const { plan } = input;
  const onProgress = input.onProgress;
  const remoteSyncMode = input.remoteSyncMode ?? "off";

  // 0. Hard block: security report with `blocked: true` cannot be confirmed away.
  if (plan.security?.blocked) {
    throw new Error(
      `Refusing to import: security inspection blocked the payload (${plan.security.summaryLines[0] ?? "blocking finding"})`,
    );
  }

  assertConfirmationsSatisfied(plan, input.confirmations ?? []);

  const forkPath = plan.destination.forkPath;
  const kitId = plan.destination.starterKitId;
  const sourceKind = resolveSourceKind(plan.source);

  // 1. Fetch payload into a staging directory.
  onProgress?.("[source-import] fetching payload into staging directory");
  const stagingDir = stagingDirFor(forkPath);
  const fetchResult = await fetchPayload(plan.source, stagingDir, {
    subdirectory: input.subdirectory,
    branch: input.branch,
    onProgress,
  });

  // 2. Security inspection (mandatory — plan may already carry a report,
  //    but we always re-run against the materialised payload to catch any
  //    mismatch between manifest-advertised files and fetched files).
  onProgress?.("[source-import] running security inspection over fetched payload");
  const security = inspectSourcePayload({
    payloadRoot: fetchResult.payloadRoot,
    requireSkillAcknowledgement: sourceKind === "skills-skill",
  });
  if (security.blocked) {
    fs.rmSync(fetchResult.payloadRoot, { recursive: true, force: true });
    throw new Error(
      `Security inspection blocked the fetched payload: ${security.summaryLines[0] ?? "blocking finding"}`,
    );
  }

  // 3. Shape detection.
  onProgress?.("[source-import] detecting payload shape");
  const detection = detectSourceShape(fetchResult.payloadRoot);

  // 4. Materialize starter shell. `copyBundledKitSource` wipes+rewrites the
  //    destination, so we run it BEFORE moving the payload into place.
  onProgress?.(`[source-import] materializing starter kit ${kitId}`);
  const kitInfo = copyBundledKitSource(kitId, forkPath);

  // 5. Move staged payload into `<forkPath>/imported/`.
  onProgress?.(`[source-import] placing payload at ${forkPath}/imported/`);
  movePayloadIntoFork(fetchResult.payloadRoot, forkPath, "imported");

  // 6. Register as a kit-fork.
  const reg = registerKitFork({
    forkPath,
    kitId: kitInfo.id,
    baseVersion: kitInfo.version,
    label:
      input.label ??
      (plan.source.kind === "github-repo"
        ? `${plan.source.repo.owner}/${plan.source.repo.repo}`
        : plan.source.title),
  });

  // 7. Seed policy.
  const policy = {
    ...makeDefaultKitForkPolicy(),
    remoteSyncMode,
  };
  writeKitForkPolicy(forkPath, policy);

  // 8. Build + write canonical in-fork manifest.
  const summaryLines: string[] = [];
  summaryLines.push(
    plan.source.kind === "github-repo"
      ? `Imported GitHub repo ${plan.source.repo.owner}/${plan.source.repo.repo}`
      : `Imported skills.sh skill ${plan.source.skillId}@${plan.source.version}`,
  );
  summaryLines.push(`Detection: framework=${detection.framework}, pm=${detection.packageManager}, confidence=${detection.confidence}`);
  summaryLines.push(`Security: ${security.summaryLines[0] ?? "no findings"}`);
  summaryLines.push(`Fork ID: ${reg.forkId}`);
  summaryLines.push(`Policy: remoteSyncMode=${policy.remoteSyncMode}`);

  const manifest: SourceImportManifest = {
    version: 1,
    importId: plan.importId,
    sourceKind,
    source: plan.source,
    importMode: plan.destination.importMode,
    starterKitId: kitInfo.id,
    starterKitVersion: kitInfo.version,
    importedAt: new Date().toISOString(),
    detection,
    security,
    payloadRelativePath: "imported",
    payloadGitSha: fetchResult.gitSha,
    summary: summaryLines,
  };
  const manifestPath = writeManifest(forkPath, manifest);

  // 9. Append initial trace events (reuse existing event types — no new
  //    event schema introduced).
  appendKitForkTraceEvent(forkPath, {
    forkId: reg.forkId,
    kitId: reg.kitId,
    type: "registered",
    summary: `Source-imported workspace registered (importId=${plan.importId})`,
    detail: {
      sourceKind,
      importMode: plan.destination.importMode,
      accessMode: plan.source.mode,
    },
  });
  appendKitForkTraceEvent(forkPath, {
    forkId: reg.forkId,
    kitId: reg.kitId,
    type: "policy_updated",
    summary: `Initial policy seeded (remoteSyncMode=${policy.remoteSyncMode})`,
  });
  appendKitForkTraceEvent(forkPath, {
    forkId: reg.forkId,
    kitId: reg.kitId,
    type: "agent_checkpoint",
    summary: `source-import/security riskClass=${security.riskClass}, findings=${security.findings.length}`,
    detail: { riskClass: security.riskClass, findings: security.findings.length },
  });
  if (plan.source.kind === "github-repo" && fetchResult.gitSha) {
    appendKitForkTraceEvent(forkPath, {
      forkId: reg.forkId,
      kitId: reg.kitId,
      type: "agent_checkpoint",
      summary: `source-import/payload gitSha=${fetchResult.gitSha}`,
      detail: { gitSha: fetchResult.gitSha },
    });
  }

  // 9a. Seed session memory (.growthub-fork/project.md) from the kit's
  //     templates/project.md — primitive #3. Tags the seed with the source
  //     kind + ref so agents returning to the fork know where the payload
  //     originated. No-op on older kits that do not ship the template.
  const sessionSeed = scaffoldSessionMemory({
    forkPath,
    kitId: kitInfo.id,
    forkId: reg.forkId,
    source: sourceKind,
    sourceRef:
      plan.source.kind === "github-repo"
        ? `${plan.source.repo.owner}/${plan.source.repo.repo}${fetchResult.gitSha ? `@${fetchResult.gitSha.slice(0, 7)}` : ""}`
        : `${plan.source.skillId}@${plan.source.version}`,
  });
  if (sessionSeed.written) {
    appendKitForkTraceEvent(forkPath, {
      forkId: reg.forkId,
      kitId: reg.kitId,
      type: "skills_scaffolded",
      summary: "Seeded .growthub-fork/project.md from templates/project.md",
      detail: { projectMd: sessionSeed.projectMdPath },
    });
  }

  // 10. Write operator-facing summary.
  const summaryPath = writeImportSummary({
    forkPath,
    summaryRelativePath: SUMMARY_RELATIVE_PATH,
    manifest,
  });

  return {
    importId: plan.importId,
    forkId: reg.forkId,
    kitId: kitInfo.id,
    forkPath,
    baseVersion: kitInfo.version,
    sourceKind,
    source: plan.source,
    importMode: plan.destination.importMode,
    payloadRelativePath: "imported",
    detection,
    security,
    summaryPath,
    manifestPath,
    policyMode: policy.remoteSyncMode,
    warnings: [...plan.warnings, ...detection.warnings],
  };
}
