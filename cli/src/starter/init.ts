/**
 * Growthub Custom Workspace Starter — init orchestrator.
 *
 * Composes three already-shipping primitives:
 *   1. `copyBundledKitSource`   → materialize the frozen bundled asset tree
 *   2. `registerKitFork`        → canonical in-fork registration + discovery index
 *   3. `writeKitForkPolicy`     → seed the safety envelope
 *   4. `appendKitForkTraceEvent`→ durable event log
 *   5. (optional) `createFork`  → first-party GitHub remote
 *
 * No new transport, no new storage locations, no new auth primitive.  This
 * module is the smallest legal orchestrator — everything else flows through
 * the v1 Self-Healing Fork Sync Agent surface.
 */

import fs from "node:fs";
import path from "node:path";
import {
  getBundledKitSourceInfo,
  copyBundledKitSource,
} from "../kits/service.js";
import {
  registerKitFork,
  updateKitForkRegistration,
} from "../kits/fork-registry.js";
import {
  writeKitForkPolicy,
  makeDefaultKitForkPolicy,
} from "../kits/fork-policy.js";
import { appendKitForkTraceEvent } from "../kits/fork-trace.js";
import {
  gitAvailable,
  isGitRepo,
  initGitRepo,
  setOrigin,
  buildTokenCloneUrl,
} from "../kits/fork-remote.js";
import { resolveGithubAccessToken } from "../integrations/github-resolver.js";
import { createFork, parseRepoRef } from "../github/client.js";
import type { KitForkRemoteBinding } from "../kits/fork-types.js";
import type { StarterInitOptions, StarterInitResult } from "./types.js";
import { scaffoldSessionMemory } from "./scaffold-session-memory.js";

export const DEFAULT_STARTER_KIT_ID = "growthub-custom-workspace-starter-v1";
const SUPPORTED_COMPOSITION_PRIMITIVES = new Set(["canvas", "chat", "workflow", "artifacts"]);

function normalizeCompositionPrimitives(values?: string | string[]): string[] {
  const rawValues = Array.isArray(values) ? values : values ? [values] : [];
  const requested = rawValues.length > 0
    ? rawValues.flatMap((value) => value.split(","))
    : [];
  const normalized = requested
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  for (const primitive of normalized) {
    if (!SUPPORTED_COMPOSITION_PRIMITIVES.has(primitive)) {
      throw new Error(
        `Unsupported --with primitive "${primitive}". Expected one of canvas, chat, workflow, artifacts.`,
      );
    }
  }
  return Array.from(new Set(normalized));
}

function writeCompositionSelection(forkPath: string, primitives: string[]): string | undefined {
  if (primitives.length === 0) return undefined;
  const markerPath = path.join(forkPath, ".growthub-fork", "composition-primitives.json");
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(
    markerPath,
    `${JSON.stringify({
      version: 1,
      selected: primitives,
      configPath: "growthub.config.json",
    }, null, 2)}\n`,
  );
  return markerPath;
}

