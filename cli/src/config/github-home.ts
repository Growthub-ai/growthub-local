import os from "node:os";
import path from "node:path";
import { expandHomePrefix } from "./home.js";

/**
 * GitHub Home Resolver
 *
 * First-party native GitHub integration lives in its own dedicated CLI home.
 * No coupling to the Paperclip harness, no coupling to kit-forks storage.
 *
 * Layout:
 *   GROWTHUB_GITHUB_HOME/
 *     token.json          # CliGithubToken (device-flow or PAT)
 *     profile.json        # last-known authenticated identity
 *
 * Default when the env var is unset: `~/.growthub/github`.
 */
export function resolveGithubHomeDir(): string {
  const envHome = process.env.GROWTHUB_GITHUB_HOME?.trim();
  if (envHome) return path.resolve(expandHomePrefix(envHome));
  return path.resolve(os.homedir(), ".growthub", "github");
}

export function resolveGithubTokenPath(): string {
  return path.resolve(resolveGithubHomeDir(), "token.json");
}

export function resolveGithubProfilePath(): string {
  return path.resolve(resolveGithubHomeDir(), "profile.json");
}
