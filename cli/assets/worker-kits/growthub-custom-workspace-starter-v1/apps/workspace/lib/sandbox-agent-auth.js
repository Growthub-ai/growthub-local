/**
 * Sandbox Claude Local Auth Onboarding V1 — server-side helper.
 *
 * Sandbox rows with `adapter: "local-agent-host"` + `agentHost: "claude_local"`
 * route through the local Claude CLI on the operator's machine. The host
 * adapter at `lib/adapters/sandboxes/default-local-agent-host.js` is
 * intentionally **execution-only**: it spawns the CLI and captures
 * stdout/stderr/exit code, and it does NOT manage host auth state, model
 * selection, or context window.
 *
 * Claude auth setup is a separate concern — preparing the local CLI before a
 * sandbox row can run successfully. This helper is the workspace API surface
 * for that preflight:
 *
 *   - resolve a sandbox row by `objectId` + `name`
 *   - guard on adapter + agentHost eligibility
 *   - resolve the Claude binary path (row override, defaults to `claude` on PATH)
 *   - spawn `claude auth login` / `claude auth logout` exactly the same way
 *     the upstream Paperclip server route does in `server/src/routes/agents.ts`
 *   - capture stdout, stderr, login URL, exit code
 *   - redact anything token-shaped before returning to the browser
 *   - stamp ONLY safe metadata back onto the sandbox row:
 *
 *       agentAuthStatus         "active" | "stale" | "missing" | "checking" | "unknown"
 *       agentAuthProvider       "claude_local"
 *       agentAuthLastChecked    ISO timestamp
 *       agentAuthLastExitCode   number | null
 *       agentAuthLastMessage    short human-readable summary
 *       agentAuthLastLoginUrl   string | null (login URL if present in CLI output)
 *
 * Raw tokens NEVER touch `growthub.config.json`. The local Claude CLI keeps
 * its own auth state on disk (under `~/.claude/...` typically); this module
 * only records *readiness*, not secret material.
 *
 * The auth command catalog is small but kept abstract so a fork can swap in
 * a non-default subcommand by editing this one file rather than chasing
 * spawn calls across the codebase. The repo source-of-truth on `main` is
 * `claude auth login` / `claude auth logout`.
 */

import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  writeWorkspaceConfig
} from "@/lib/workspace-config";

const execFileAsync = promisify(execFile);

const CLAUDE_AUTH_PROVIDER = "claude_local";
const CLAUDE_DEFAULT_BINARY = "claude";
const CLAUDE_INSTALL_HINT = "Install Claude Code: npm i -g @anthropic-ai/claude-code";

const CLAUDE_AUTH_COMMANDS = Object.freeze({
  login: ["auth", "login"],
  logout: ["auth", "logout"],
  status: ["--version"]
});

const LOGIN_TIMEOUT_MS = 300_000;
const LOGOUT_TIMEOUT_MS = 10_000;
const STATUS_TIMEOUT_MS = 10_000;
const MAX_CAPTURED_BYTES = 64 * 1024;

const KNOWN_AGENT_AUTH_STATUSES = Object.freeze([
  "active",
  "stale",
  "missing",
  "checking",
  "unknown"
]);

const SAFE_ROW_PATCH_FIELDS = Object.freeze([
  "agentAuthStatus",
  "agentAuthProvider",
  "agentAuthLastChecked",
  "agentAuthLastExitCode",
  "agentAuthLastMessage",
  "agentAuthLastLoginUrl"
]);

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

function assertClaudeLocalEligible(row) {
  const adapter = String(row?.adapter || "").trim();
  if (adapter !== "local-agent-host") {
    const error = new Error(
      `Claude auth setup applies only to adapter "local-agent-host" (got "${adapter || "<unset>"}")`
    );
    error.code = "SANDBOX_AGENT_AUTH_ADAPTER_MISMATCH";
    throw error;
  }
  const agentHost = String(row?.agentHost || "").trim();
  if (agentHost !== "claude_local") {
    const error = new Error(
      `Claude auth setup applies only to agentHost "claude_local" (got "${agentHost || "<unset>"}")`
    );
    error.code = "SANDBOX_AGENT_AUTH_HOST_MISMATCH";
    throw error;
  }
  const runLocality = String(row?.runLocality || "").trim().toLowerCase();
  if (runLocality === "serverless") {
    const error = new Error(
      "Claude auth setup is not supported when runLocality is `serverless` — auth lives on the local machine."
    );
    error.code = "SANDBOX_AGENT_AUTH_LOCALITY_MISMATCH";
    throw error;
  }
}

