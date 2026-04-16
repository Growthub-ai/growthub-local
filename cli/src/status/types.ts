/**
 * Growthub CLI Statuspage — canonical types.
 *
 * A reverse-engineered Atlassian-Statuspage-style health surface rendered
 * directly in the CLI. Each mission-critical service the CLI depends on is
 * modelled as a `StatuspageComponent` with a deterministic probe. A
 * super-admin can surface an expanded grid that includes deeper, slower, or
 * privileged probes.
 *
 * Self-contained: this file imports nothing outside node: stdlib types.
 */

export type ServiceStatusLevel = "operational" | "degraded" | "outage" | "unknown";

export type ServiceStatusCategory =
  | "cli-auth"          // Growthub session, GitHub direct auth, integrations bridge
  | "growthub-hosted"   // gh-app endpoints used by the CLI
  | "github"            // external GitHub API
  | "package-registry"  // npm registry reachability (publish + install lifecycle)
  | "fork-sync"         // fork-sync local state — index, orphan-jobs, policy defaults
  | "local-env"         // node, git, bundled kit asset tree
  | "agent-harness";    // Open Agents / Qwen Code / Paperclip Local App

export interface StatuspageComponent {
  /** Stable identifier used in JSON output and `--only <id>` filtering. */
  id: string;
  /** Human label shown in the grid. */
  label: string;
  category: ServiceStatusCategory;
  /**
   * true → outage on this component flips the overall level to "outage".
   * false → an outage is degrading but not catastrophic.
   */
  critical: boolean;
  /**
   * true → probe is only run when --super-admin is passed. Reserved for
   * probes that require elevated access, write checks, or deeper auditing.
   */
  superAdminOnly: boolean;
  /** Short explanatory text for --help / JSON consumers. */
  description: string;
}

export interface ServiceProbeResult {
  componentId: string;
  level: ServiceStatusLevel;
  summary: string;
  /** Measured round-trip latency in ms, when applicable. */
  latencyMs?: number;
  /** ISO timestamp. */
  lastCheckedAt: string;
  /** Structured detail for JSON consumers / debugging. */
  detail?: Record<string, unknown>;
}

export interface StatuspageReport {
  generatedAt: string;
  overallLevel: ServiceStatusLevel;
  summary: string;
  components: Array<StatuspageComponent & ServiceProbeResult>;
}

export interface StatuspageRunOptions {
  /** Include super-admin-only probes. */
  superAdmin?: boolean;
  /** Filter to a specific category. */
  onlyCategory?: ServiceStatusCategory;
  /** Filter to specific component ids. */
  onlyIds?: string[];
  /** Per-probe timeout in ms (default 5000). */
  perProbeTimeoutMs?: number;
}
