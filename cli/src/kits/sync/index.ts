/**
 * Fork Sync — public barrel.
 *
 * Exports the sync surface consumed by the CLI command layer and by tests.
 * Downstream consumers should import from this path only — the internal
 * module split (service/drift/merger/types) is not part of the stable
 * contract.
 */

export type {
  DriftEntry,
  DriftSummary,
  FileClassification,
  ForkRegistry,
  ForkRegistryRecord,
  JobState,
  JobStatus,
  MergeAction,
} from "./types.js";

export {
  buildTreeSnapshot,
  classifyFile,
  computeDriftSummary,
  type TreeSnapshot,
} from "./drift.js";

export {
  mergePackageJson,
  type PackageJsonMergeResult,
  type PackageJsonMergeTrace,
} from "./merger.js";

export {
  executeSyncJob,
  getJobStatus,
  initForkSync,
  listJobs,
  listRegisteredForks,
  planForkSync,
  readJobReport,
  resolveRegistryPath,
  resolveSyncRoot,
  startSyncJob,
  type InitForkSyncInput,
  type InitForkSyncResult,
  type PlanForkSyncResult,
  type StartForkSyncInput,
  type StartForkSyncResult,
} from "./service.js";