function resolveClaudeBinary(row) {
  const candidates = [
    row?.agentCommand,
    row?.claudeCommand,
    row?.command && row?.adapter === "local-agent-host" ? "" : null,
    null
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return CLAUDE_DEFAULT_BINARY;
}

function resolveCwd(row) {
  const cwd = row?.cwd;
  if (typeof cwd === "string" && cwd.trim()) return cwd.trim();
  return process.cwd();
}

// ──────────────────────────────────────────────────────────────────────────
// Redaction
// ──────────────────────────────────────────────────────────────────────────

// Patterns deliberately conservative — match common token shapes the Claude
// CLI might print on stdout/stderr and replace them before they cross the
// process boundary into the browser. We err on the side of redaction.
const TOKEN_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /Bearer\s+[A-Za-z0-9._-]{16,}/gi
];

function redactSecrets(text) {
  if (typeof text !== "string" || !text) return "";
  let next = text;
  for (const pattern of TOKEN_PATTERNS) {
    next = next.replace(pattern, "[redacted]");
  }
  return next;
}

function clampOutput(text) {
  if (typeof text !== "string") return "";
  if (text.length <= MAX_CAPTURED_BYTES) return text;
  const head = text.slice(0, MAX_CAPTURED_BYTES);
  return `${head}\n…\n[output truncated at ${MAX_CAPTURED_BYTES} bytes]`;
}

function extractLoginUrl(combined) {
  if (typeof combined !== "string" || !combined) return null;
  const match = combined.match(/https?:\/\/[^\s]+auth[^\s]*/);
  return match ? match[0] : null;
}

// ──────────────────────────────────────────────────────────────────────────
// Status derivation
// ──────────────────────────────────────────────────────────────────────────

function deriveLoginStatus({ exitCode, stderr, stdout, timedOut, spawnError }) {
  if (spawnError) return spawnError.notFound ? "missing" : "unknown";
  if (timedOut) return "unknown";
  if (typeof exitCode === "number" && exitCode === 0) return "active";
  const combined = `${stdout || ""}\n${stderr || ""}`.toLowerCase();
  if (combined.includes("not logged in") || combined.includes("login required")) return "stale";
  return "stale";
}

function deriveStatusFromProbe({ exitCode, stderr, spawnError }) {
  if (spawnError) return spawnError.notFound ? "missing" : "unknown";
  if (typeof exitCode === "number" && exitCode === 0) return "active";
  const text = String(stderr || "").toLowerCase();
  if (text.includes("not logged in") || text.includes("login required") || text.includes("authenticate")) {
    return "stale";
  }
  return "unknown";
}

function shortMessage({ status, exitCode, error, loginUrl }) {
  if (error) return `Claude CLI: ${error}`;
  if (status === "active") return loginUrl ? "Claude login completed" : "Claude CLI ready";
  if (status === "stale") return "Claude auth appears stale — run Claude login";
  if (status === "missing") return `Claude CLI not found on PATH. ${CLAUDE_INSTALL_HINT}`;
  if (status === "checking") return "Checking Claude CLI…";
  if (typeof exitCode === "number") return `Claude CLI exited with code ${exitCode}`;
  return "Claude CLI status unknown";
}

// ──────────────────────────────────────────────────────────────────────────
// Process orchestration
// ──────────────────────────────────────────────────────────────────────────

