/**
 * Growthub CLI Statuspage — component registry + runner.
 *
 * Single source of truth for what components render in the status grid. Each
 * entry binds a declarative `StatuspageComponent` metadata record to its
 * probe function. Probes run in parallel; failures are surfaced as "outage"
 * or "degraded" rather than thrown.
 */

import type {
  StatuspageComponent,
  ServiceProbeResult,
  StatuspageReport,
  StatuspageRunOptions,
  ServiceStatusLevel,
} from "./types.js";
import {
  probeGithubApi,
  probeNpmRegistry,
  probeGrowthubHosted,
  probeIntegrationsBridge,
  probeGithubDirectAuth,
  probeKitForksIndex,
  probeBundledKits,
  probeGit,
  probeNode,
  probeReleaseBundleArtifacts,
} from "./probes.js";

type ProbeFn = (timeoutMs: number) => Promise<ServiceProbeResult>;

interface StatuspageRegistryEntry {
  component: StatuspageComponent;
  probe: ProbeFn;
}

export const STATUSPAGE_REGISTRY: StatuspageRegistryEntry[] = [
  {
    component: {
      id: "local-node",
      label: "Node runtime",
      category: "local-env",
      critical: true,
      superAdminOnly: false,
      description: "Node.js major version must be >= 20.",
    },
    probe: probeNode,
  },
  {
    component: {
      id: "local-git",
      label: "Local git",
      category: "local-env",
      critical: true,
      superAdminOnly: false,
      description: "git on PATH — required for fork-sync remote operations.",
    },
    probe: probeGit,
  },
  {
    component: {
      id: "bundled-kits",
      label: "Bundled worker kits",
      category: "local-env",
      critical: true,
      superAdminOnly: false,
      description: "Frozen kit assets under cli/assets/worker-kits are loadable.",
    },
    probe: probeBundledKits,
  },
  {
    component: {
      id: "github-api",
      label: "GitHub API",
      category: "github",
      critical: true,
      superAdminOnly: false,
      description: "Public api.github.com reachability — required for fork create + PR open.",
    },
    probe: probeGithubApi,
  },
  {
    component: {
      id: "github-direct-auth",
      label: "GitHub direct auth",
      category: "cli-auth",
      critical: false,
      superAdminOnly: false,
      description: "Local device-flow or PAT token under GROWTHUB_GITHUB_HOME.",
    },
    probe: probeGithubDirectAuth,
  },
  {
    component: {
      id: "growthub-hosted",
      label: "Growthub hosted bridge",
      category: "growthub-hosted",
      critical: false,
      superAdminOnly: false,
      description: "gh-app /api/cli/session endpoint for the logged-in user.",
    },
    probe: probeGrowthubHosted,
  },
  {
    component: {
      id: "integrations-bridge",
      label: "Integrations bridge",
      category: "growthub-hosted",
      critical: false,
      superAdminOnly: false,
      description: "First-party provider integrations rendered through the bridge.",
    },
    probe: probeIntegrationsBridge,
  },
  {
    component: {
      id: "kit-forks-index",
      label: "Kit-forks discovery index",
      category: "fork-sync",
      critical: false,
      superAdminOnly: false,
      description: "GROWTHUB_KIT_FORKS_HOME/index.json readability.",
    },
    probe: probeKitForksIndex,
  },
  {
    component: {
      id: "npm-registry",
      label: "npm registry",
      category: "package-registry",
      critical: false,
      superAdminOnly: false,
      description: "registry.npmjs.org reachability for publish + install.",
    },
    probe: probeNpmRegistry,
  },
  {
    component: {
      id: "release-bundle",
      label: "Release bundle artifacts",
      category: "package-registry",
      critical: true,
      superAdminOnly: true,
      description: "cli/dist/index.js + create-growthub-local installer present.",
    },
    probe: probeReleaseBundleArtifacts,
  },
];

function aggregateLevel(components: Array<StatuspageComponent & ServiceProbeResult>): {
  overallLevel: ServiceStatusLevel;
  summary: string;
} {
  let outage = 0;
  let degraded = 0;
  let unknown = 0;
  let operational = 0;
  for (const c of components) {
    if (c.critical && c.level === "outage") outage += 1;
    else if (c.level === "outage" || c.level === "degraded") degraded += 1;
    else if (c.level === "unknown") unknown += 1;
    else operational += 1;
  }
  if (outage > 0) return { overallLevel: "outage", summary: `${outage} critical outage(s), ${degraded} degraded.` };
  if (degraded > 0) return { overallLevel: "degraded", summary: `${degraded} degraded / non-critical outage(s).` };
  if (operational === 0 && unknown > 0) return { overallLevel: "unknown", summary: `No operational components; ${unknown} unknown.` };
  return { overallLevel: "operational", summary: `All ${operational} checked component(s) operational.` };
}

function isSelected(
  entry: StatuspageRegistryEntry,
  opts: StatuspageRunOptions,
): boolean {
  if (entry.component.superAdminOnly && !opts.superAdmin) return false;
  if (opts.onlyCategory && entry.component.category !== opts.onlyCategory) return false;
  if (opts.onlyIds && opts.onlyIds.length > 0 && !opts.onlyIds.includes(entry.component.id)) return false;
  return true;
}

export async function runStatuspageReport(opts: StatuspageRunOptions = {}): Promise<StatuspageReport> {
  const timeoutMs = opts.perProbeTimeoutMs ?? 5000;
  const selected = STATUSPAGE_REGISTRY.filter((e) => isSelected(e, opts));

  const probeResults = await Promise.all(
    selected.map(async (entry) => {
      try {
        return { entry, result: await entry.probe(timeoutMs) };
      } catch (err) {
        return {
          entry,
          result: {
            componentId: entry.component.id,
            level: "outage" as ServiceStatusLevel,
            summary: `Probe threw: ${err instanceof Error ? err.message : String(err)}`,
            lastCheckedAt: new Date().toISOString(),
          } satisfies ServiceProbeResult,
        };
      }
    }),
  );

  const components = probeResults.map(({ entry, result }) => ({
    ...entry.component,
    ...result,
  }));

  const { overallLevel, summary } = aggregateLevel(components);

  return {
    generatedAt: new Date().toISOString(),
    overallLevel,
    summary,
    components,
  };
}
