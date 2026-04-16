/**
 * GitHub REST + device-flow client
 *
 * Thin, dependency-free wrapper around the GitHub REST API and OAuth device
 * flow endpoints. Enough surface to power:
 *   - `growthub github login`    (device flow + PAT fallback)
 *   - `growthub github whoami`
 *   - `growthub kit fork create` (one-click fork)
 *   - `growthub kit fork push`   (push heal branch + open PR)
 */

import type {
  CliGithubToken,
  CliGithubProfile,
  GithubDeviceFlowStart,
  GithubDeviceFlowPoll,
  GithubForkResult,
  GithubRepoRef,
} from "./types.js";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_OAUTH_BASE = "https://github.com";

/** Default OAuth client ID for the CLI. Override via GROWTHUB_GITHUB_CLIENT_ID. */
export const DEFAULT_GITHUB_CLIENT_ID = "growthub-cli-public";

export function resolveGithubClientId(): string {
  return process.env.GROWTHUB_GITHUB_CLIENT_ID?.trim() || DEFAULT_GITHUB_CLIENT_ID;
}

function authHeader(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": "growthub-cli",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// ---------------------------------------------------------------------------
// OAuth device flow
// ---------------------------------------------------------------------------

export async function startDeviceFlow(opts?: {
  clientId?: string;
  scope?: string[];
}): Promise<GithubDeviceFlowStart> {
  const clientId = opts?.clientId ?? resolveGithubClientId();
  const scope = (opts?.scope ?? ["repo", "read:user", "user:email"]).join(" ");

  const res = await fetch(`${GITHUB_OAUTH_BASE}/login/device/code`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "growthub-cli",
    },
    body: JSON.stringify({ client_id: clientId, scope }),
  });
  if (!res.ok) {
    throw new Error(`GitHub device flow init failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  return {
    deviceCode: String(body.device_code ?? ""),
    userCode: String(body.user_code ?? ""),
    verificationUri: String(body.verification_uri ?? ""),
    expiresInSec: Number(body.expires_in ?? 900),
    pollIntervalSec: Number(body.interval ?? 5),
  };
}

export async function pollDeviceFlow(deviceCode: string, opts?: {
  clientId?: string;
}): Promise<GithubDeviceFlowPoll> {
  const clientId = opts?.clientId ?? resolveGithubClientId();
  const res = await fetch(`${GITHUB_OAUTH_BASE}/login/oauth/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "growthub-cli",
    },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub device flow poll failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  const error = typeof body.error === "string" ? body.error : null;
  if (error === "authorization_pending") return { status: "pending" };
  if (error === "slow_down") {
    return { status: "slow_down", nextPollIntervalSec: Number(body.interval ?? 10) };
  }
  if (error === "expired_token") return { status: "expired" };
  if (error === "access_denied") return { status: "denied" };

  const accessToken = typeof body.access_token === "string" ? body.access_token : null;
  if (!accessToken) return { status: "pending" };

  const scopes = typeof body.scope === "string" ? body.scope.split(/[,\s]+/).filter(Boolean) : [];
  const token: CliGithubToken = {
    version: 1,
    accessToken,
    authMode: "device-flow",
    scopes,
    issuedAt: new Date().toISOString(),
  };
  return { status: "authorized", token };
}

// ---------------------------------------------------------------------------
// Authenticated user
// ---------------------------------------------------------------------------

export async function fetchAuthenticatedUser(accessToken: string): Promise<CliGithubProfile> {
  const res = await fetch(`${GITHUB_API_BASE}/user`, { headers: authHeader(accessToken) });
  if (!res.ok) {
    throw new Error(`GET /user failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  return {
    login: String(body.login ?? ""),
    userId: Number(body.id ?? 0),
    name: typeof body.name === "string" ? body.name : undefined,
    email: typeof body.email === "string" ? body.email : undefined,
    avatarUrl: typeof body.avatar_url === "string" ? body.avatar_url : undefined,
    refreshedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Repo / fork operations
// ---------------------------------------------------------------------------

export async function createFork(
  accessToken: string,
  opts: {
    upstream: GithubRepoRef;
    destinationOrg?: string;
    forkName?: string;
    defaultBranchOnly?: boolean;
  },
): Promise<GithubForkResult> {
  const body: Record<string, unknown> = {};
  if (opts.destinationOrg) body.organization = opts.destinationOrg;
  if (opts.forkName) body.name = opts.forkName;
  if (opts.defaultBranchOnly) body.default_branch_only = true;

  const res = await fetch(
    `${GITHUB_API_BASE}/repos/${opts.upstream.owner}/${opts.upstream.repo}/forks`,
    {
      method: "POST",
      headers: { ...authHeader(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok && res.status !== 202) {
    throw new Error(`Fork create failed: ${res.status} ${res.statusText}`);
  }
  const parsed = (await res.json()) as Record<string, unknown>;
  const owner = (parsed.owner as Record<string, unknown>)?.login as string;
  const name = parsed.name as string;
  return {
    fork: { owner, repo: name },
    cloneUrl: String(parsed.clone_url ?? `https://github.com/${owner}/${name}.git`),
    htmlUrl: String(parsed.html_url ?? `https://github.com/${owner}/${name}`),
    defaultBranch: String(parsed.default_branch ?? "main"),
  };
}

export async function openPullRequest(
  accessToken: string,
  opts: {
    repo: GithubRepoRef;
    head: string; // e.g. "octocat:feature-branch" or "feature-branch" for same-repo
    base: string;
    title: string;
    body?: string;
    draft?: boolean;
  },
): Promise<{ number: number; htmlUrl: string }> {
  const res = await fetch(
    `${GITHUB_API_BASE}/repos/${opts.repo.owner}/${opts.repo.repo}/pulls`,
    {
      method: "POST",
      headers: { ...authHeader(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({
        title: opts.title,
        head: opts.head,
        base: opts.base,
        body: opts.body ?? "",
        draft: opts.draft ?? true,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Open PR failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  return {
    number: Number(body.number ?? 0),
    htmlUrl: String(body.html_url ?? ""),
  };
}

/** Parse "owner/repo" or a full GitHub URL into a GithubRepoRef. */
export function parseRepoRef(raw: string): GithubRepoRef {
  const s = raw.trim();
  const urlMatch = s.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)(?:\.git)?$/i);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, "") };
  const slashMatch = s.match(/^([^\/\s]+)\/([^\/\s]+)$/);
  if (slashMatch) return { owner: slashMatch[1], repo: slashMatch[2].replace(/\.git$/, "") };
  throw new Error(`Unable to parse GitHub repo reference: ${raw}`);
}
