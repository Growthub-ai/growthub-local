/**
 * Fork Sync — drift computation.
 *
 * Given three trees (baseline, upstream, fork) represented as
 * path→content-hash maps plus the frozen-asset path set, classify every file
 * and decide a safe merge action. This is pure, deterministic, side-effect
 * free, and fully unit-testable.
 */

import type { DriftEntry, DriftSummary, FileClassification, MergeAction } from "./types.js";

export interface TreeSnapshot {
  hashes: Map<string, string>;
  paths: Set<string>;
}

export function buildTreeSnapshot(entries: Array<{ path: string; hash: string }>): TreeSnapshot {
  const hashes = new Map<string, string>();
  const paths = new Set<string>();
  for (const entry of entries) {
    hashes.set(entry.path, entry.hash);
    paths.add(entry.path);
  }
  return { hashes, paths };
}

export function classifyFile(
  path: string,
  baseline: TreeSnapshot,
  upstream: TreeSnapshot,
  fork: TreeSnapshot,
): FileClassification {
  const inBase = baseline.paths.has(path);
  const inUp = upstream.paths.has(path);
  const inFork = fork.paths.has(path);

  if (!inFork && inUp && !inBase) return "upstream-only";
  if (inFork && !inUp && !inBase) return "local-only";
  if (!inUp && inBase) return "upstream-removed";

  const baseHash = baseline.hashes.get(path);
  const upHash = upstream.hashes.get(path);
  const forkHash = fork.hashes.get(path);

  if (upHash === forkHash) return "unchanged";

  const upstreamChanged = upHash !== baseHash;
  const localChanged = forkHash !== baseHash;

  if (upstreamChanged && !localChanged) return "upstream-modified";
  if (!upstreamChanged && localChanged) return "local-modified";
  return "both-modified";
}

function decideAction(
  classification: FileClassification,
  path: string,
  frozenPaths: Set<string>,
): { action: MergeAction; reason: string } {
  const frozen = frozenPaths.has(path);
  const isPackageJson = path === "package.json" || path.endsWith("/package.json");

  switch (classification) {
    case "unchanged":
      return { action: "noop", reason: "file unchanged across baseline, upstream, and fork" };
    case "upstream-only":
      return { action: "apply-upstream", reason: "new file introduced upstream" };
    case "local-only":
      return { action: "preserve-local", reason: "file exists only in fork (user customization)" };
    case "upstream-modified":
      return { action: "apply-upstream", reason: "safe fast-forward — only upstream changed" };
    case "local-modified":
      return { action: "preserve-local", reason: "only the fork changed — keep local customization" };
    case "upstream-removed":
      if (frozen) return { action: "skip-frozen-conflict", reason: "upstream removed a frozen asset — holding" };
      return { action: "preserve-local", reason: "upstream removed file — keeping local copy" };
    case "both-modified":
      if (isPackageJson) return { action: "merge-package-json", reason: "package.json modified on both sides — structured merge" };
      if (frozen) return { action: "skip-frozen-conflict", reason: "frozen asset conflicts — must be reviewed before overwriting" };
      return { action: "escalate-review", reason: "both sides modified this file — escalate to human review" };
  }
}

export function computeDriftSummary(input: {
  kitId: string;
  forkId: string;
  baseline: TreeSnapshot;
  upstream: TreeSnapshot;
  fork: TreeSnapshot;
  baselineVersion: string;
  upstreamVersion: string;
  frozenPaths: string[];
}): DriftSummary {
  const frozen = new Set(input.frozenPaths);
  const allPaths = new Set<string>([
    ...input.baseline.paths,
    ...input.upstream.paths,
    ...input.fork.paths,
  ]);

  const entries: DriftEntry[] = [];
  let unchanged = 0;
  let applyUpstream = 0;
  let preserveLocal = 0;
  let mergePackageJson = 0;
  let escalateReview = 0;
  let frozenConflicts = 0;

  for (const path of [...allPaths].sort()) {
    const classification = classifyFile(path, input.baseline, input.upstream, input.fork);
    const { action, reason } = decideAction(classification, path, frozen);
    entries.push({
      path,
      classification,
      action,
      frozen: frozen.has(path),
      reason,
    });

    switch (action) {
      case "noop": unchanged += 1; break;
      case "apply-upstream": applyUpstream += 1; break;
      case "preserve-local": preserveLocal += 1; break;
      case "merge-package-json": mergePackageJson += 1; break;
      case "escalate-review": escalateReview += 1; break;
      case "skip-frozen-conflict": frozenConflicts += 1; break;
    }
  }

  return {
    kitId: input.kitId,
    forkId: input.forkId,
    baselineVersion: input.baselineVersion,
    upstreamVersion: input.upstreamVersion,
    totals: {
      unchanged,
      applyUpstream,
      preserveLocal,
      mergePackageJson,
      escalateReview,
      frozenConflicts,
    },
    entries,
    generatedAt: new Date().toISOString(),
  };
}
