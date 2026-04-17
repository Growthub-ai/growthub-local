/**
 * Discovery-UX adapter for the Source Import Agent.
 *
 * Invoked from the Settings → Custom Workspace Starter submenu. Runs the
 * interactive double-confirmation flow:
 *
 *   1. Resolve the source (github-repo or skills-skill).
 *   2. Foreground the job until it parks (`awaiting_confirmation`) or
 *      completes.
 *   3. If parked, render the security + plan summary, prompt for TWO
 *      operator confirmations, and call `confirmAndResumeSourceImportJob`.
 *   4. Render the final summary.
 */

import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  confirmAndResumeSourceImportJob,
  importSourceAsWorkspace,
} from "../starter/source-import/index.js";
import type {
  SourceImportInput,
  SourceImportJob,
  SourceImportResult,
} from "../starter/source-import/index.js";

export interface StartSourceImportFlowGithub {
  kind: "github-repo";
  repo: string;
  out: string;
}

export interface StartSourceImportFlowSkill {
  kind: "skills-skill";
  skillRef: string;
  out: string;
}

export type StartSourceImportFlowInput =
  | StartSourceImportFlowGithub
  | StartSourceImportFlowSkill;

function renderSuccess(result: SourceImportResult, jobId: string): void {
  const sourceLine =
    result.source.kind === "github-repo"
      ? `${result.source.repo.owner}/${result.source.repo.repo}`
      : `${result.source.skillId}@${result.source.version}`;
  p.outro(
    `Imported ${sourceLine} into ${pc.cyan(result.forkPath)}\n` +
      `  jobId:       ${pc.cyan(jobId)}\n` +
      `  forkId:      ${pc.cyan(result.forkId)}\n` +
      `  risk:        ${result.security.riskClass} (${result.security.findings.length} findings)\n` +
      `  detection:   framework=${result.detection.framework} pm=${result.detection.packageManager}\n` +
      `  summary:     ${pc.dim(result.summaryPath)}\n` +
      `  manifest:    ${pc.dim(result.manifestPath)}`,
  );
}

async function confirmTwice(
  job: SourceImportJob,
): Promise<string[] | null> {
  const pending = job.pendingConfirmations ?? [];
  if (pending.length === 0) return [];
  const sec = job.plan?.security;
  if (sec) {
    p.log.warn(`Security report — risk: ${sec.riskClass}`);
    for (const line of sec.summaryLines.slice(0, 6)) {
      p.log.message(`  ${line}`);
    }
    if (sec.blocked) {
      p.log.error("Security inspection BLOCKED this payload — import cannot continue.");
      return null;
    }
  }
  p.log.info(`Pending confirmations: ${pending.join(", ")}`);

  const ack = await p.confirm({
    message: "Acknowledge the security report?",
    initialValue: false,
  });
  if (p.isCancel(ack) || ack !== true) return null;

  const go = await p.confirm({
    message: "Second confirmation — materialize the workspace now?",
    initialValue: false,
  });
  if (p.isCancel(go) || go !== true) return null;
  return pending;
}

export async function startSourceImportFlow(
  input: StartSourceImportFlowInput,
): Promise<void> {
  const importInput: SourceImportInput =
    input.kind === "github-repo"
      ? {
          source: { kind: "github-repo", repo: input.repo },
          out: input.out,
          importMode: "wrap",
          onProgress: (step) => p.log.step(step),
        }
      : {
          source: { kind: "skills-skill", skillRef: input.skillRef },
          out: input.out,
          importMode: "wrap",
          onProgress: (step) => p.log.step(step),
        };

  try {
    const { job, result } = await importSourceAsWorkspace(importInput);

    if (job.status === "completed" && result) {
      renderSuccess(result, job.jobId);
      return;
    }

    if (job.status === "failed") {
      p.log.error(job.error ?? "Source import failed.");
      return;
    }

    if (job.status !== "awaiting_confirmation") {
      p.log.warn(`Unexpected job status: ${job.status}`);
      return;
    }

    const acked = await confirmTwice(job);
    if (!acked) {
      p.log.warn("Import aborted — confirmations not provided.");
      return;
    }

    const resumed = await confirmAndResumeSourceImportJob({
      jobId: job.jobId,
      confirmations: acked,
      onProgress: (step) => p.log.step(step),
    });

    if (!resumed || resumed.status !== "completed" || !resumed.result) {
      p.log.error(resumed?.error ?? "Import did not complete after confirmation.");
      return;
    }

    renderSuccess(resumed.result, resumed.jobId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(msg);
  }
}
