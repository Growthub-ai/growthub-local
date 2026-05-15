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

interface SeededConfigShape {
  dataModel?: {
    objects?: Array<Record<string, unknown>>;
  };
  [key: string]: unknown;
}

function readJsonFile(filePath: string): SeededConfigShape {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function mergeDataModelObjects(
  baseObjects: Array<Record<string, unknown>>,
  seedObjects: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const readId = (value: Record<string, unknown>): string => {
    const candidate = value.id;
    return typeof candidate === "string" ? candidate : "";
  };
  const merged = [...baseObjects];
  const indexById = new Map<string, number>();
  for (let i = 0; i < merged.length; i += 1) {
    const id = readId(merged[i]);
    if (id) indexById.set(id, i);
  }
  for (const seedObject of seedObjects) {
    const id = readId(seedObject);
    if (id && indexById.has(id)) {
      merged[indexById.get(id)!] = {
        ...merged[indexById.get(id)!],
        ...seedObject,
      };
      continue;
    }
    merged.push(seedObject);
    if (id) indexById.set(id, merged.length - 1);
  }
  return merged;
}

function applySeededConfig(opts: { outPath: string; kitPath: string; seedConfig: string }): void {
  const seedSlug = opts.seedConfig.trim();
  if (!seedSlug) return;

  const seedPath = path.join(opts.kitPath, "templates", "seeded-configs", `${seedSlug}.config.json`);
  const seedOverlayPath = path.join(opts.kitPath, "templates", "seeded-configs", seedSlug);
  if (!fs.existsSync(seedPath)) {
    throw new Error(
      `Seeded config "${seedSlug}" was not found at ${seedPath}. ` +
      "Create templates/seeded-configs/<slug>.config.json in the starter kit first.",
    );
  }

  const outConfigPath = path.join(opts.outPath, "apps", "workspace", "growthub.config.json");
  if (!fs.existsSync(outConfigPath)) {
    throw new Error(`Expected workspace config at ${outConfigPath} while applying seeded config "${seedSlug}".`);
  }

  const baseConfig = readJsonFile(outConfigPath);
  const seedConfig = readJsonFile(seedPath);
  const mergedObjects = mergeDataModelObjects(
    Array.isArray(baseConfig.dataModel?.objects) ? baseConfig.dataModel.objects : [],
    Array.isArray(seedConfig.dataModel?.objects) ? seedConfig.dataModel.objects : [],
  );
  const mergedConfig: SeededConfigShape = {
    ...baseConfig,
    ...seedConfig,
    dataModel: {
      ...(baseConfig.dataModel || {}),
      ...(seedConfig.dataModel || {}),
      objects: mergedObjects,
    },
  };

  fs.writeFileSync(outConfigPath, `${JSON.stringify(mergedConfig, null, 2)}\n`, "utf8");

  if (fs.existsSync(seedOverlayPath)) {
    copySeededConfigOverlay(seedOverlayPath, opts.outPath);
  }
}

function copySeededConfigOverlay(sourceRoot: string, targetRoot: string): void {
  const copyEntry = (sourcePath: string, relativePath: string): void => {
    const targetPath = path.join(targetRoot, relativePath);
    const stat = fs.statSync(sourcePath);
    if (stat.isDirectory()) {
      fs.mkdirSync(targetPath, { recursive: true });
      for (const entry of fs.readdirSync(sourcePath)) {
        copyEntry(path.join(sourcePath, entry), path.join(relativePath, entry));
      }
      return;
    }
    if (fs.existsSync(targetPath)) {
      throw new Error(
        `Seeded config overlay would overwrite existing path: ${targetPath}. ` +
        "Seed overlays must be additive.",
      );
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  };

  for (const entry of fs.readdirSync(sourceRoot)) {
    copyEntry(path.join(sourceRoot, entry), entry);
  }
}

export async function initStarterWorkspace(
  opts: StarterInitOptions,
): Promise<StarterInitResult> {
  const kitId = opts.kitId ?? DEFAULT_STARTER_KIT_ID;
  const absOut = path.resolve(opts.out);

  if (fs.existsSync(absOut) && fs.readdirSync(absOut).length > 0) {
    throw new Error(`Destination ${absOut} already exists and is not empty.`);
  }

  // 1. Materialize bundled assets
  const info = getBundledKitSourceInfo(kitId);
  copyBundledKitSource(kitId, absOut);
  if (opts.seedConfig) {
    applySeededConfig({
      outPath: absOut,
      kitPath: info.assetRoot,
      seedConfig: opts.seedConfig,
    });
  }

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
    source: "workspace-starter",
    sourceRef: "",
  });
  if (sessionSeed.written) {
    appendKitForkTraceEvent(absOut, {
      forkId: reg.forkId, kitId: reg.kitId, type: "skills_scaffolded",
      summary: "Seeded .growthub-fork/project.md from templates/project.md",
      detail: { projectMd: sessionSeed.projectMdPath },
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
