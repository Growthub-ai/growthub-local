/**
 * Fresh Chrome Browser Isolation for Agents
 *
 * Provides per-agent, per-issue browser session isolation. When enabled,
 * each agent/issue combination gets a completely fresh Chrome profile in an
 * isolated temp directory, eliminating cookie/state collisions between agents
 * or between issues for the same agent.
 *
 * Integration points:
 *   - `packages/shared/src/types/agent.ts` → `AgentRuntimeConfig.browserSession`
 *   - `server/src/services/heartbeat.ts` → injects extraArgs before adapter.execute()
 *   - `server/src/services/gtm-campaign-policy.ts` → propagates config to sub-issues
 *   - `ui/src/components/AgentConfigForm.tsx` → "Fresh Chrome per issue" toggle
 */

export interface BrowserSessionConfig {
  /** Spawn a fresh Chrome profile for every new issue. Default: true. */
  freshBrowserPerIssue: boolean;
  /** Spawn a fresh Chrome profile for every full agent session/run. Default: true. */
  freshBrowserPerSession: boolean;
  /** Optional prefix for the Chrome profile directory name. */
  chromeProfilePrefix?: string;
  /** Run Chrome headlessly. Default: true for background/unattended agents. */
  headless?: boolean;
}

export const DEFAULT_BROWSER_SESSION_CONFIG: BrowserSessionConfig = {
  freshBrowserPerIssue: true,
  freshBrowserPerSession: true,
  headless: true,
};

/**
 * Derive the isolated Chrome user-data-dir path for a given agent + issue run.
 *
 * The path is under /tmp so it is ephemeral across machine reboots and never
 * bleeds credentials from one agent/issue pair to another.
 */
export function resolveChromProfileDir(
  agentId: string,
  issueId: string | null,
  config: BrowserSessionConfig = DEFAULT_BROWSER_SESSION_CONFIG,
): string {
  const prefix = config.chromeProfilePrefix ?? "growthub-agent";
  const issueSegment = issueId ? `-issue-${issueId}` : "";
  return `/tmp/growthub-chrome-profiles/${prefix}-${agentId}${issueSegment}`;
}

/**
 * Build the extra CLI args that should be appended to the adapter's `extraArgs`
 * when browser session isolation is active.
 *
 * These args are passed directly to the Claude `--chrome` subprocess and tell
 * Chromium to use an isolated profile with no shared state.
 */
export function buildFreshChromeArgs(profileDir: string): string[] {
  return [
    `--user-data-dir=${profileDir}`,
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-extensions",
  ];
}

/**
 * Determine whether a fresh browser session should be spun up for this run.
 *
 * Returns the resolved profileDir when a fresh session is needed, or null
 * when browser isolation is not configured for this agent.
 */
export function resolveFreshBrowserSession(input: {
  agentId: string;
  issueId: string | null;
  config: BrowserSessionConfig | null | undefined;
}): { profileDir: string } | null {
  const { agentId, issueId, config } = input;
  if (!config) return null;
  if (!config.freshBrowserPerIssue && !config.freshBrowserPerSession) return null;

  const profileDir = resolveChromProfileDir(agentId, issueId, config);
  return { profileDir };
}

/**
 * Parse a raw runtimeConfig.browserSession value (from the DB, which is
 * `Record<string, unknown>`) into a typed BrowserSessionConfig or null.
 */
export function parseBrowserSessionConfig(
  raw: unknown,
): BrowserSessionConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  // A browserSession block must have at least one explicit boolean key to be
  // considered intentional — otherwise treat as absent (safe default).
  if (
    typeof obj.freshBrowserPerIssue !== "boolean" &&
    typeof obj.freshBrowserPerSession !== "boolean"
  ) {
    return null;
  }

  return {
    freshBrowserPerIssue:
      typeof obj.freshBrowserPerIssue === "boolean"
        ? obj.freshBrowserPerIssue
        : DEFAULT_BROWSER_SESSION_CONFIG.freshBrowserPerIssue,
    freshBrowserPerSession:
      typeof obj.freshBrowserPerSession === "boolean"
        ? obj.freshBrowserPerSession
        : DEFAULT_BROWSER_SESSION_CONFIG.freshBrowserPerSession,
    chromeProfilePrefix:
      typeof obj.chromeProfilePrefix === "string"
        ? obj.chromeProfilePrefix
        : undefined,
    headless:
      typeof obj.headless === "boolean"
        ? obj.headless
        : DEFAULT_BROWSER_SESSION_CONFIG.headless,
  };
}
