import path from "node:path";
import { resolvePaperclipHomeDir } from "../config/home.js";

/**
 * CLI-owned auth + profile storage roots.
 *
 * These live under the Paperclip home directory (`~/.paperclip` by default) but
 * are deliberately scoped outside `instances/<id>/config.json` so hosted auth
 * overlay metadata does not leak into local workspace config files or kit
 * export folders. This preserves the "paperclip local workspace profile stays
 * the base layer, hosted overlay lives above it" design contract.
 */

export function resolveAuthDir(): string {
  return path.resolve(resolvePaperclipHomeDir(), "auth");
}

export function resolveProfilesDir(): string {
  return path.resolve(resolvePaperclipHomeDir(), "profiles");
}

export function resolveSessionPath(): string {
  return path.resolve(resolveAuthDir(), "session.json");
}

export function resolveHostedOverlayPath(): string {
  return path.resolve(resolveProfilesDir(), "hosted-overlay.json");
}

export function resolveEffectiveProfilePath(): string {
  return path.resolve(resolveProfilesDir(), "effective-profile.json");
}