export async function initStarterWorkspace(
  opts: StarterInitOptions,
): Promise<StarterInitResult> {
  const kitId = opts.kitId ?? DEFAULT_STARTER_KIT_ID;
  const absOut = path.resolve(opts.out);
  const compositionPrimitives = normalizeCompositionPrimitives(opts.with);

  if (fs.existsSync(absOut) && fs.readdirSync(absOut).length > 0) {
    throw new Error(`Destination ${absOut} already exists and is not empty.`);
  }

  // 1. Materialize bundled assets
  const info = getBundledKitSourceInfo(kitId);
  copyBundledKitSource(kitId, absOut);

  // 2. Register as a kit-fork — canonical state inside the fork
  const reg = registerKitFork({
    forkPath: absOut,
    kitId: info.id,
    baseVersion: info.version,
    label: opts.name?.trim() || path.basename(absOut),
  });

  // 3. Seed policy with the requested mode
  const policy = {
    ...makeDefaultKitForkPolicy(),
    remoteSyncMode: opts.remoteSyncMode ?? ("off" as const),
  };
  writeKitForkPolicy(absOut, policy);

  // 4. Append initial trace events
  appendKitForkTraceEvent(absOut, {
    forkId: reg.forkId, kitId: reg.kitId, type: "registered",
    summary: `Scaffolded from starter kit ${info.id}@${info.version}`,
    detail: { source: "growthub starter init", name: opts.name ?? null },
  });
  appendKitForkTraceEvent(absOut, {
    forkId: reg.forkId, kitId: reg.kitId, type: "policy_updated",
    summary: `Initial policy seeded (remoteSyncMode=${policy.remoteSyncMode})`,
  });

  // 4a. Seed session memory (.growthub-fork/project.md) from the kit's
  //     templates/project.md — primitive #3. No-op on older kits that do
  //     not ship the template.
  const sessionSeed = scaffoldSessionMemory({
    forkPath: absOut,
    kitId: info.id,
    forkId: reg.forkId,
    source: "greenfield",
    sourceRef: "",
  });
  if (sessionSeed.written) {
    appendKitForkTraceEvent(absOut, {
      forkId: reg.forkId, kitId: reg.kitId, type: "skills_scaffolded",
      summary: "Seeded .growthub-fork/project.md from templates/project.md",
      detail: { projectMd: sessionSeed.projectMdPath },
    });
  }

  const compositionMarker = writeCompositionSelection(absOut, compositionPrimitives);
  if (compositionMarker) {
    appendKitForkTraceEvent(absOut, {
      forkId: reg.forkId, kitId: reg.kitId, type: "skills_scaffolded",
      summary: `Selected composition primitives: ${compositionPrimitives.join(", ")}`,
      detail: { markerPath: compositionMarker, configPath: path.join(absOut, "growthub.config.json") },
    });
  }

  let remote: KitForkRemoteBinding | undefined;

  // 5. Optional: one-click GitHub fork + wire as origin
  if (opts.upstream) {
    const resolved = await resolveGithubAccessToken();
    if (!resolved) {
      throw new Error(
        "GitHub is not authenticated. Run `growthub github login` or connect GitHub " +
        "in your Growthub account before using --upstream.",
      );
    }
    const upstream = parseRepoRef(opts.upstream);
    const forkResult = await createFork(resolved.accessToken, {
      upstream,
      forkName: opts.forkName,
      destinationOrg: opts.destinationOrg,
    });
    if (!gitAvailable()) {
      throw new Error("git is not available on PATH — cannot wire remote origin.");
    }
    if (!isGitRepo(absOut)) initGitRepo(absOut);
    setOrigin(absOut, buildTokenCloneUrl(forkResult.fork, resolved.accessToken));

    remote = {
      provider: "github",
      owner: forkResult.fork.owner,
      repo: forkResult.fork.repo,
      defaultBranch: forkResult.defaultBranch,
      cloneUrl: forkResult.cloneUrl,
      htmlUrl: forkResult.htmlUrl,
    };
    updateKitForkRegistration({ ...reg, remote });
    appendKitForkTraceEvent(absOut, {
      forkId: reg.forkId, kitId: reg.kitId, type: "remote_connected",
      summary: `Remote origin bound to ${forkResult.fork.owner}/${forkResult.fork.repo}`,
      detail: { htmlUrl: forkResult.htmlUrl, authSource: resolved.source },
    });
  }

  return {
    kitId: info.id,
    forkId: reg.forkId,
    forkPath: absOut,
    baseVersion: info.version,
    policyMode: policy.remoteSyncMode,
    with: compositionPrimitives,
    remote: remote
      ? {
          owner: remote.owner,
          repo: remote.repo,
          htmlUrl: remote.htmlUrl,
          defaultBranch: remote.defaultBranch,
        }
      : undefined,
  };
}
