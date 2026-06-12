/**
 * Sandbox Local Agent Auth Onboarding V1 — server-side helper.
 *
 * Sandbox rows with `adapter: "local-agent-host"` route execution through
 * the thin host adapter at `lib/adapters/sandboxes/default-local-agent-host.js`.
 * That adapter is intentionally **execution-only**: it spawns the CLI and
 * captures stdout/stderr/exit code, and it does NOT manage host auth state.
 *
 * Auth setup is a separate concern — preparing the local CLI before a
 * sandbox row can run successfully. This helper is the workspace API
 * surface for that preflight. It is host-agnostic: the per-host commands
 * (login subcommand, logout subcommand, status probe) live in
 * `lib/sandbox-agent-host-catalog.js`. Adding a host means editing the
 * catalog — never extending this file.
 *
 * Responsibilities:
 *   - resolve a sandbox row by `objectId` + `name`
 *   - guard on adapter + agentHost + runLocality eligibility
 *   - resolve the binary (row override, defaults to the catalog default)
 *   - spawn the catalog-declared subcommands
 *   - capture stdout, stderr, login URL, exit code
 *   - redact anything token-shaped before returning to the browser
 *   - stamp ONLY safe metadata back onto the sandbox row:
 *
 *       agentAuthStatus         "active" | "reachable" | "stale" | "missing"
 *                              | "checking" | "unknown"
 *       agentAuthProvider       the host slug, e.g. "claude_local"
 *       agentAuthLastChecked    ISO timestamp
 *       agentAuthLastExitCode   number | null
 *       agentAuthLastMessage    short human-readable summary
 *       agentAuthLastLoginUrl   string | null (login URL if printed)
 *
 * Raw tokens NEVER touch `growthub.config.json`. The host CLI keeps its own
 * on-disk auth state; this module only records *readiness*, not secrets.
 *
 * The status semantics are deliberately conservative:
 *   - "active"    the selected pinned host CLI is callable and ready for the
 *                 local agent-host bridge, or a clean login exit completed
 *   - "reachable" legacy metadata value treated as active by the UI
 *   - "stale"    the binary printed auth-shaped failure output
 *   - "missing"  binary not found on PATH
 *
 * A successful host probe promotes to "active" because the sidecar represents
 * selected local host readiness, not provider-account auth semantics.
 */

import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  writeWorkspaceConfig
} from "@/lib/workspace-config";
import {
  DEFAULT_LOGIN_TIMEOUT_MS,
  DEFAULT_LOGOUT_TIMEOUT_MS,
  DEFAULT_PROBE_TIMEOUT_MS,
  getAgentHostCapabilities,
  getHostAuthSpec
} from "@/lib/sandbox-agent-host-catalog";
import {
  KNOWN_AGENT_AUTH_STATUSES,
  SAFE_ROW_PATCH_FIELDS,
  redactSecrets
} from "@/lib/sandbox-agent-auth-redaction";

const execFileAsync = promisify(execFile);

const MAX_CAPTURED_BYTES = 64 * 1024;

// ──────────────────────────────────────────────────────────────────────────
// Resolution
// ──────────────────────────────────────────────────────────────────────────

function findSandboxRow(workspaceConfig, objectId, name) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  const object = objects.find(
    (entry) => entry?.id === objectId && entry?.objectType === "sandbox-environment"
  );
  if (!object) return { object: null, row: null, rowIndex: -1 };
  const wantedName = String(name || "").trim();
  const rows = Array.isArray(object.rows) ? object.rows : [];
  const rowIndex = rows.findIndex((row) => String(row?.Name || "").trim() === wantedName);
  if (rowIndex === -1) return { object, row: null, rowIndex: -1 };
  return { object, row: rows[rowIndex], rowIndex };
}

