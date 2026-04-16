/**
 * Growthub CLI Statuspage — individual probes.
 *
 * Every probe is a self-contained async function returning
 * `ServiceProbeResult`. No shared mutable state. No direct consumption of
 * the fork-sync engine or discovery hub; this subsystem can be deleted
 * cleanly without cascading changes.
 *
 * A probe MUST:
 *   - never throw (catch and surface as "outage" / "degraded")
 *   - respect the provided AbortSignal-equivalent timeout
 *   - stay under a few hundred lines of input (never print to console)
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ServiceProbeResult } from "./types.js";

const GITHUB_API = "https://api.github.com";
const NPM_REGISTRY = "https://registry.npmjs.org";

function isoNow(): string {
  return new Date().toISOString();
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race<T>([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), ms)),
  ]);
}

interface HttpProbeResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  error?: string;
}

async function httpHead(url: string, timeoutMs: number): Promise<HttpProbeResult> {
  const started = Date.now();
  try {
    const res = await withTimeout(fetch(url, { method: "GET", headers: { "User-Agent": "growthub-cli/statuspage" } }), timeoutMs, `GET ${url}`);
    return { ok: res.ok, status: res.status, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      status: -1,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// External HTTP probes
// ---------------------------------------------------------------------------

export async function probeGithubApi(timeoutMs: number): Promise<ServiceProbeResult> {
  const res = await httpHead(`${GITHUB_API}/zen`, timeoutMs);
  return {
    componentId: "github-api",
    level: res.ok ? "operational" : (res.status === -1 ? "outage" : "degraded"),
    summary: res.ok
      ? `GitHub API reachable (${res.latencyMs}ms)`
      : `GitHub API error — status=${res.status} ${res.error ?? ""}`.trim(),
    latencyMs: res.latencyMs,
    lastCheckedAt: isoNow(),
    detail: { endpoint: `${GITHUB_API}/zen`, httpStatus: res.status },
  };
}

export async function probeNpmRegistry(timeoutMs: number): Promise<ServiceProbeResult> {
  const res = await httpHead(`${NPM_REGISTRY}/-/ping?write=false`, timeoutMs);
  return {
    componentId: "npm-registry",
    level: res.ok ? "operational" : "degraded",
    summary: res.ok
      ? `npm registry reachable (${res.latencyMs}ms)`
      : `npm registry unreachable — status=${res.status}`,
    latencyMs: res.latencyMs,
    lastCheckedAt: isoNow(),
    detail: { endpoint: `${NPM_REGISTRY}/-/ping`, httpStatus: res.status },
  };
}

export async function probeGrowthubHosted(timeoutMs: number): Promise<ServiceProbeResult> {
  // Uses the existing hosted-client indirectly — no new transport.
  try {
    const { readSession, isSessionExpired } = await import("../auth/session-store.js");
    const session = readSession();
    if (!session) {
      return {
        componentId: "growthub-hosted",
        level: "unknown",
        summary: "Growthub CLI not logged in — skipping hosted probe.",
        lastCheckedAt: isoNow(),
      };
    }
    if (isSessionExpired(session)) {
      return {
        componentId: "growthub-hosted",
        level: "degraded",
        summary: "Growthub session expired — run `growthub login`.",
        lastCheckedAt: isoNow(),
      };
    }
    const started = Date.now();
    const { fetchHostedSession } = await import("../auth/hosted-client.js");
    const hosted = await withTimeout(fetchHostedSession(session), timeoutMs, "hosted /api/cli/session");
    return {
      componentId: "growthub-hosted",
      level: "operational",
      summary: `Hosted bridge reachable (${Date.now() - started}ms)`,
      latencyMs: Date.now() - started,
      lastCheckedAt: isoNow(),
      detail: { hostedBaseUrl: session.hostedBaseUrl, userId: hosted?.userId ?? null },
    };
  } catch (err) {
    return {
      componentId: "growthub-hosted",
      level: "degraded",
      summary: `Hosted probe failed: ${err instanceof Error ? err.message : String(err)}`,
      lastCheckedAt: isoNow(),
    };
  }
}

export async function probeIntegrationsBridge(_timeoutMs: number): Promise<ServiceProbeResult> {
  try {
    const { describeIntegrationBridge } = await import("../integrations/bridge.js");
    const state = await describeIntegrationBridge();
    if (!state.growthubConnected) {
      return {
        componentId: "integrations-bridge",
        level: "unknown",
        summary: "Growthub not connected — bridge not applicable.",
        lastCheckedAt: isoNow(),
      };
    }
    if (!state.bridgeAvailable) {
      return {
        componentId: "integrations-bridge",
        level: "degraded",
        summary: state.notice ?? "Hosted integrations endpoint unavailable.",
        lastCheckedAt: isoNow(),
      };
    }
    return {
      componentId: "integrations-bridge",
      level: "operational",
      summary: `Bridge ready — ${state.integrations.length} integration(s) connected.`,
      lastCheckedAt: isoNow(),
      detail: { count: state.integrations.length, providers: state.integrations.map((i) => i.provider) },
    };
  } catch (err) {
    return {
      componentId: "integrations-bridge",
      level: "outage",
      summary: `Bridge probe errored: ${err instanceof Error ? err.message : String(err)}`,
      lastCheckedAt: isoNow(),
    };
  }
}

// ---------------------------------------------------------------------------
// Local probes
// ---------------------------------------------------------------------------

export async function probeGithubDirectAuth(_timeoutMs: number): Promise<ServiceProbeResult> {
  try {
    const { readGithubToken, isGithubTokenExpired } = await import("../github/token-store.js");
    const token = readGithubToken();
    if (!token) {
      return {
        componentId: "github-direct-auth",
        level: "unknown",
        summary: "No direct GitHub token stored (bridge may still provide one).",
        lastCheckedAt: isoNow(),
      };
    }
    if (isGithubTokenExpired(token)) {
      return {
        componentId: "github-direct-auth",
        level: "degraded",
        summary: "Direct GitHub token expired — run `growthub github login`.",
        lastCheckedAt: isoNow(),
        detail: { authMode: token.authMode, login: token.login ?? null },
      };
    }
    return {
      componentId: "github-direct-auth",
      level: "operational",
      summary: `Direct GitHub token active (mode=${token.authMode}).`,
      lastCheckedAt: isoNow(),
      detail: { authMode: token.authMode, login: token.login ?? null, scopes: token.scopes },
    };
  } catch {
    return {
      componentId: "github-direct-auth",
      level: "unknown",
      summary: "Unable to read direct GitHub token.",
      lastCheckedAt: isoNow(),
    };
  }
}

export async function probeKitForksIndex(_timeoutMs: number): Promise<ServiceProbeResult> {
  try {
    const { resolveKitForksIndexPath } = await import("../config/kit-forks-home.js");
    const p = resolveKitForksIndexPath();
    if (!fs.existsSync(p)) {
      return {
        componentId: "kit-forks-index",
        level: "operational",
        summary: "No forks registered yet (fresh install).",
        lastCheckedAt: isoNow(),
      };
    }
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as { entries?: unknown[] };
    const count = Array.isArray(parsed.entries) ? parsed.entries.length : 0;
    return {
      componentId: "kit-forks-index",
      level: "operational",
      summary: `${count} fork(s) registered locally.`,
      lastCheckedAt: isoNow(),
      detail: { indexPath: p, count },
    };
  } catch (err) {
    return {
      componentId: "kit-forks-index",
      level: "degraded",
      summary: `Unable to read kit-forks index: ${err instanceof Error ? err.message : String(err)}`,
      lastCheckedAt: isoNow(),
    };
  }
}

export async function probeBundledKits(_timeoutMs: number): Promise<ServiceProbeResult> {
  try {
    const { listBundledKits } = await import("../kits/service.js");
    const kits = listBundledKits();
    return {
      componentId: "bundled-kits",
      level: kits.length > 0 ? "operational" : "outage",
      summary: `${kits.length} bundled worker kit(s) available.`,
      lastCheckedAt: isoNow(),
      detail: { count: kits.length, ids: kits.slice(0, 12).map((k) => k.id) },
    };
  } catch (err) {
    return {
      componentId: "bundled-kits",
      level: "outage",
      summary: `Bundled kit catalog unreadable: ${err instanceof Error ? err.message : String(err)}`,
      lastCheckedAt: isoNow(),
    };
  }
}

export async function probeGit(_timeoutMs: number): Promise<ServiceProbeResult> {
  try {
    const res = spawnSync("git", ["--version"], { encoding: "utf8" });
    const ok = res.status === 0 && (res.stdout ?? "").includes("git version");
    return {
      componentId: "local-git",
      level: ok ? "operational" : "outage",
      summary: ok ? res.stdout.trim() : "git is not available on PATH.",
      lastCheckedAt: isoNow(),
    };
  } catch (err) {
    return {
      componentId: "local-git",
      level: "outage",
      summary: `git probe errored: ${err instanceof Error ? err.message : String(err)}`,
      lastCheckedAt: isoNow(),
    };
  }
}

export async function probeNode(_timeoutMs: number): Promise<ServiceProbeResult> {
  const major = Number((process.version.match(/^v(\d+)/) ?? [])[1] ?? 0);
  const ok = major >= 20;
  return {
    componentId: "local-node",
    level: ok ? "operational" : "degraded",
    summary: ok
      ? `node ${process.version} (minimum v20 satisfied).`
      : `node ${process.version} — minimum supported is v20.`,
    lastCheckedAt: isoNow(),
    detail: { version: process.version, major },
  };
}

// ---------------------------------------------------------------------------
// Super-admin-only probes
// ---------------------------------------------------------------------------

export async function probeReleaseBundleArtifacts(_timeoutMs: number): Promise<ServiceProbeResult> {
  // Verifies the CLI dist bundle exists — prevents silent "missing dist" releases.
  const distPath = path.resolve(process.cwd(), "cli/dist/index.js");
  const installerPath = path.resolve(process.cwd(), "packages/create-growthub-local/bin/create-growthub-local.mjs");
  const distOk = fs.existsSync(distPath);
  const installerOk = fs.existsSync(installerPath);
  const ok = distOk && installerOk;
  return {
    componentId: "release-bundle",
    level: ok ? "operational" : "degraded",
    summary: ok
      ? "cli/dist/index.js + installer present."
      : `Missing artifacts — dist=${distOk} installer=${installerOk}`,
    lastCheckedAt: isoNow(),
    detail: { distPath, installerPath, distOk, installerOk },
  };
}
