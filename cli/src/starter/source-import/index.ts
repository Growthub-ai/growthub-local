/**
 * Source Import Agent — public module surface.
 *
 * The canonical entrypoint for the Portable Source → Agent Environment
 * Pipeline. Re-exports the types, source adapters, shared security
 * inspector, planner, materializer, and background runner so every
 * caller (CLI commands, discovery UX, test suites) imports from a
 * single location.
 */

export * from "./types.js";

export {
  probeGithubRepoSource,
  resolveGithubCloneToken,
  cloneGithubRepo,
  narrowToSubdirectory,
} from "./github-source.js";

export {
  browseSkills,
  probeSkillsSource,
  fetchSkillPayload,
  parseSkillRef,
} from "./skills-source.js";

export { detectSourceShape } from "./detect.js";
export { inspectSourcePayload } from "./security.js";
export { buildSourceImportPlan, pendingConfirmations } from "./plan.js";
export { materializeImportPlan, PendingConfirmationError } from "./materialize.js";
export { writeImportSummary } from "./summarize.js";

export {
  runSourceImportJob,
  confirmAndResumeSourceImportJob,
  dispatchSourceImportJobBackground,
  getSourceImportJob,
  listSourceImportJobs,
  cancelSourceImportJob,
  pruneSourceImportJobs,
} from "./agent.js";

import type { SourceImportInput, SourceImportJob, SourceImportResult } from "./types.js";
import { runSourceImportJob } from "./agent.js";

/**
 * One-shot foreground entrypoint used by the CLI and discovery UX.
 * Delegates to the background-capable runner but waits for terminal
 * status before returning. When the job parks on confirmation, the
 * returned job has `status === "awaiting_confirmation"` and the caller
 * is responsible for prompting + calling `confirmAndResumeSourceImportJob`.
 */
export async function importSourceAsWorkspace(
  input: SourceImportInput,
): Promise<{ job: SourceImportJob; result?: SourceImportResult }> {
  const job = await runSourceImportJob(input);
  return { job, result: job.result };
}