function assertAgentHostEligible(row, { requireLogin = false, requireLogout = false } = {}) {
  const adapter = String(row?.adapter || "").trim();
  if (adapter !== "local-agent-host") {
    const error = new Error(
      `Agent auth setup applies only to adapter "local-agent-host" (got "${adapter || "<unset>"}")`
    );
    error.code = "SANDBOX_AGENT_AUTH_ADAPTER_MISMATCH";
    throw error;
  }
  const runLocality = String(row?.runLocality || "").trim().toLowerCase();
  if (runLocality === "serverless") {
    const error = new Error(
      "Agent auth setup is not supported when runLocality is `serverless` — auth lives on the local machine."
    );
    error.code = "SANDBOX_AGENT_AUTH_LOCALITY_MISMATCH";
    throw error;
  }
  const agentHost = String(row?.agentHost || "").trim();
  const spec = getHostAuthSpec(agentHost);
  if (!spec) {
    const error = new Error(
      `Agent auth setup is not registered for agentHost "${agentHost || "<unset>"}"`
    );
    error.code = "SANDBOX_AGENT_AUTH_HOST_UNSUPPORTED";
    throw error;
  }
  if (requireLogin && !Array.isArray(spec.loginCommand)) {
    const error = new Error(
      `Host "${agentHost}" does not declare a documented login subcommand. ${spec.notes || "Sign in via the host CLI directly."}`
    );
    error.code = "SANDBOX_AGENT_AUTH_LOGIN_UNSUPPORTED";
    throw error;
  }
  if (requireLogout && !Array.isArray(spec.logoutCommand)) {
    const error = new Error(
      `Host "${agentHost}" does not declare a documented logout subcommand. ${spec.notes || "Sign out via the host CLI directly."}`
    );
    error.code = "SANDBOX_AGENT_AUTH_LOGOUT_UNSUPPORTED";
    throw error;
  }
  return { spec, agentHost };
}

function normalizeAgentHostOverride(agentHost) {
  const nextAgentHost = String(agentHost || "").trim();
  if (!nextAgentHost) return "";
  if (!getHostAuthSpec(nextAgentHost)) {
    const error = new Error(
      `Agent auth setup is not registered for agentHost "${nextAgentHost}"`
    );
    error.code = "SANDBOX_AGENT_AUTH_HOST_UNSUPPORTED";
    throw error;
  }
  return nextAgentHost;
}

function applyAgentHostOverride(row, agentHost) {
  if (!agentHost) return row;
  return {
    ...row,
    runLocality: "local",
    adapter: "local-agent-host",
    agentHost
  };
}

function buildAgentHostSelectionPatch(agentHost) {
  if (!agentHost) return {};
  return {
    runLocality: "local",
    adapter: "local-agent-host",
    agentHost
  };
}

function resolveHostBinary(row, spec) {
  const candidates = [row?.agentCommand, row?.claudeCommand];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return spec.binary;
}

function resolveCwd(row) {
  const cwd = row?.cwd;
  if (typeof cwd === "string" && cwd.trim()) return cwd.trim();
  return process.cwd();
}

// ──────────────────────────────────────────────────────────────────────────
// Output handling
//
// Redaction utilities live in `sandbox-agent-auth-redaction.js` so they can
// be imported without pulling in Next.js path-aliased modules — keeps the
// unit test surface lean.
// ──────────────────────────────────────────────────────────────────────────

function clampOutput(text) {
  if (typeof text !== "string") return "";
  if (text.length <= MAX_CAPTURED_BYTES) return text;
  const head = text.slice(0, MAX_CAPTURED_BYTES);
  return `${head}\n…\n[output truncated at ${MAX_CAPTURED_BYTES} bytes]`;
}

function extractLoginUrl(combined) {
  if (typeof combined !== "string" || !combined) return null;
  const match = combined.match(/https?:\/\/[^\s]+auth[^\s]*/)
    || combined.match(/https?:\/\/[^\s]+(?:login|oauth|sign[_-]?in)[^\s]*/i);
  return match ? match[0] : null;
}

// ──────────────────────────────────────────────────────────────────────────
// Status pattern recognition
// ──────────────────────────────────────────────────────────────────────────

