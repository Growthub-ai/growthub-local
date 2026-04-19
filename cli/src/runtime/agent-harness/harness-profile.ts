/**
 * Agent Harness — Growthub Profile Primitive
 *
 * Generic reusable thin adapter primitive that any process-spawn harness can
 * opt into by calling registerHarnessProfileCommands(). Equivalent to what
 * Paperclip ships with SURFACE_PROFILES + registerProfileCommands().
 *
 * Storage: ~/.paperclip/<harnessId>/growthub-profile.json (mode 0600)
 * Each harness gets one profile file — single Growthub workspace binding per
 * machine per harness. Multi-workspace support can be added later without
 * changing this contract.
 *
 * Auth primitive compliance (AGENT_HARNESS_AUTH_PRIMITIVE.md):
 *   - profile file is non-secret public config (workspaceId, machineLabel, slugs)
 *   - secrets (tokens) stay in the secure harness-auth lane via auth-store.ts
 *   - never prints raw secrets; masked summaries only
 */

import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { Command } from "commander";
import { resolvePaperclipHomeDir } from "../../config/home.js";

// ---------------------------------------------------------------------------
// Profile shape
// ---------------------------------------------------------------------------

export interface GrowthubHarnessProfile {
  /** Schema version — increment if shape changes */
  profileVersion: 1;
  /** Growthub hosted workspace / org ID */
  workspaceId: string;
  /** Human label for this machine */
  machineLabel: string;
  /** Optional: path to a fork-customised binary that overrides the default */
  forkBinaryPath?: string;
  /** Optional: kit slug for the fork distribution (e.g. "growthub-t3-v1") */
  forkKitSlug?: string;
  /** ISO timestamp when this profile was first linked */
  linkedAt: string;
  /** ISO timestamp of the most recent profile sync */
  lastSyncAt?: string;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function resolveProfileDir(harnessId: string): string {
  return path.resolve(resolvePaperclipHomeDir(), harnessId);
}

function resolveProfilePath(harnessId: string): string {
  return path.resolve(resolveProfileDir(harnessId), "growthub-profile.json");
}

// ---------------------------------------------------------------------------
// Secure file helpers (best-effort, mirrors auth-store.ts)
// ---------------------------------------------------------------------------

function ensureSecureFile(filePath: string): void {
  try { fs.chmodSync(filePath, 0o600); } catch { /* best effort */ }
}

// ---------------------------------------------------------------------------
// Public read / write / clear
// ---------------------------------------------------------------------------

export function harnessProfileExists(harnessId: string): boolean {
  return fs.existsSync(resolveProfilePath(harnessId));
}

export function readHarnessProfile(harnessId: string): GrowthubHarnessProfile | null {
  const filePath = resolveProfilePath(harnessId);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<GrowthubHarnessProfile>;
    if (typeof raw.workspaceId !== "string" || typeof raw.machineLabel !== "string") return null;
    return {
      profileVersion: 1,
      workspaceId: raw.workspaceId,
      machineLabel: raw.machineLabel,
      forkBinaryPath: typeof raw.forkBinaryPath === "string" ? raw.forkBinaryPath : undefined,
      forkKitSlug: typeof raw.forkKitSlug === "string" ? raw.forkKitSlug : undefined,
      linkedAt: typeof raw.linkedAt === "string" ? raw.linkedAt : new Date().toISOString(),
      lastSyncAt: typeof raw.lastSyncAt === "string" ? raw.lastSyncAt : undefined,
    };
  } catch {
    return null;
  }
}

