/**
 * Sandbox Claude local auth — server-side preflight for local-agent-host rows.
 *
 * Execution stays in default-local-agent-host.js and POST /api/workspace/sandbox-run.
 * This module only resolves sandbox rows, spawns `claude auth login|logout`, probes
 * readiness, redacts sensitive output, and stamps safe metadata on the row.
 */

import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { redactSecretsFromText } from "@/lib/orchestration-graph";
import {
  describePersistenceMode,
  readWorkspaceConfig,
  writeWorkspaceConfig
} from "@/lib/workspace-config";

const execFileAsync = promisify(execFile);

export const CLAUDE_AUTH_COMMANDS = Object.freeze({
  login: ["auth", "login"],
  logout: ["auth", "logout"],
  status: ["auth", "status"]
});

export const KNOWN_AGENT_AUTH_STATUSES = Object.freeze([
  "active",
  "stale",
  "missing",
  "checking",
  "unknown"
]);

const AUTH_STALE_PATTERNS = [
  /not\s+logged\s+in/i,
  /authentication\s+required/i,
  /claude_auth_required/i,
  /login\s+required/i,
  /unauthorized/i,
  /invalid\s+credentials/i,
  /run\s+[`']?claude\s+auth\s+login/i,
  /please\s+log\s+in/i,
  /sign\s+in\s+to\s+continue/i
];

const AUTH_ACTIVE_PATTERNS = [
  /logged\s+in/i,
  /authenticated/i,
  /auth(?:entication)?\s+ok/i,
  /session\s+active/i
];

const TOKEN_PREFIX_PATTERNS = [
  /(oauth[_-]?token["']?\s*[:=]\s*)["']?[^\s"',}]+/gi,
  /(session[_-]?key["']?\s*[:=]\s*)["']?[^\s"',}]+/gi,
  /(access[_-]?token["']?\s*[:=]\s*)["']?[^\s"',}]+/gi
];

const SAFE_AUTH_ROW_FIELDS = [
  "agentAuthStatus",
  "agentAuthProvider",
  "agentAuthLastChecked",
  "agentAuthLastExitCode",
  "agentAuthLastMessage",
  "agentAuthLastLoginUrl"
];

function normalizeRunLocality(row) {
  const raw = String(row?.runLocality ?? "").trim().toLowerCase();
  return raw === "serverless" ? "serverless" : "local";
}

export function findSandboxRow(workspaceConfig, objectId, name) {
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

export function resolveClaudeCommand(row) {
  const fromRow =
    (typeof row?.agentCommand === "string" && row.agentCommand.trim())
    || (typeof row?.claudeCommand === "string" && row.claudeCommand.trim())
    || "";
  return fromRow || "claude";
}

export function resolveClaudeCwd(row) {
  const cwd = typeof row?.cwd === "string" ? row.cwd.trim() : "";
  return cwd || process.cwd();
}

export function validateClaudeLocalEligibility(row) {
  if (!row || typeof row !== "object") {
    return { ok: false, error: "sandbox row not found" };
  }
  if (normalizeRunLocality(row) === "serverless") {
    return {
      ok: false,
      error: "Claude local auth applies only when runLocality is local (not serverless)"
    };
  }
  const adapter = String(row.adapter || "").trim();
  if (adapter !== "local-agent-host") {
    return {
      ok: false,
      error: "Claude auth is only supported when adapter is local-agent-host"
    };
  }
  const agentHost = String(row.agentHost || "").trim();
  if (agentHost !== "claude_local") {
    return {
      ok: false,
      error: "Claude auth is only supported when agentHost is claude_local"
    };
  }
  return { ok: true };
}

export function redactAuthOutput(text) {
  let out = redactSecretsFromText(String(text || ""));
  out = out.replace(/sk-ant-[a-z0-9_-]{8,}/gi, "[redacted]");
  for (const pattern of TOKEN_PREFIX_PATTERNS) {
    out = out.replace(pattern, "$1[redacted]");
  }
  return out;
}

export function extractLoginUrl(stdout, stderr) {
  const combined = `${stdout || ""}\n${stderr || ""}`;
  const match = combined.match(/https?:\/\/[^\s]+auth[^\s]*/i)
    || combined.match(/https?:\/\/[^\s]+(?:login|oauth)[^\s]*/i);
  return match ? match[0] : null;
}

export function deriveAgentAuthStatusFromProbe({ exitCode, stdout = "", stderr = "", spawnError = null }) {
  if (spawnError) {
    if (spawnError.code === "ENOENT") return "missing";
    return "unknown";
  }
  const combined = `${stdout}\n${stderr}`;
  if (AUTH_STALE_PATTERNS.some((pattern) => pattern.test(combined))) {
    return "stale";
  }
  if (exitCode === 0 && AUTH_ACTIVE_PATTERNS.some((pattern) => pattern.test(combined))) {
    return "active";
  }
  if (exitCode === 0) {
    return "active";
  }
  if (exitCode !== 0 && exitCode !== null) {
    return AUTH_STALE_PATTERNS.some((pattern) => pattern.test(combined)) ? "stale" : "unknown";
  }
  return "unknown";
}

export function buildSafeAuthMetadata({
  status,
  exitCode = null,
  message = "",
  loginUrl = null
}) {
  const normalizedStatus = KNOWN_AGENT_AUTH_STATUSES.includes(status) ? status : "unknown";
  const meta = {
    agentAuthStatus: normalizedStatus,
    agentAuthProvider: "claude_local",
    agentAuthLastChecked: new Date().toISOString(),
    agentAuthLastExitCode: exitCode,
    agentAuthLastMessage: redactAuthOutput(String(message || "").slice(0, 500))
  };
  if (loginUrl) {
    meta.agentAuthLastLoginUrl = String(loginUrl).slice(0, 2000);
  }
  return meta;
}

export function buildSafeAuthResponsePayload({
  ok,
  status,
  exitCode = null,
  stdout = "",
  stderr = "",
  loginUrl = null,
  message = "",
  rowPatch = null
}) {
  return {
    ok: Boolean(ok),
    status,
    exitCode,
    stdout: redactAuthOutput(stdout),
    stderr: redactAuthOutput(stderr),
    loginUrl: loginUrl ? String(loginUrl) : null,
    message: redactAuthOutput(message),
    rowPatch
  };
}

function spawnClaudeWithInput(command, args, { cwd, timeoutMs = 300_000, input = "" }) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const proc = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env }
    });
    if (input) {
      proc.stdin.write(input);
    }
    proc.stdin.end();
    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Claude auth command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function probeClaudeAuth(command, cwd) {
  try {
    const statusResult = await spawnClaudeWithInput(command, CLAUDE_AUTH_COMMANDS.status, {
      cwd,
      timeoutMs: 12_000,
      input: ""
    });
    const status = deriveAgentAuthStatusFromProbe(statusResult);
    return { ...statusResult, status };
  } catch (statusErr) {
    const msg = String(statusErr?.message || "");
    const unknownSubcommand = /unknown command|unknown option|invalid/i.test(msg);
    if (!unknownSubcommand && statusErr?.code !== "ENOENT") {
      try {
        const ping = await spawnClaudeWithInput(command, ["-p", "--output-format", "text"], {
          cwd,
          timeoutMs: 8_000,
          input: "ping"
        });
        const status = deriveAgentAuthStatusFromProbe(ping);
        return { ...ping, status };
      } catch (pingErr) {
        return {
          stdout: "",
          stderr: redactAuthOutput(pingErr?.message || msg),
          exitCode: null,
          status: deriveAgentAuthStatusFromProbe({ spawnError: pingErr })
        };
      }
    }
    if (statusErr?.code === "ENOENT") {
      return {
        stdout: "",
        stderr: `Command not found: ${command}`,
        exitCode: null,
        status: "missing"
      };
    }
    return {
      stdout: "",
      stderr: redactAuthOutput(msg),
      exitCode: null,
      status: "unknown"
    };
  }
}

export async function resolveClaudeLocalSandboxContext(objectId, name) {
  const workspaceConfig = await readWorkspaceConfig();
  const { object, row, rowIndex } = findSandboxRow(workspaceConfig, objectId, name);
  if (!object) {
    return { ok: false, status: 404, error: `no sandbox-environment object with id ${objectId}` };
  }
  if (!row) {
    return { ok: false, status: 404, error: `no sandbox row named ${name} in object ${objectId}` };
  }
  const eligibility = validateClaudeLocalEligibility(row);
  if (!eligibility.ok) {
    return { ok: false, status: 400, error: eligibility.error };
  }
  return {
    ok: true,
    workspaceConfig,
    object,
    row,
    rowIndex,
    command: resolveClaudeCommand(row),
    cwd: resolveClaudeCwd(row)
  };
}

export async function stampSandboxRowAuthMetadata(workspaceConfig, object, rowIndex, metadata) {
  const persistence = describePersistenceMode();
  if (!persistence.canSave) {
    return { persisted: false, persistError: persistence.reason || "workspace is read-only" };
  }
  const safePatch = {};
  for (const key of SAFE_AUTH_ROW_FIELDS) {
    if (metadata[key] !== undefined) {
      safePatch[key] = metadata[key];
    }
  }
  const objects = Array.isArray(workspaceConfig.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  const nextObjects = objects.map((entry) => {
    if (entry.id !== object.id) return entry;
    const rows = Array.isArray(entry.rows) ? entry.rows : [];
    const nextRows = rows.map((existingRow, index) => {
      if (index !== rowIndex) return existingRow;
      return { ...existingRow, ...safePatch };
    });
    return { ...entry, rows: nextRows };
  });
  await writeWorkspaceConfig({
    dataModel: { ...(workspaceConfig.dataModel || {}), objects: nextObjects }
  });
  return { persisted: true, rowPatch: safePatch };
}

export async function checkClaudeSandboxAuthStatus({ objectId, name }) {
  const ctx = await resolveClaudeLocalSandboxContext(objectId, name);
  if (!ctx.ok) {
    return { ok: false, status: ctx.status, error: ctx.error };
  }
  const probe = await probeClaudeAuth(ctx.command, ctx.cwd);
  const status = probe.status || deriveAgentAuthStatusFromProbe(probe);
  const metadata = buildSafeAuthMetadata({
    status,
    exitCode: probe.exitCode,
    message: status === "active"
      ? "Claude CLI appears authenticated"
      : status === "missing"
        ? `Claude CLI not found (${ctx.command})`
        : status === "stale"
          ? "Claude auth may be stale — run login"
          : "Claude auth status unknown — run login to verify"
  });
  const stamp = await stampSandboxRowAuthMetadata(
    ctx.workspaceConfig,
    ctx.object,
    ctx.rowIndex,
    metadata
  );
  return {
    ok: true,
    status: 200,
    payload: buildSafeAuthResponsePayload({
      ok: status === "active",
      status,
      exitCode: probe.exitCode,
      stdout: probe.stdout,
      stderr: probe.stderr,
      message: metadata.agentAuthLastMessage,
      rowPatch: stamp.rowPatch
    })
  };
}

export async function runClaudeSandboxLogin({ objectId, name }) {
  const ctx = await resolveClaudeLocalSandboxContext(objectId, name);
  if (!ctx.ok) {
    return { ok: false, status: ctx.status, error: ctx.error };
  }
  try {
    const result = await new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      const proc = spawn(ctx.command, CLAUDE_AUTH_COMMANDS.login, {
        cwd: ctx.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env }
      });
      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.stderr.on("data", (d) => { stderr += d.toString(); });
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error("Claude auth login timed out"));
      }, 300_000);
      proc.on("exit", (code) => {
        clearTimeout(timer);
        const loginUrl = extractLoginUrl(stdout, stderr);
        resolve({ stdout, stderr, loginUrl, exitCode: code });
      });
      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    const loginUrl = result.loginUrl;
    const authStatus = result.exitCode === 0 ? "active" : "stale";
    const metadata = buildSafeAuthMetadata({
      status: authStatus,
      exitCode: result.exitCode,
      message: result.exitCode === 0
        ? "Claude login completed"
        : "Claude login did not complete — check output",
      loginUrl
    });
    const stamp = await stampSandboxRowAuthMetadata(
      ctx.workspaceConfig,
      ctx.object,
      ctx.rowIndex,
      metadata
    );
    return {
      ok: true,
      status: 200,
      payload: buildSafeAuthResponsePayload({
        ok: result.exitCode === 0,
        status: authStatus,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        loginUrl,
        message: metadata.agentAuthLastMessage,
        rowPatch: stamp.rowPatch
      })
    };
  } catch (err) {
    const status = deriveAgentAuthStatusFromProbe({ spawnError: err });
    const metadata = buildSafeAuthMetadata({
      status,
      exitCode: null,
      message: err instanceof Error ? err.message : "Claude login failed"
    });
    try {
      await stampSandboxRowAuthMetadata(
        ctx.workspaceConfig,
        ctx.object,
        ctx.rowIndex,
        metadata
      );
    } catch {
      // read-only — still return safe API payload
    }
    return {
      ok: false,
      status: 500,
      payload: buildSafeAuthResponsePayload({
        ok: false,
        status,
        exitCode: null,
        stdout: "",
        stderr: redactAuthOutput(err instanceof Error ? err.message : "Claude login failed"),
        message: metadata.agentAuthLastMessage,
        rowPatch: metadata
      }),
      error: redactAuthOutput(err instanceof Error ? err.message : "Claude login failed")
    };
  }
}

export async function runClaudeSandboxLogout({ objectId, name }) {
  const ctx = await resolveClaudeLocalSandboxContext(objectId, name);
  if (!ctx.ok) {
    return { ok: false, status: ctx.status, error: ctx.error };
  }
  try {
    const { stdout, stderr } = await execFileAsync(
      ctx.command,
      CLAUDE_AUTH_COMMANDS.logout,
      { cwd: ctx.cwd, timeout: 10_000 }
    );
    const metadata = buildSafeAuthMetadata({
      status: "stale",
      exitCode: 0,
      message: "Claude logout completed"
    });
    const stamp = await stampSandboxRowAuthMetadata(
      ctx.workspaceConfig,
      ctx.object,
      ctx.rowIndex,
      metadata
    );
    return {
      ok: true,
      status: 200,
      payload: buildSafeAuthResponsePayload({
        ok: true,
        status: "stale",
        exitCode: 0,
        stdout,
        stderr,
        message: metadata.agentAuthLastMessage,
        rowPatch: stamp.rowPatch
      })
    };
  } catch (err) {
    const status = err?.code === "ENOENT" ? "missing" : "unknown";
    const metadata = buildSafeAuthMetadata({
      status,
      exitCode: null,
      message: err instanceof Error ? err.message : "Claude logout failed"
    });
    try {
      await stampSandboxRowAuthMetadata(
        ctx.workspaceConfig,
        ctx.object,
        ctx.rowIndex,
        metadata
      );
    } catch {
      // ignore persist errors on failure path
    }
    return {
      ok: false,
      status: 500,
      error: redactAuthOutput(err instanceof Error ? err.message : "Claude logout failed"),
      payload: buildSafeAuthResponsePayload({
        ok: false,
        status,
        exitCode: null,
        stdout: "",
        stderr: redactAuthOutput(err instanceof Error ? err.message : "Claude logout failed"),
        message: metadata.agentAuthLastMessage,
        rowPatch: metadata
      })
    };
  }
}

export function looksLikeClaudeAuthFailure(text) {
  const sample = String(text || "");
  return AUTH_STALE_PATTERNS.some((pattern) => pattern.test(sample));
}