function runClaudeCommand({ binary, args, cwd, timeoutMs, stdin }) {
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

async function runClaudeLogin({ objectId, name }) {
  const workspaceConfig = await readWorkspaceConfig();
  const { object, row, rowIndex } = findSandboxRow(workspaceConfig, objectId, name);
  if (!object) throw notFoundError(`no sandbox-environment object with id ${objectId}`);
  if (!row) throw notFoundError(`no sandbox row named ${name} in object ${objectId}`);

  assertClaudeLocalEligible(row);

  const binary = resolveClaudeBinary(row);
  const cwd = resolveCwd(row);
  const startedAt = Date.now();

  const result = await runClaudeCommand({
    binary,
    args: CLAUDE_AUTH_COMMANDS.login,
    cwd,
    timeoutMs: LOGIN_TIMEOUT_MS
  });

  const stdout = clampOutput(redactSecrets(result.stdout));
  const stderr = clampOutput(redactSecrets(result.stderr));
  const loginUrl = extractLoginUrl(`${result.stdout || ""}\n${result.stderr || ""}`);
  const status = deriveLoginStatus(result);
  const checkedAt = new Date().toISOString();

  const patch = buildRowPatch({
    status,
    checkedAt,
    exitCode: result.exitCode,
    loginUrl,
    spawnError: result.spawnError
  });

  await applyRowPatch({ workspaceConfig, object, rowIndex, patch });

  return {
    ok: status === "active",
    status,
    binary,
    cwd,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: Date.now() - startedAt,
    stdout,
    stderr,
    loginUrl,
    message: shortMessage({ status, exitCode: result.exitCode, loginUrl, error: result.spawnError?.message }),
    checkedAt
  };
}

async function runClaudeLogout({ objectId, name }) {
  const workspaceConfig = await readWorkspaceConfig();
  const { object, row, rowIndex } = findSandboxRow(workspaceConfig, objectId, name);
  if (!object) throw notFoundError(`no sandbox-environment object with id ${objectId}`);
  if (!row) throw notFoundError(`no sandbox row named ${name} in object ${objectId}`);

  assertClaudeLocalEligible(row);

  const binary = resolveClaudeBinary(row);
  const cwd = resolveCwd(row);
  const startedAt = Date.now();

  let exitCode = null;
  let stdout = "";
  let stderr = "";
  let spawnError = null;
  try {
    const { stdout: out, stderr: err } = await execFileAsync(binary, CLAUDE_AUTH_COMMANDS.logout, {
      cwd,
      timeout: LOGOUT_TIMEOUT_MS
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
    checkedAt,
    exitCode,
    loginUrl: null,
    spawnError
  });
  patch.agentAuthLastMessage = spawnError?.notFound
    ? shortMessage({ status: "missing" })
    : "Claude logged out — auth will be required before next run";

  await applyRowPatch({ workspaceConfig, object, rowIndex, patch });

  return {
    ok: !spawnError,
    status,
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

async function checkClaudeStatus({ objectId, name }) {
  const workspaceConfig = await readWorkspaceConfig();
  const { object, row, rowIndex } = findSandboxRow(workspaceConfig, objectId, name);
  if (!object) throw notFoundError(`no sandbox-environment object with id ${objectId}`);
  if (!row) throw notFoundError(`no sandbox row named ${name} in object ${objectId}`);

  assertClaudeLocalEligible(row);

  const binary = resolveClaudeBinary(row);
  const cwd = resolveCwd(row);

  // `claude --version` is a cheap reachability + install probe. It does NOT
  // prove auth — only that the CLI binary is callable. We map exit-code 0 to
  // "active" optimistically; the next sandbox-run will reveal stale auth and
  // we surface that through the SandboxRunPanel's optional auth hint.
  const result = await runClaudeCommand({
    binary,
    args: CLAUDE_AUTH_COMMANDS.status,
    cwd,
    timeoutMs: STATUS_TIMEOUT_MS
  });

  const status = deriveStatusFromProbe(result);
  const checkedAt = new Date().toISOString();
  const stdout = clampOutput(redactSecrets(result.stdout));
  const stderr = clampOutput(redactSecrets(result.stderr));

  const patch = buildRowPatch({
    status,
    checkedAt,
    exitCode: result.exitCode,
    loginUrl: null,
    spawnError: result.spawnError
  });

  await applyRowPatch({ workspaceConfig, object, rowIndex, patch });

  return {
    ok: status === "active",
    status,
    binary,
    cwd,
    exitCode: result.exitCode,
    stdout,
    stderr,
    message: shortMessage({ status, exitCode: result.exitCode, error: result.spawnError?.message }),
    checkedAt
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Row patch — safe metadata only
// ──────────────────────────────────────────────────────────────────────────

function buildRowPatch({ status, checkedAt, exitCode, loginUrl, spawnError }) {
  const safe = {
    agentAuthStatus: KNOWN_AGENT_AUTH_STATUSES.includes(status) ? status : "unknown",
    agentAuthProvider: CLAUDE_AUTH_PROVIDER,
    agentAuthLastChecked: checkedAt,
    agentAuthLastExitCode: typeof exitCode === "number" ? exitCode : null,
    agentAuthLastMessage: shortMessage({
      status,
      exitCode,
      loginUrl,
      error: spawnError?.message
    }),
    agentAuthLastLoginUrl: loginUrl || ""
  };
  // Whitelist guard — never let an upstream change accidentally smuggle a
  // raw token / non-metadata field into the row through this helper.
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

export {
  CLAUDE_AUTH_COMMANDS,
  CLAUDE_AUTH_PROVIDER,
  CLAUDE_DEFAULT_BINARY,
  CLAUDE_INSTALL_HINT,
  KNOWN_AGENT_AUTH_STATUSES,
  SAFE_ROW_PATCH_FIELDS,
  assertClaudeLocalEligible,
  buildRowPatch,
  checkClaudeStatus,
  findSandboxRow,
  redactSecrets,
  resolveClaudeBinary,
  resolveCwd,
  runClaudeLogin,
  runClaudeLogout
};
