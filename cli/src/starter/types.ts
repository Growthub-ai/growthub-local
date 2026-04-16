/**
 * Growthub Custom Workspace Starter — canonical types.
 *
 * The starter is a thin orchestration adapter over already-shipping
 * primitives. It introduces no new transport, no new storage location, and
 * no new auth primitive — it composes the bundled kit catalog, the
 * Self-Healing Fork Sync Agent registry/policy/trace, and optionally the
 * first-party GitHub integration.
 */

export interface StarterInitOptions {
  /** Source kit id to scaffold from. Defaults to `growthub-custom-workspace-starter-v1`. */
  kitId?: string;
  /** Destination directory. Will be created if it does not exist. */
  out: string;
  /** Human label for the resulting fork (defaults to basename of `out`). */
  name?: string;
  /** Upstream GitHub repo to create a remote fork against (owner/repo). */
  upstream?: string;
  /** Destination org for the GitHub fork, when applicable. */
  destinationOrg?: string;
  /** Override the created GitHub fork name. */
  forkName?: string;
  /**
   * Initial remote-sync mode to seed into policy.json.
   *   - "off"    (default) — purely local workspace
   *   - "branch" — push heal branches, no PR
   *   - "pr"     — push heal branches + open draft PR
   */
  remoteSyncMode?: "off" | "branch" | "pr";
  /** Emit machine-readable JSON output. */
  json?: boolean;
}

export interface StarterInitResult {
  kitId: string;
  forkId: string;
  forkPath: string;
  baseVersion: string;
  policyMode: "off" | "branch" | "pr";
  remote?: {
    owner: string;
    repo: string;
    htmlUrl: string;
    defaultBranch: string;
  };
}
