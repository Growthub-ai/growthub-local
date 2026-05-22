/**
 * Local agent host capability catalog — auth onboarding side.
 *
 * The execution catalog lives in
 * `lib/adapters/sandboxes/default-local-agent-host.js` (HOST_CATALOG). That
 * one is intentionally minimal — `{ binary, argv, inputMode, installHint }`
 * — so the thin adapter can spawn the CLI and capture stdout/stderr without
 * knowing anything about auth state.
 *
 * This catalog is the **auth onboarding sidecar** mirror. For each canonical
 * host slug it declares:
 *
 *   label            human-readable name surfaced in the sandbox sidecar.
 *   binary           default binary to invoke when the row has no override.
 *   installHint      verbatim install hint, identical to the execution
 *                    catalog so the UI does not drift.
 *   versionProbe     argv used as a cheap reachability check. Exit 0 → CLI
 *                    is installed and callable. NEVER promotes to "active";
 *                    only "reachable".
 *   authStatusProbe  (optional) argv that the CLI exposes to report current
 *                    auth state. Exit 0 → "active". Stale-pattern output →
 *                    "stale". Unknown-subcommand output → fall back to
 *                    versionProbe.
 *   loginCommand     (optional) argv that opens an interactive (or
 *                    URL-printing) login flow.
 *   logoutCommand    (optional) argv that clears the CLI's on-disk session.
 *   loginTimeoutMs   override for the login subprocess timeout.
 *   notes            user-facing note explaining why login may be missing
 *                    for a host we do not have a documented login flow for.
 *
 * Hosts where we do not have authoritative knowledge of a login subcommand
 * intentionally OMIT `loginCommand` / `logoutCommand`. The UI then surfaces
 * only the reachability probe and the install hint — we never invent a
 * subcommand we cannot verify against the upstream tool.
 *
 * Adding a new host:
 *   1. Add a slug to `KNOWN_SANDBOX_AGENT_HOSTS` in `workspace-schema.js`.
 *   2. Add the corresponding execution entry to `HOST_CATALOG` in
 *      `default-local-agent-host.js`.
 *   3. Add the corresponding auth onboarding entry here. If the host has no
 *      documented login subcommand, ship it with only `versionProbe` + a
 *      `notes` string.
 */

const DEFAULT_LOGIN_TIMEOUT_MS = 300_000;
const DEFAULT_LOGOUT_TIMEOUT_MS = 10_000;
const DEFAULT_PROBE_TIMEOUT_MS = 10_000;

const HOST_AUTH_CATALOG = Object.freeze({
  claude_local: {
    label: "Claude Code (local)",
    binary: "claude",
    installHint: "Install Claude Code: npm i -g @anthropic-ai/claude-code",
    versionProbe: ["--version"],
    authStatusProbe: ["auth", "status"],
    loginCommand: ["auth", "login"],
    logoutCommand: ["auth", "logout"],
    loginTimeoutMs: DEFAULT_LOGIN_TIMEOUT_MS,
    notes: ""
  },
  codex_local: {
    label: "Codex CLI (local)",
    binary: "codex",
    installHint: "Install Codex CLI: npm i -g @openai/codex",
    versionProbe: ["--version"],
    notes: "Codex CLI manages its own credentials. If runs fail with auth errors, sign in via the Codex CLI directly on this machine."
  },
  cursor: {
    label: "Cursor Agent (local)",
    binary: "cursor-agent",
    installHint: "Install Cursor Agent CLI: curl https://cursor.com/install -fsS | bash",
    versionProbe: ["--version"],
    notes: "Cursor Agent uses the Cursor app session. Sign in via the Cursor app or its CLI directly."
  },
  gemini_local: {
    label: "Gemini CLI (local)",
    binary: "gemini",
    installHint: "Install Gemini CLI: npm i -g @google/gemini-cli",
    versionProbe: ["--version"],
    notes: "Gemini CLI authenticates via Google. Run `gemini auth login` (or your distribution's documented flow) directly on this machine."
  },
  opencode_local: {
    label: "OpenCode (local)",
    binary: "opencode",
    installHint: "Install OpenCode: npm i -g opencode-ai",
    versionProbe: ["--version"],
    notes: "OpenCode credentials are managed by its own CLI. Follow your OpenCode distribution's login flow."
  },
  pi_local: {
    label: "Pi (local)",
    binary: "pi",
    installHint: "Install Pi CLI: refer to your Paperclip Pi distribution",
    versionProbe: ["--version"],
    notes: "Pi credentials are managed by its own CLI. Follow your Pi distribution's login flow."
  },
  qwen_local: {
    label: "Qwen Code (local)",
    binary: "qwen",
    installHint: "Install Qwen Code CLI: refer to your Qwen distribution",
    versionProbe: ["--version"],
    notes: "Qwen Code manages credentials directly. Follow your Qwen distribution's login flow."
  },
  hermes_local: {
    label: "Hermes Paperclip (local)",
    binary: "hermes",
    installHint: "Install Hermes Paperclip adapter: npm i -g hermes-paperclip-adapter",
    versionProbe: ["--version"],
    notes: "Hermes uses its own session store. Follow the Hermes adapter's documented login flow."
  },
  openclaw_gateway: {
    label: "OpenClaw Gateway (local)",
    binary: "openclaw",
    installHint: "Install OpenClaw Gateway: refer to your Paperclip distribution",
    versionProbe: ["--version"],
    notes: "OpenClaw Gateway uses its own credentials store. Follow your OpenClaw distribution's login flow."
  }
});

const KNOWN_HOST_AUTH_SLUGS = Object.freeze(Object.keys(HOST_AUTH_CATALOG));

function getHostAuthSpec(slug) {
  return HOST_AUTH_CATALOG[String(slug || "").trim()] || null;
}

/**
 * Returns the capability flags the UI needs to decide which buttons to show
 * for a row. Always safe to call — returns `null` for unknown / non-eligible
 * rows so the caller can fall back to a no-panel state.
 */
function getAgentHostCapabilities(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const adapter = String(row.adapter || "").trim();
  const agentHost = String(row.agentHost || "").trim();
  const runLocality = String(row.runLocality || "").trim().toLowerCase();
  if (adapter !== "local-agent-host") return null;
  if (runLocality === "serverless") return null;
  const spec = getHostAuthSpec(agentHost);
  if (!spec) return null;
  return {
    slug: agentHost,
    label: spec.label,
    binary: spec.binary,
    installHint: spec.installHint,
    notes: spec.notes || "",
    canCheckStatus: true,
    canLogin: Array.isArray(spec.loginCommand) && spec.loginCommand.length > 0,
    canLogout: Array.isArray(spec.logoutCommand) && spec.logoutCommand.length > 0,
    hasAuthStatusProbe: Array.isArray(spec.authStatusProbe) && spec.authStatusProbe.length > 0
  };
}

export {
  DEFAULT_LOGIN_TIMEOUT_MS,
  DEFAULT_LOGOUT_TIMEOUT_MS,
  DEFAULT_PROBE_TIMEOUT_MS,
  HOST_AUTH_CATALOG,
  KNOWN_HOST_AUTH_SLUGS,
  getAgentHostCapabilities,
  getHostAuthSpec
};
