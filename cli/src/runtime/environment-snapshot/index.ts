/**
 * Environment Snapshot — Runtime
 *
 * Assembles a `EnvironmentSnapshot` by reading:
 *   - fork registrations and in-fork state files (identity, policy, trace, authority)
 *   - hosted session + profile + capability registry envelope
 *   - bridge health signals (token presence, expiry, cache freshness, drift)
 *
 * The snapshot is the single datum consumed by the Environment Management
 * lane; every renderer in `renderers.ts` is a pure function of this shape.
 */

import fs from "node:fs";
import path from "node:path";
import { readSession, isSessionExpired } from "../../auth/session-store.js";
import {
  resolveInForkStateDir,
  resolveInForkRegistrationPath,
} from "../../config/kit-forks-home.js";
import { listKitForkRegistrations } from "../../kits/fork-registry.js";
import { resolveInForkAuthorityPath } from "../../kits/fork-authority.js";
import { tailKitForkTrace, readKitForkTrace } from "../../kits/fork-trace.js";
import { createHostedExecutionClient } from "../hosted-execution-client/index.js";
import {
  createCmsCapabilityRegistryClient,
  computeManifestDrift,
} from "../cms-capability-registry/index.js";
import {
  readLocalCapabilityExtensions,
} from "../cms-capability-registry/local-extensions.js";
import type {
  BridgeSnapshot,
  EnvironmentSnapshot,
  EnvironmentSnapshotOptions,
  HostedSnapshot,
  LocalForkSnapshot,
  LocalSnapshot,
} from "./types.js";

export type {
  BridgeSnapshot,
  BridgeHealthState,
  EnvironmentSnapshot,
  EnvironmentSnapshotOptions,
  HostedSnapshot,
  LocalForkSnapshot,
  LocalSnapshot,
} from "./types.js";

function buildLocalForkSnapshot(forkPath: string, localExtensionCount: number): LocalForkSnapshot {
  const stateDir = resolveInForkStateDir(forkPath);
  const policyPath = path.resolve(stateDir, "policy.json");
  const authorityPath = resolveInForkAuthorityPath(forkPath);
  const registrationPath = resolveInForkRegistrationPath(forkPath);

  let forkId: string | undefined;
  let kitId: string | undefined;
  let label: string | undefined;
  if (fs.existsSync(registrationPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(registrationPath, "utf8")) as Record<string, unknown>;
      if (typeof raw.forkId === "string") forkId = raw.forkId;
      if (typeof raw.kitId === "string") kitId = raw.kitId;
      if (typeof raw.label === "string") label = raw.label;
    } catch {
      // Malformed registration; leave fields undefined.
    }
  }

  let traceEventCount: number | undefined;
  let lastTraceAt: string | undefined;
  try {
    const events = readKitForkTrace(forkPath);
    traceEventCount = events.length;
    const tail = tailKitForkTrace(forkPath, 1);
    const last = tail[tail.length - 1];
    if (last && typeof last.timestamp === "string") lastTraceAt = last.timestamp;
  } catch {
    // Fork without trace state; leave undefined.
  }

  return {
    forkPath,
    forkId,
    kitId,
    label,
    policyPresent: fs.existsSync(policyPath),
    authorityPresent: fs.existsSync(authorityPath),
    traceEventCount,
    lastTraceAt,
    localExtensionCount,
  };
}

function readLocalSnapshot(): LocalSnapshot {
  const registrations = listKitForkRegistrations();
  const extensionsScan = readLocalCapabilityExtensions();
  const extensionsByFork = new Map<string, number>();
  for (const ext of extensionsScan.extensions) {
    extensionsByFork.set(ext.forkPath, (extensionsByFork.get(ext.forkPath) ?? 0) + 1);
  }

  const registeredForks = registrations
    .filter((reg) => reg.forkPath && fs.existsSync(reg.forkPath))
    .map((reg) => buildLocalForkSnapshot(
      reg.forkPath,
      extensionsByFork.get(reg.forkPath) ?? 0,
    ));

  const cwd = process.cwd();
  const cwdStateDir = resolveInForkStateDir(cwd);
  const activeFork = fs.existsSync(cwdStateDir)
    ? buildLocalForkSnapshot(cwd, extensionsByFork.get(cwd) ?? 0)
    : null;

  return {
    registeredForks,
    activeFork,
    totalLocalExtensions: extensionsScan.extensions.length,
  };
}