const STALE_AUTH_PATTERNS = [
  /not\s+logged\s+in/i,
  /login\s+required/i,
  /authentication\s+required/i,
  /please\s+(?:log\s+in|sign\s+in)/i,
  /run\s+[`'"]?[a-z][a-z0-9_-]*\s+auth\s+login/i,
  /unauthorized/i,
  /invalid\s+credentials/i,
  /session\s+expired/i
];

const ACTIVE_AUTH_PATTERNS = [
  /logged\s+in\s+as/i,
  /authenticated\s+as/i,
  /session\s+active/i,
  /auth(?:entication)?\s+ok/i
];

const UNKNOWN_SUBCOMMAND_PATTERNS = [
  /unknown\s+(?:command|subcommand|option)/i,
  /did\s+you\s+mean/i,
  /no\s+such\s+command/i,
  /invalid\s+command/i,
  /usage:/i
];

function hasAny(patterns, text) {
  if (!text) return false;
  return patterns.some((p) => p.test(text));
}

function deriveStatusFromAuthStatusJson(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && typeof parsed.loggedIn === "boolean") {
      return parsed.loggedIn ? "active" : "stale";
    }
  } catch {}
  return null;
}

function deriveStatusFromAuthStatusProbe({ exitCode, stdout = "", stderr = "", spawnError }) {
  if (spawnError) return spawnError.notFound ? "missing" : null;
  const combined = `${stdout}\n${stderr}`;
  const jsonStatus = deriveStatusFromAuthStatusJson(stdout) || deriveStatusFromAuthStatusJson(stderr);
  if (jsonStatus) return jsonStatus;
  if (hasAny(UNKNOWN_SUBCOMMAND_PATTERNS, combined)) return null; // fall back
  if (hasAny(STALE_AUTH_PATTERNS, combined)) return "stale";
  if (exitCode === 0) return "active";
  if (typeof exitCode === "number" && exitCode !== 0) {
    return hasAny(STALE_AUTH_PATTERNS, combined) ? "stale" : null;
  }
  return null;
}

function deriveStatusFromVersionProbe({ exitCode, stderr, spawnError }) {
  if (spawnError) return spawnError.notFound ? "missing" : "unknown";
  if (typeof exitCode === "number" && exitCode === 0) return "active";
  const text = String(stderr || "");
  if (hasAny(STALE_AUTH_PATTERNS, text)) return "stale";
  return "unknown";
}

function deriveLoginStatus({ exitCode, stderr, stdout, timedOut, spawnError }) {
  if (spawnError) return spawnError.notFound ? "missing" : "unknown";
  if (timedOut) return "unknown";
  if (typeof exitCode === "number" && exitCode === 0) return "active";
  const combined = `${stdout || ""}\n${stderr || ""}`;
  if (hasAny(STALE_AUTH_PATTERNS, combined)) return "stale";
  return "stale";
}

function shortMessage({ status, label, exitCode, error, loginUrl }) {
  const name = label || "Local agent CLI";
  if (error) return `${name}: ${redactSecrets(String(error))}`;
  if (status === "active") return loginUrl ? "Login completed." : "Active.";
  if (status === "reachable") return "Active.";
  if (status === "stale") return "Authentication needs setup. Run Login, then run the sandbox again.";
  if (status === "missing") return `${name} not found. Install it and try again.`;
  if (status === "checking") return `Checking ${name}…`;
  if (typeof exitCode === "number") return `${name} exited with code ${exitCode}.`;
  return "Not checked yet. Run Check or Login.";
}

// ──────────────────────────────────────────────────────────────────────────
// Process orchestration
// ──────────────────────────────────────────────────────────────────────────

function runCommand({ binary, args, cwd, timeoutMs, stdin }) {
  return new Promise((resolve) => {
    let stdoutBuf = "";
    let stderrBuf = "";
    let timedOut = false;
    let resolved = false;
    let child;

    try {
      child = spawn(binary, args, {
        cwd,
        stdio: stdin === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
        env: { ...process.env }
      });
    } catch (error) {
      resolve({
        exitCode: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        spawnError: {
          message: error?.message || `failed to spawn ${binary}`,
          notFound: error?.code === "ENOENT"
        }
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGKILL"); } catch {}
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      if (stdoutBuf.length < MAX_CAPTURED_BYTES) stdoutBuf += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      if (stderrBuf.length < MAX_CAPTURED_BYTES) stderrBuf += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve({
        exitCode: null,
        stdout: stdoutBuf,
        stderr: stderrBuf,
        timedOut,
        spawnError: {
          message: error?.message || "spawn failed",
          notFound: error?.code === "ENOENT"
        }
      });
    });

    child.on("close", (exitCode) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve({
        exitCode: typeof exitCode === "number" ? exitCode : null,
        stdout: stdoutBuf,
        stderr: stderrBuf,
        timedOut,
        spawnError: null
      });
    });

    if (stdin !== undefined) {
      try { child.stdin.end(stdin); } catch {}
    }
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Public API — login / logout / status
// ──────────────────────────────────────────────────────────────────────────

async function runAgentLogin({ objectId, name, agentHost }) {
  const workspaceConfig = await readWorkspaceConfig();
  const { object, row, rowIndex } = findSandboxRow(workspaceConfig, objectId, name);
  if (!object) throw notFoundError(`no sandbox-environment object with id ${objectId}`);
  if (!row) throw notFoundError(`no sandbox row named ${name} in object ${objectId}`);

  const selectedAgentHost = normalizeAgentHostOverride(agentHost);
  const effectiveRow = applyAgentHostOverride(row, selectedAgentHost);
  const { spec, agentHost: effectiveAgentHost } = assertAgentHostEligible(effectiveRow, { requireLogin: true });

  const binary = resolveHostBinary(effectiveRow, spec);
  const cwd = resolveCwd(effectiveRow);
  const startedAt = Date.now();

  const result = await runCommand({
    binary,
    args: spec.loginCommand,
    cwd,
    timeoutMs: spec.loginTimeoutMs || DEFAULT_LOGIN_TIMEOUT_MS
  });

  const stdout = clampOutput(redactSecrets(result.stdout));
  const stderr = clampOutput(redactSecrets(result.stderr));
  const loginUrl = extractLoginUrl(`${result.stdout || ""}\n${result.stderr || ""}`);
  const status = deriveLoginStatus(result);
  const checkedAt = new Date().toISOString();

  const patch = buildRowPatch({
    status,
    provider: effectiveAgentHost,
    checkedAt,
    exitCode: result.exitCode,
    loginUrl,
    label: spec.label,
    spawnError: result.spawnError
  });
  Object.assign(patch, buildAgentHostSelectionPatch(selectedAgentHost));

  await applyRowPatch({ workspaceConfig, object, rowIndex, patch });

  return {
    ok: status === "active",
    status,
    provider: effectiveAgentHost,
    label: spec.label,
    binary,
    cwd,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: Date.now() - startedAt,
    stdout,
    stderr,
    loginUrl,
    message: patch.agentAuthLastMessage,
    checkedAt
  };
}

async function runAgentLogout({ objectId, name, agentHost }) {
  const workspaceConfig = await readWorkspaceConfig();
  const { object, row, rowIndex } = findSandboxRow(workspaceConfig, objectId, name);
  if (!object) throw notFoundError(`no sandbox-environment object with id ${objectId}`);
  if (!row) throw notFoundError(`no sandbox row named ${name} in object ${objectId}`);

  const selectedAgentHost = normalizeAgentHostOverride(agentHost);
  const effectiveRow = applyAgentHostOverride(row, selectedAgentHost);
  const { spec, agentHost: effectiveAgentHost } = assertAgentHostEligible(effectiveRow, { requireLogout: true });

  const binary = resolveHostBinary(effectiveRow, spec);
  const cwd = resolveCwd(effectiveRow);
  const startedAt = Date.now();

  let exitCode = null;
  let stdout = "";
  let stderr = "";
  let spawnError = null;
  try {
    const { stdout: out, stderr: err } = await execFileAsync(binary, spec.logoutCommand, {
      cwd,
      timeout: DEFAULT_LOGOUT_TIMEOUT_MS
    });
    exitCode = 0;
    stdout = out || "";
    stderr = err || "";
  } catch (error) {
    exitCode = typeof error?.code === "number" ? error.code : null;
    stdout = error?.stdout || "";
    stderr = error?.stderr || error?.message || "";
    if (error?.code === "ENOENT") {
      spawnError = { message: stderr, notFound: true };
    }
  }

  const status = spawnError?.notFound ? "missing" : "stale";
  const checkedAt = new Date().toISOString();

  const patch = buildRowPatch({
    status,
    provider: effectiveAgentHost,
    checkedAt,
    exitCode,
    loginUrl: null,
    label: spec.label,
    spawnError
  });
  patch.agentAuthLastMessage = spawnError?.notFound
    ? shortMessage({ status: "missing", label: spec.label })
    : `${spec.label} logged out — auth will be required before next run.`;
  Object.assign(patch, buildAgentHostSelectionPatch(selectedAgentHost));

  await applyRowPatch({ workspaceConfig, object, rowIndex, patch });

  return {
    ok: !spawnError,
    status,
    provider: effectiveAgentHost,
    label: spec.label,
    binary,
    cwd,
    exitCode,
    durationMs: Date.now() - startedAt,
    stdout: clampOutput(redactSecrets(stdout)),
    stderr: clampOutput(redactSecrets(stderr)),
    message: patch.agentAuthLastMessage,
    checkedAt
  };
}

async function checkAgentStatus({ objectId, name, agentHost }) {
  const workspaceConfig = await readWorkspaceConfig();
  const { object, row, rowIndex } = findSandboxRow(workspaceConfig, objectId, name);
  if (!object) throw notFoundError(`no sandbox-environment object with id ${objectId}`);
  if (!row) throw notFoundError(`no sandbox row named ${name} in object ${objectId}`);

  const selectedAgentHost = normalizeAgentHostOverride(agentHost);
  const effectiveRow = applyAgentHostOverride(row, selectedAgentHost);
  const { spec, agentHost: effectiveAgentHost } = assertAgentHostEligible(effectiveRow);

  const binary = resolveHostBinary(effectiveRow, spec);
  const cwd = resolveCwd(effectiveRow);

  // Two-phase probe:
  //   1. If the catalog declares an auth-status subcommand, try it first.
  //      A clean exit lets us label the row as "active".
  //   2. Always fall back to the catalog versionProbe — exit 0 maps to
  //      "reachable", NEVER "active". This is the same contract for every
  //      host so the UI mental model stays uniform.
  let status = null;
  let usedProbe = "version";
  let usedResult = null;

  if (Array.isArray(spec.authStatusProbe) && spec.authStatusProbe.length) {
    const authStatusResult = await runCommand({
      binary,
      args: spec.authStatusProbe,
      cwd,
      timeoutMs: DEFAULT_PROBE_TIMEOUT_MS
    });
    status = deriveStatusFromAuthStatusProbe(authStatusResult);
    if (status !== null) {
      usedProbe = "auth-status";
      usedResult = authStatusResult;
    }
  }

  if (status === null) {
    const versionResult = await runCommand({
      binary,
      args: spec.versionProbe || ["--version"],
      cwd,
      timeoutMs: DEFAULT_PROBE_TIMEOUT_MS
    });
    status = deriveStatusFromVersionProbe(versionResult);
    usedResult = versionResult;
  }

  const checkedAt = new Date().toISOString();
  const stdout = clampOutput(redactSecrets(usedResult.stdout));
  const stderr = clampOutput(redactSecrets(usedResult.stderr));

  const patch = buildRowPatch({
    status,
    provider: effectiveAgentHost,
    checkedAt,
    exitCode: usedResult.exitCode,
    loginUrl: null,
    label: spec.label,
    spawnError: usedResult.spawnError
  });
  Object.assign(patch, buildAgentHostSelectionPatch(selectedAgentHost));

  await applyRowPatch({ workspaceConfig, object, rowIndex, patch });

  return {
    ok: status === "active",
    status,
    provider: effectiveAgentHost,
    label: spec.label,
    binary,
    cwd,
    exitCode: usedResult.exitCode,
    probe: usedProbe,
    stdout,
    stderr,
    message: patch.agentAuthLastMessage,
    checkedAt
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Row patch — safe metadata only
// ──────────────────────────────────────────────────────────────────────────

function buildRowPatch({ status, provider, checkedAt, exitCode, loginUrl, label, spawnError }) {
  const safe = {
    agentAuthStatus: KNOWN_AGENT_AUTH_STATUSES.includes(status) ? status : "unknown",
    agentAuthProvider: String(provider || "").trim() || "unknown",
    agentAuthLastChecked: checkedAt,
    agentAuthLastExitCode: typeof exitCode === "number" ? exitCode : null,
    agentAuthLastMessage: shortMessage({
      status,
      label,
      exitCode,
      loginUrl,
      error: spawnError?.message
    }),
    agentAuthLastLoginUrl: loginUrl || ""
  };
  for (const key of Object.keys(safe)) {
    if (!SAFE_ROW_PATCH_FIELDS.includes(key)) delete safe[key];
  }
  return safe;
}

async function applyRowPatch({ workspaceConfig, object, rowIndex, patch }) {
  const persistence = describePersistenceMode();
  if (!persistence.canSave) return false;
  try {
    const objects = Array.isArray(workspaceConfig.dataModel?.objects)
      ? workspaceConfig.dataModel.objects
      : [];
    const nextObjects = objects.map((entry) => {
      if (entry.id !== object.id) return entry;
      const rows = Array.isArray(entry.rows) ? entry.rows : [];
      const nextRows = rows.map((existingRow, index) => {
        if (index !== rowIndex) return existingRow;
        return { ...existingRow, ...patch };
      });
      return { ...entry, rows: nextRows };
    });
    await writeWorkspaceConfig({
      dataModel: { ...(workspaceConfig.dataModel || {}), objects: nextObjects }
    });
    return true;
  } catch {
    return false;
  }
}

function notFoundError(message) {
  const error = new Error(message);
  error.code = "SANDBOX_AGENT_AUTH_NOT_FOUND";
  return error;
}

// ──────────────────────────────────────────────────────────────────────────
// Workspace Metadata Graph V1 — safe agent host readiness metadata.
//
// Pure helper that distills a sandbox row into the safe metadata the
// workspace metadata graph + UI inspector can show. Reads ONLY the safe,
// allowlisted readiness fields the auth helper persists on the row. Never
// echoes raw tokens, login URLs, or stdout/stderr — those live inside the
// helper's response object, not the row patch.
// ──────────────────────────────────────────────────────────────────────────

function describeAgentHostReadinessMetadata(row) {
  if (!row || typeof row !== "object") return null;
  const adapter = String(row?.adapter || "").trim();
  const agentHost = String(row?.agentHost || "").trim();
  const runLocality = String(row?.runLocality || "").trim();
  const safe = {};
  for (const key of SAFE_ROW_PATCH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      safe[key] = row[key];
    }
  }
  return {
    kind: "workspaceAgentHostReadiness",
    adapter,
    agentHost,
    runLocality,
    status: KNOWN_AGENT_AUTH_STATUSES.includes(safe.agentAuthStatus) ? safe.agentAuthStatus : "unknown",
    provider: String(safe.agentAuthProvider || agentHost || "unknown").trim(),
    lastChecked: String(safe.agentAuthLastChecked || "").trim(),
    lastExitCode: typeof safe.agentAuthLastExitCode === "number" ? safe.agentAuthLastExitCode : null,
    lastMessage: String(safe.agentAuthLastMessage || "").trim(),
    lastLoginUrl: String(safe.agentAuthLastLoginUrl || "").trim()
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Backwards-compatible Claude aliases (legacy)
// ──────────────────────────────────────────────────────────────────────────

const runClaudeLogin = runAgentLogin;
const runClaudeLogout = runAgentLogout;
const checkClaudeStatus = checkAgentStatus;
function assertClaudeLocalEligible(row) {
  const { spec, agentHost } = assertAgentHostEligible(row);
  if (agentHost !== "claude_local") {
    const error = new Error(
      `Expected agentHost "claude_local", got "${agentHost}"`
    );
    error.code = "SANDBOX_AGENT_AUTH_HOST_MISMATCH";
    throw error;
  }
  return { spec, agentHost };
}
function resolveClaudeBinary(row) {
  const spec = getHostAuthSpec(String(row?.agentHost || "claude_local").trim()) || getHostAuthSpec("claude_local");
  return resolveHostBinary(row, spec);
}

export {
  KNOWN_AGENT_AUTH_STATUSES,
  SAFE_ROW_PATCH_FIELDS,
  assertAgentHostEligible,
  assertClaudeLocalEligible,
  buildRowPatch,
  checkAgentStatus,
  checkClaudeStatus,
  describeAgentHostReadinessMetadata,
  findSandboxRow,
  getAgentHostCapabilities,
  redactSecrets,
  resolveCwd,
  resolveHostBinary,
  resolveClaudeBinary,
  runAgentLogin,
  runAgentLogout,
  runClaudeLogin,
  runClaudeLogout
};
