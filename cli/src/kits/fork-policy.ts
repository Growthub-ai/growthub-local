/**
 * Kit Fork Policy
 *
 * Per-fork user preferences that drive the Self-Healing agent's behaviour.
 *
 * Canonical location (in-fork, kernel-packet-style):
 *   <forkPath>/.growthub-fork/policy.json
 *
 * Every agent action — drift detection, heal plan build, remote push — reads
 * this policy and MUST honour it. The policy is authoritative. If the file is
 * absent a conservative default is used (require confirmation for every
 * non-additive change).
 */

import fs from "node:fs";
import path from "node:path";
import { resolveInForkStateDir } from "../config/kit-forks-home.js";

export type PolicyAutoApprove = "none" | "additive" | "all";

export interface KitForkPolicy {
  version: 1;

  /**
   * Paths (glob-lite — leading/trailing slashes ignored) the agent is never
   * allowed to touch. Stronger than USER_PROTECTED_PATTERNS: this is the
   * user's personal invariant list.
   */
  untouchablePaths: string[];

  /**
   * Paths the agent may only modify after explicit user confirmation per run.
   * The CLI prompts interactively; async jobs pause and surface a "needs
   * confirmation" state.
   */
  confirmBeforeChange: string[];

  /**
   * How aggressively to auto-approve heal actions.
   *   - "none":     every action requires confirmation (safest)
   *   - "additive": adding files and additive dep merges auto-approve;
   *                 modifications still require confirmation (default)
   *   - "all":      all safe actions auto-approve (still honours
   *                 untouchablePaths + skip_user_modified)
   */
  autoApprove: PolicyAutoApprove;

  /**
   * Controls dependency update confirmation specifically.
   *   - "none":     never auto-approve dep changes
   *   - "additive": new dep additions auto-approve, upgrades need confirm
   *   - "all":      even upgrades auto-approve (still additive-only, never
   *                 removes user deps)
   */
  autoApproveDepUpdates: PolicyAutoApprove;

  /**
   * Remote sync behaviour.
   *   - "off":    purely local fork, no remote interaction
   *   - "branch": push heal commits to a dedicated branch on the remote
   *   - "pr":     push branch + open a pull request via the GitHub client
   */
  remoteSyncMode: "off" | "branch" | "pr";

  /**
   * When true, conflicts during remote sync pause the job and surface to the
   * user for negotiation; otherwise the job fails fast and leaves local work
   * intact.
   */
  interactiveConflicts: boolean;

  /**
   * User-declared local scripts that the agent may run during a heal. Each
   * entry is a path INSIDE the fork. Nothing outside this list is ever
   * executed.
   */
  allowedScripts: string[];

  /** ISO timestamp of last policy write. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Defaults — conservative: confirm everything, local-only
// ---------------------------------------------------------------------------

export function makeDefaultKitForkPolicy(): KitForkPolicy {
  return {
    version: 1,
    untouchablePaths: [],
    confirmBeforeChange: ["package.json", "kit.json"],
    autoApprove: "additive",
    autoApproveDepUpdates: "additive",
    remoteSyncMode: "off",
    interactiveConflicts: true,
    allowedScripts: [],
    updatedAt: new Date().toISOString(),
  };
}

function resolvePolicyPath(forkPath: string): string {
  return path.resolve(resolveInForkStateDir(forkPath), "policy.json");
}

export function readKitForkPolicy(forkPath: string): KitForkPolicy {
  const p = resolvePolicyPath(forkPath);
  if (!fs.existsSync(p)) return makeDefaultKitForkPolicy();
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<KitForkPolicy>;
    return { ...makeDefaultKitForkPolicy(), ...parsed, version: 1 };
  } catch {
    return makeDefaultKitForkPolicy();
  }
}

export function writeKitForkPolicy(forkPath: string, policy: KitForkPolicy): void {
  const p = resolvePolicyPath(forkPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const body: KitForkPolicy = { ...policy, version: 1, updatedAt: new Date().toISOString() };
  fs.writeFileSync(p, JSON.stringify(body, null, 2) + "\n", "utf8");
}

export function updateKitForkPolicy(
  forkPath: string,
  patch: Partial<KitForkPolicy>,
): KitForkPolicy {
  const current = readKitForkPolicy(forkPath);
  const next: KitForkPolicy = { ...current, ...patch, version: 1 };
  writeKitForkPolicy(forkPath, next);
  return next;
}

// ---------------------------------------------------------------------------
// Policy evaluation helpers (pure — no I/O)
// ---------------------------------------------------------------------------

function matchesAnyPrefix(targetPath: string, patterns: string[]): boolean {
  const normalized = targetPath.replace(/^\/+|\/+$/g, "");
  return patterns.some((pat) => {
    const normPat = pat.replace(/^\/+|\/+$/g, "");
    if (!normPat) return false;
    if (normalized === normPat) return true;
    return normalized.startsWith(`${normPat}/`);
  });
}

export function isUntouchable(policy: KitForkPolicy, relativePath: string): boolean {
  return matchesAnyPrefix(relativePath, policy.untouchablePaths);
}

export function requiresConfirmation(policy: KitForkPolicy, relativePath: string): boolean {
  return matchesAnyPrefix(relativePath, policy.confirmBeforeChange);
}

export function canAutoApplyAddition(policy: KitForkPolicy): boolean {
  return policy.autoApprove === "additive" || policy.autoApprove === "all";
}

export function canAutoApplyModification(policy: KitForkPolicy): boolean {
  return policy.autoApprove === "all";
}

export function canAutoApplyDepAddition(policy: KitForkPolicy): boolean {
  return policy.autoApproveDepUpdates === "additive" || policy.autoApproveDepUpdates === "all";
}

export function canAutoApplyDepUpgrade(policy: KitForkPolicy): boolean {
  return policy.autoApproveDepUpdates === "all";
}
