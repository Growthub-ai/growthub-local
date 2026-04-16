/**
 * GitHub integration — canonical types.
 *
 * First-party native GitHub surface powering one-click fork creation, remote
 * synchronisation, and PR-based heal publication for the Fork Sync Agent.
 */

export type GithubAuthMode = "device-flow" | "pat" | "env";

export interface CliGithubToken {
  version: 1;
  /** OAuth access token or personal access token. */
  accessToken: string;
  /** How the token was obtained — informational only. */
  authMode: GithubAuthMode;
  /** OAuth scopes granted (when known). */
  scopes: string[];
  /** Authenticated login (e.g. "octocat"). */
  login?: string;
  /** Numeric GitHub user id, if resolved at auth time. */
  userId?: number;
  /** ISO issuance timestamp. */
  issuedAt: string;
  /** ISO expiration, when known. GitHub PATs can be infinite. */
  expiresAt?: string;
}

export interface CliGithubProfile {
  login: string;
  userId: number;
  name?: string;
  email?: string;
  avatarUrl?: string;
  defaultOrg?: string;
  refreshedAt: string;
}

export interface GithubRepoRef {
  owner: string;
  repo: string;
}

export interface GithubForkSpec {
  /** Upstream repo we are forking from. */
  upstream: GithubRepoRef;
  /** Override destination (defaults to auth user's account). */
  destinationOrg?: string;
  /** Rename the fork at creation time. */
  forkName?: string;
  /** Fork only the default branch if true (GitHub option). */
  defaultBranchOnly?: boolean;
}

export interface GithubForkResult {
  fork: GithubRepoRef;
  /** Git clone URL of the fork. */
  cloneUrl: string;
  /** HTML URL for browser view. */
  htmlUrl: string;
  /** Default branch name on the fork. */
  defaultBranch: string;
}

export interface GithubDeviceFlowStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresInSec: number;
  pollIntervalSec: number;
}

export interface GithubDeviceFlowPoll {
  status: "pending" | "slow_down" | "authorized" | "expired" | "denied";
  token?: CliGithubToken;
  nextPollIntervalSec?: number;
}
