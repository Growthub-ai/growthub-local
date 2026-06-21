/**
 * Server Scheduler Write V1 — the single, confined, gated fs write for
 * scheduler-provider artifacts. Used by POST /api/workspace/scheduler/provision.
 * Server-only. Mirrors lib/server-resolver-write.js exactly.
 *
 * AWaC topology: writes only in filesystem mode; read-only runtimes throw a
 * coded error with guidance (the same 409 contract the rest of the workspace
 * uses). Path is confined to lib/adapters/integrations/schedulers — never
 * escapes. Never logs file contents.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { describePersistenceMode } from "@/lib/workspace-config";
import { resolveSchedulerFilePath, normalizeProvider } from "@/lib/workspace-scheduler-proposal";

const MAX_SCHEDULER_SIZE = 256 * 1024;

/**
 * Write a scheduler artifact from a validated proposal. Returns
 * { saved:true, path, filename } or throws a coded error:
 *   - WORKSPACE_PERSISTENCE_READ_ONLY (read-only runtime; carries guidance)
 *   - INVALID_SCHEDULER_WRITE (bad path / code)
 *   - WORKSPACE_PERSISTENCE_PATH_REFUSED (escaped the scheduler dir)
 */
async function writeSchedulerProposalFile(proposal) {
  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    const error = new Error(persistence.reason || "scheduler write requires a writable filesystem runtime");
    error.code = "WORKSPACE_PERSISTENCE_READ_ONLY";
    error.guidance = persistence.guidance || "Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true or use local development mode.";
    throw error;
  }
  const provider = normalizeProvider(proposal?.payload?.provider || proposal?.scheduleSpec?.provider);
  const target = (proposal?.target && proposal.target.ok)
    ? proposal.target
    : resolveSchedulerFilePath(proposal?.payload?.integrationId, provider);
  if (!target || !target.ok) {
    const error = new Error(target?.error || "invalid scheduler target path");
    error.code = "INVALID_SCHEDULER_WRITE";
    throw error;
  }
  const code = String(proposal?.code || "");
  if (!code.trim()) {
    const error = new Error("scheduler code is empty");
    error.code = "INVALID_SCHEDULER_WRITE";
    throw error;
  }
  if (Buffer.byteLength(code, "utf8") > MAX_SCHEDULER_SIZE) {
    const error = new Error(`scheduler file must be smaller than ${MAX_SCHEDULER_SIZE / 1024} KB`);
    error.code = "INVALID_SCHEDULER_WRITE";
    throw error;
  }

  const schedulersDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), target.dir);
  const outPath = path.join(schedulersDir, target.filename);
  if (path.dirname(outPath) !== schedulersDir) {
    const error = new Error("invalid filename — path traversal not allowed");
    error.code = "WORKSPACE_PERSISTENCE_PATH_REFUSED";
    throw error;
  }

  await fs.mkdir(schedulersDir, { recursive: true });
  await fs.writeFile(outPath, code, "utf8");
  return { saved: true, path: target.path, filename: target.filename };
}

export { writeSchedulerProposalFile };
