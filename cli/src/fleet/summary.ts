/**
 * Fleet summary builder — pure composition over existing primitives.
 * Never writes to disk. Never mutates the fork tree.
 */

import fs from "node:fs";
import { listKitForkRegistrations } from "../kits/fork-registry.js";
import { detectKitForkDrift } from "../kits/fork-sync.js";
import { readKitForkPolicy } from "../kits/fork-policy.js";
import { listKitForkSyncJobs } from "../kits/fork-sync-agent.js";
import { tailKitForkTrace } from "../kits/fork-trace.js";
import type {
  KitForkRegistration,
  KitForkDriftReport,
  KitDriftSeverity,
} from "../kits/fork-types.js";
import type { ForkHealthLevel, ForkSummary, FleetSummary } from "./types.js";

function classifyHealth(
  drift: KitForkDriftReport | null,
  pendingConfirmationJobs: number,
  lastJobStatus: string | undefined,
): ForkHealthLevel {
  if (!drift) return "unknown";
  if (pendingConfirmationJobs > 0) return "awaiting-confirmation";
  if (lastJobStatus === "failed") return "error";
  if (drift.overallSeverity === "critical" || drift.overallSeverity === "warning") {
    return "drift-major";
  }
  if (drift.overallSeverity === "info" || drift.hasUpstreamUpdate) return "drift-minor";
  return "clean";
}

const REMOTE_EVENT_TYPES = new Set([
  "remote_connected",
  "remote_pushed",
  "remote_pr_opened",
  "conflict_encountered",
]);

export function buildForkSummary(reg: KitForkRegistration): ForkSummary {
  // Missing fork directory → unknown, short-circuit with minimal detail.
  if (!fs.existsSync(reg.forkPath)) {
    return {
      forkId: reg.forkId,
      kitId: reg.kitId,
      label: reg.label,
      forkPath: reg.forkPath,
      baseVersion: reg.baseVersion,
      driftSeverity: "none",
      hasUpstreamUpdate: false,
      fileDriftCount: 0,
      packageDriftCount: 0,
      customSkillCount: 0,
      remoteSyncMode: "off",
      autoApprove: "additive",
      autoApproveDepUpdates: "additive",
      untouchableCount: 0,
      pendingConfirmationJobs: 0,
      health: "unknown",
    };
  }

  let drift: KitForkDriftReport | null = null;
  try {
    drift = detectKitForkDrift(reg);
  } catch {
    drift = null;
  }

  const policy = readKitForkPolicy(reg.forkPath);
  const jobs = listKitForkSyncJobs({ forkId: reg.forkId });
  const pendingConfirmationJobs = jobs.filter((j) => j.status === "awaiting_confirmation").length;
  const lastJob = jobs[jobs.length - 1];

  let lastRemoteEvent: ForkSummary["lastRemoteEvent"] = null;
  let lastRemoteEventAt: string | undefined;
  const traceTail = tailKitForkTrace(reg.forkPath, 200);
  for (let i = traceTail.length - 1; i >= 0; i -= 1) {
    const ev = traceTail[i];
    if (REMOTE_EVENT_TYPES.has(ev.type)) {
      lastRemoteEvent = ev.type as ForkSummary["lastRemoteEvent"];
      lastRemoteEventAt = ev.timestamp;
      break;
    }
  }

  return {
    forkId: reg.forkId,
    kitId: reg.kitId,
    label: reg.label,
    forkPath: reg.forkPath,
    baseVersion: reg.baseVersion,
    upstreamVersion: drift?.upstreamVersion,
    lastSyncedAt: reg.lastSyncedAt,
    driftSeverity: (drift?.overallSeverity ?? "none") as KitDriftSeverity,
    hasUpstreamUpdate: drift?.hasUpstreamUpdate ?? false,
    fileDriftCount: drift?.fileDrifts.length ?? 0,
    packageDriftCount: drift?.packageDrifts.length ?? 0,
    customSkillCount: drift?.customSkillsDetected.length ?? 0,
    remoteSyncMode: policy.remoteSyncMode,
    autoApprove: policy.autoApprove,
    autoApproveDepUpdates: policy.autoApproveDepUpdates,
    untouchableCount: policy.untouchablePaths.length,
    lastJob: lastJob
      ? {
          jobId: lastJob.jobId,
          status: lastJob.status,
          createdAt: lastJob.createdAt,
          completedAt: lastJob.completedAt,
          appliedCount: lastJob.healResult?.appliedCount,
          skippedCount: lastJob.healResult?.skippedCount,
          errorCount: lastJob.healResult?.errorCount,
        }
      : undefined,
    pendingConfirmationJobs,
    lastRemoteEvent,
    lastRemoteEventAt,
    remote: reg.remote
      ? {
          owner: reg.remote.owner,
          repo: reg.remote.repo,
          defaultBranch: reg.remote.defaultBranch,
          lastPushedAt: reg.remote.lastPushedAt,
          lastHealPr: reg.remote.lastHealPr,
        }
      : undefined,
    health: classifyHealth(drift, pendingConfirmationJobs, lastJob?.status),
  };
}

export function buildFleetSummary(): FleetSummary {
  const regs = listKitForkRegistrations();
  const forks = regs.map((r) => buildForkSummary(r));

  const byHealth: FleetSummary["byHealth"] = {
    clean: 0,
    "drift-minor": 0,
    "drift-major": 0,
    "awaiting-confirmation": 0,
    error: 0,
    unknown: 0,
  };
  const bySeverity: FleetSummary["bySeverity"] = {
    none: 0,
    info: 0,
    warning: 0,
    critical: 0,
  };
  const byKit: FleetSummary["byKit"] = {};
  let forksWithRemote = 0;
  let forksAwaitingConfirmation = 0;
  let pendingApprovalCount = 0;

  for (const f of forks) {
    byHealth[f.health] += 1;
    bySeverity[f.driftSeverity] += 1;
    byKit[f.kitId] = (byKit[f.kitId] ?? 0) + 1;
    if (f.remote) forksWithRemote += 1;
    if (f.pendingConfirmationJobs > 0) forksAwaitingConfirmation += 1;
    pendingApprovalCount += f.pendingConfirmationJobs;
  }

  return {
    generatedAt: new Date().toISOString(),
    totalForks: forks.length,
    byHealth,
    bySeverity,
    byKit,
    forksWithRemote,
    forksAwaitingConfirmation,
    pendingApprovalCount,
    forks,
  };
}