export function writeHarnessProfile(harnessId: string, profile: GrowthubHarnessProfile): void {
  const dirPath = resolveProfileDir(harnessId);
  const filePath = resolveProfilePath(harnessId);
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(profile, null, 2)}\n`, "utf-8");
  ensureSecureFile(filePath);
}

export function clearHarnessProfile(harnessId: string): void {
  const filePath = resolveProfilePath(harnessId);
  if (fs.existsSync(filePath)) fs.rmSync(filePath);
}

export function touchHarnessProfileSync(harnessId: string): void {
  const existing = readHarnessProfile(harnessId);
  if (!existing) return;
  writeHarnessProfile(harnessId, { ...existing, lastSyncAt: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Profile status summary (safe — never prints secrets)
// ---------------------------------------------------------------------------

export function buildProfileStatusLines(
  harnessId: string,
  harnessLabel: string,
  profile: GrowthubHarnessProfile | null,
): string[] {
  if (!profile) {
    return [
      `${harnessLabel} Growthub Profile: ${pc.yellow("not linked")}`,
      "",
      `Link this harness to a Growthub workspace:`,
      `  growthub ${harnessId} profile link`,
    ];
  }
  return [
    `${harnessLabel} Growthub Profile: ${pc.green("linked")}`,
    `  Workspace ID : ${profile.workspaceId}`,
    `  Machine      : ${profile.machineLabel}`,
    `  Fork binary  : ${profile.forkBinaryPath ?? pc.dim("(using default)")}`,
    `  Fork kit     : ${profile.forkKitSlug ?? pc.dim("(none)")}`,
    `  Linked at    : ${profile.linkedAt}`,
    `  Last sync    : ${profile.lastSyncAt ?? pc.dim("(never synced)")}`,
  ];
}

// ---------------------------------------------------------------------------
// Interactive profile link flow (used from hub and from Commander action)
// ---------------------------------------------------------------------------

export async function runProfileLinkFlow(
  harnessId: string,
  harnessLabel: string,
  existing: GrowthubHarnessProfile | null,
): Promise<GrowthubHarnessProfile | null> {
  p.intro(`${harnessLabel} — Link Growthub Profile`);

  const workspaceId = await p.text({
    message: "Growthub Workspace ID",
    placeholder: "ws_xxxxxxxxxxxxxxxx",
    defaultValue: existing?.workspaceId ?? "",
    validate: (v) => (!v?.trim() ? "Workspace ID is required." : undefined),
  });
  if (p.isCancel(workspaceId)) return null;

  const machineLabel = await p.text({
    message: "Machine label (human-readable name for this machine)",
    placeholder: "my-macbook-pro",
    defaultValue: existing?.machineLabel ?? "",
    validate: (v) => (!v?.trim() ? "Machine label is required." : undefined),
  });
  if (p.isCancel(machineLabel)) return null;

  const forkBinaryPath = await p.text({
    message: "Fork binary path (optional — leave blank to use system default)",
    placeholder: "/path/to/fork/bin/t3",
    defaultValue: existing?.forkBinaryPath ?? "",
  });
  if (p.isCancel(forkBinaryPath)) return null;

  const forkKitSlug = await p.text({
    message: "Fork kit slug (optional — e.g. growthub-t3-v1)",
    placeholder: "growthub-t3-v1",
    defaultValue: existing?.forkKitSlug ?? "",
  });
  if (p.isCancel(forkKitSlug)) return null;

  const confirmed = await p.confirm({
    message: `Save profile? (workspace: ${String(workspaceId).trim()}, machine: ${String(machineLabel).trim()})`,
    initialValue: true,
  });
  if (p.isCancel(confirmed) || !confirmed) return null;

  const profile: GrowthubHarnessProfile = {
    profileVersion: 1,
    workspaceId: String(workspaceId).trim(),
    machineLabel: String(machineLabel).trim(),
    forkBinaryPath: String(forkBinaryPath).trim() || undefined,
    forkKitSlug: String(forkKitSlug).trim() || undefined,
    linkedAt: existing?.linkedAt ?? new Date().toISOString(),
    lastSyncAt: existing ? new Date().toISOString() : undefined,
  };

  return profile;
}

// ---------------------------------------------------------------------------
// registerHarnessProfileCommands — the reusable factory
//
// Call this from any harness's registerXxxCommands() to get a full
// `growthub <harnessId> profile [status|link|unlink]` surface for free.
// ---------------------------------------------------------------------------

export function registerHarnessProfileCommands(
  harnessCommand: Command,
  harnessId: string,
  harnessLabel: string,
): void {
  const profileCmd = harnessCommand
    .command("profile")
    .description(`Growthub workspace profile for the ${harnessLabel} harness`);

  profileCmd
    .command("status")
    .description("Show the current Growthub profile linked to this harness")
    .action(() => {
      const profile = readHarnessProfile(harnessId);
      const lines = buildProfileStatusLines(harnessId, harnessLabel, profile);
      for (const line of lines) console.log(line);
    });

  profileCmd
    .command("link")
    .description("Link this harness to a Growthub workspace")
    .action(async () => {
      const existing = readHarnessProfile(harnessId);
      const profile = await runProfileLinkFlow(harnessId, harnessLabel, existing);
      if (!profile) {
        p.cancel("Profile link cancelled.");
        return;
      }
      writeHarnessProfile(harnessId, profile);
      p.log.success(`${harnessLabel} profile linked to workspace ${profile.workspaceId}.`);
    });

  profileCmd
    .command("unlink")
    .description("Remove the Growthub profile from this harness")
    .action(async () => {
      const existing = readHarnessProfile(harnessId);
      if (!existing) {
        console.log("No profile linked.");
        return;
      }
      const confirmed = await p.confirm({
        message: `Remove Growthub profile for ${harnessLabel}? (workspace: ${existing.workspaceId})`,
        initialValue: false,
      });
      if (p.isCancel(confirmed) || !confirmed) {
        p.cancel("Unlink cancelled.");
        return;
      }
      clearHarnessProfile(harnessId);
      p.log.success(`${harnessLabel} Growthub profile removed.`);
    });

  // Default: show status
  profileCmd.action(() => {
    const profile = readHarnessProfile(harnessId);
    const lines = buildProfileStatusLines(harnessId, harnessLabel, profile);
    for (const line of lines) console.log(line);
  });
}