async function readHostedSnapshot(options: EnvironmentSnapshotOptions): Promise<HostedSnapshot> {
  const session = readSession();
  if (!session) {
    return {
      connected: false,
      sessionExpired: false,
      reason: "No hosted session. Run `growthub auth login`.",
    };
  }

  const expired = isSessionExpired(session);
  if (expired) {
    return {
      connected: false,
      baseUrl: session.hostedBaseUrl,
      portalBaseUrl: session.growthubPortalBaseUrl,
      machineLabel: session.growthubMachineLabel,
      workspaceLabel: session.growthubWorkspaceLabel,
      sessionExpired: true,
      reason: "Hosted session expired. Run `growthub auth login` to refresh.",
    };
  }

  if (options.offline) {
    return {
      connected: true,
      baseUrl: session.hostedBaseUrl,
      portalBaseUrl: session.growthubPortalBaseUrl,
      machineLabel: session.growthubMachineLabel,
      workspaceLabel: session.growthubWorkspaceLabel,
      sessionExpired: false,
      reason: "Offline render requested — hosted network calls skipped.",
    };
  }

  const hosted = createHostedExecutionClient();
  const registry = createCmsCapabilityRegistryClient(
    options.cachedOnly ? { ttlSeconds: Number.POSITIVE_INFINITY } : undefined,
  );

  const [profile, registryMeta] = await Promise.allSettled([
    hosted.getHostedProfile(),
    registry.listCapabilities({ enabledOnly: false }).then((r) => r.meta),
  ]);

  const snapshot: HostedSnapshot = {
    connected: true,
    baseUrl: session.hostedBaseUrl,
    portalBaseUrl: session.growthubPortalBaseUrl,
    machineLabel: session.growthubMachineLabel,
    workspaceLabel: session.growthubWorkspaceLabel,
    sessionExpired: false,
  };

  if (profile.status === "fulfilled") {
    snapshot.profile = profile.value;
  } else {
    snapshot.reason = `Hosted profile unavailable: ${(profile.reason as Error).message ?? profile.reason}`;
  }

  if (registryMeta.status === "fulfilled") {
    snapshot.registry = registryMeta.value;
  }

  return snapshot;
}

async function readBridgeSnapshot(options: EnvironmentSnapshotOptions): Promise<BridgeSnapshot> {
  const session = readSession();
  const sessionTokenPresent = Boolean(session?.accessToken);
  const sessionExpired = session ? isSessionExpired(session) : false;

  if (!sessionTokenPresent) {
    return {
      state: "needs-auth",
      sessionTokenPresent: false,
      sessionExpired: false,
      cacheFresh: false,
      notes: ["No hosted session. Run `growthub auth login`."],
    };
  }
  if (sessionExpired) {
    return {
      state: "needs-auth",
      sessionTokenPresent: true,
      sessionExpired: true,
      cacheFresh: false,
      notes: ["Hosted session expired. Run `growthub auth login` to refresh."],
    };
  }

  const registry = createCmsCapabilityRegistryClient();
  const cached = registry.readCachedEnvelope();
  const notes: string[] = [];

  if (options.offline) {
    return {
      state: cached ? "ready" : "offline",
      sessionTokenPresent: true,
      sessionExpired: false,
      cacheFresh: Boolean(cached),
      cacheHash: cached?.meta.registryHash,
      lastEnvelope: cached ?? undefined,
      notes: cached ? ["Offline render — used last-known-good manifest."] : ["Offline and no cached manifest available."],
    };
  }

  try {
    const refresh = await registry.refresh();
    const drift = computeManifestDrift(cached ?? null, refresh.envelope);
    if (drift.severity !== "none") {
      notes.push(`Registry drift detected: ${drift.severity}.`);
    }
    return {
      state: drift.severity === "node-removed" ? "needs-refresh" : "ready",
      sessionTokenPresent: true,
      sessionExpired: false,
      cacheFresh: true,
      cacheHash: cached?.meta.registryHash,
      remoteHash: refresh.envelope.meta.registryHash,
      drift,
      manifestCachePath: refresh.cachePath,
      lastEnvelope: refresh.envelope,
      notes,
    };
  } catch (err) {
    notes.push(`Hosted registry refresh failed: ${(err as Error).message}`);
    return {
      state: cached ? "offline" : "needs-refresh",
      sessionTokenPresent: true,
      sessionExpired: false,
      cacheFresh: Boolean(cached),
      cacheHash: cached?.meta.registryHash,
      lastEnvelope: cached ?? undefined,
      notes,
    };
  }
}

export async function buildEnvironmentSnapshot(
  options: EnvironmentSnapshotOptions = {},
): Promise<EnvironmentSnapshot> {
  const [local, hosted, bridge] = await Promise.all([
    Promise.resolve(readLocalSnapshot()),
    readHostedSnapshot(options),
    readBridgeSnapshot(options),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    local,
    hosted,
    bridge,
  };
}
