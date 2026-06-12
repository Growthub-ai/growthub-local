/**
 * Browser / local agent fast lane V1 — pure eligibility + proof deriver for
 * one sandbox-environment row, expressed in the same pure-deriver shape as
 * lib/sandbox-serverless-flow.js so it renders through the existing record
 * drawer grammar.
 *
 * It exposes — never replaces — capabilities that already exist:
 *   - runLocality local → local-process / local-agent-host adapters
 *   - manual runInputs validated by the row's orchestration graph schema
 *     (lib/orchestration-run-inputs.js) and summarized into the run receipt
 *   - run history persisted to source records + row lastResponse stamps by
 *     POST /api/workspace/sandbox-run
 *
 * Browser proof is evidence-driven: it is read from persisted run records
 * (stdout JSON / lastResponse), NEVER asserted from row fields alone.
 * `reachedTarget` is true only when a run record explicitly says so.
 *
 * Pure + deterministic; no React, no fetch, no config writes, no process.env.
 */

import { discoverRunInputSchema } from "./orchestration-run-inputs.js";
import { KNOWN_HOST_AUTH_SLUGS } from "./sandbox-agent-host-catalog.js";

const STATE_KIND = "growthub-sandbox-browser-agent-state-v1";

const BROWSER_CAPABLE_ADAPTERS = Object.freeze(["local-process", "local-agent-host"]);

/** Run-input ids that mark a workflow as browser/operator-approval shaped. */
const BROWSER_HINT_FIELD_IDS = Object.freeze([
  "platform",
  "profileUrl",
  "targetUrl",
  "notebookUrl",
  "initialUrl",
  "sendMode",
  "operatorApproved"
]);

const SERVERLESS_GUIDANCE =
  "Browser/session-cache runs require local execution. Serverless rows can delegate to a browser service through schedulerRegistryId when you register one.";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function coerceBoolean(value) {
  if (value === true || value === false) return value;
  return ["1", "true", "yes", "on"].includes(clean(value).toLowerCase());
}

function parseJsonMaybe(text) {
  const value = clean(text);
  if (!value || !/^[\[{]/.test(value)) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Normalize a persisted run record's browser/notebook proof into one shape:
 *
 *   {
 *     platform, targetUrl, initialUrl, currentUrl, title,
 *     reachedTarget, browserExitCode, stderr,
 *     platformMeta,           // e.g. { activeNotebookId } — platform-specific
 *     artifact,               // { id, status, ... } | null
 *     fallbackUsed, runId
 *   }
 *
 * Legacy NotebookLM proof compatibility: a `notebook` block is treated as
 * browser proof with platform "notebooklm"; `chromeExitCode` maps to
 * `browserExitCode`; `activeNotebookId` stays as platform-specific metadata.
 * Returns null when the record carries no browser-shaped proof — proof is
 * never invented.
 */
function extractBrowserProofFromRunRecord(record) {
  if (!isPlainObject(record)) return null;
  const candidates = [record, parseJsonMaybe(record.stdout)].filter(isPlainObject);
  for (const payload of candidates) {
    const browser = isPlainObject(payload.browser) ? payload.browser : null;
    const notebook = isPlainObject(payload.notebook) ? payload.notebook : null;
    const raw = browser || notebook;
    if (!raw) continue;
    const platform = clean(raw.platform) || (notebook ? "notebooklm" : "");
    const exitCandidate = raw.browserExitCode ?? raw.chromeExitCode;
    const platformMeta = {};
    if (raw.activeNotebookId !== undefined) platformMeta.activeNotebookId = raw.activeNotebookId;
    const artifactRaw = isPlainObject(payload.artifact) ? payload.artifact : null;
    const artifact = artifactRaw
      ? {
          id: clean(artifactRaw.id),
          status: clean(artifactRaw.Status ?? artifactRaw.status),
          client: clean(artifactRaw.Client ?? artifactRaw.client),
          docxStatus: clean(artifactRaw.DocxStatus ?? artifactRaw.docxStatus),
          docxArtifactPath: clean(artifactRaw.DocxArtifactPath ?? artifactRaw.docxArtifactPath),
          runId: clean(artifactRaw.RunId ?? artifactRaw.runId)
        }
      : null;
    return {
      platform,
      targetUrl: clean(raw.targetUrl),
      initialUrl: clean(raw.initialUrl),
      currentUrl: clean(raw.currentUrl),
      title: clean(raw.title),
      reachedTarget: raw.reachedTarget === true,
      browserExitCode: typeof exitCandidate === "number" ? exitCandidate : null,
      stderr: clean(raw.stderr ?? raw.chromeStderr),
      platformMeta,
      artifact: artifact && artifact.id ? artifact : null,
      fallbackUsed: payload.fallbackUsed === true,
      runId: clean(record.runId || payload.runId)
    };
  }
  return null;
}

/** Latest run record: prefer explicit run history, fall back to lastResponse. */
function latestRunRecord(row, runRecords) {
  const records = Array.isArray(runRecords) ? runRecords.filter(isPlainObject) : [];
  if (records.length > 0) return records[0];
  return parseJsonMaybe(row?.lastResponse);
}

function describeRunOutcome(record) {
  if (!isPlainObject(record)) return null;
  const exitCode = typeof record.exitCode === "number" ? record.exitCode : null;
  return {
    runId: clean(record.runId),
    ranAt: clean(record.ranAt),
    exitCode,
    durationMs: typeof record.durationMs === "number" ? record.durationMs : null,
    succeeded: exitCode === 0 && !record.error,
    error: clean(record.error),
    inputSummary: isPlainObject(record.inputSummary) ? record.inputSummary : null
  };
}

function rowHasBrowserMetadata(row) {
  return Boolean(
    clean(row.browserMode)
    || coerceBoolean(row.requiresBrowser)
    || clean(row.browserProfile)
    || clean(row.platform)
  );
}

function graphHasBrowserHints(inputFields) {
  const ids = new Set((inputFields || []).map((f) => clean(f.id)));
  return BROWSER_HINT_FIELD_IDS.some((id) => ids.has(id));
}

/**
 * Derive the Browser / local agent fast-lane state for a sandbox row.
 *
 * @param {object} input
 * @param {object} input.row                 the sandbox row (drawer draft)
 * @param {string} [input.objectId]          owning Data Model object id
 * @param {string} [input.objectType]        defaults to "sandbox-environment"
 * @param {object} [input.workspaceConfig]   reserved for future lookups
 * @param {object[]} [input.runRecords]      persisted run history, newest first
 * @param {string} [input.agentAuthStatus]   active|reachable|stale|missing|checking|unknown
 */
function deriveSandboxBrowserAgentState(input = {}) {
  const row = isPlainObject(input.row) ? input.row : {};
  const objectId = clean(input.objectId);
  const objectType = clean(input.objectType) || "sandbox-environment";
  const agentAuthStatus = clean(input.agentAuthStatus || row.agentAuthStatus).toLowerCase();

  const adapter = clean(row.adapter) || "local-process";
  const agentHost = clean(row.agentHost);
  const runLocality = clean(row.runLocality).toLowerCase() === "serverless" ? "serverless" : "local";

  const base = {
    kind: STATE_KIND,
    version: 1,
    objectId,
    adapter,
    agentHost,
    runLocality,
    eligible: false,
    visible: false,
    status: "hidden",
    requiresInput: false,
    inputFields: [],
    missing: [],
    nextAction: null,
    guidance: "",
    canRun: false,
    canCheckAuth: false,
    canUseBrowserProfile: false,
    browserProof: null,
    lastRun: null,
    lastArtifact: null
  };

  if (objectType !== "sandbox-environment") return base;
  if (adapter === "local-intelligence") return base;
  if (!BROWSER_CAPABLE_ADAPTERS.includes(adapter)) return base;

  const inputSchema = discoverRunInputSchema(row.orchestrationGraph || row.orchestrationConfig);
  const inputFields = (inputSchema.fields || []).map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    required: Boolean(f.required),
    helpText: f.helpText || ""
  }));
  const requiresInput = Boolean(inputSchema.requiresInput);

  const record = latestRunRecord(row, input.runRecords);
  const lastRun = describeRunOutcome(record);
  const browserProof = extractBrowserProofFromRunRecord(record);
  const browserFlagged = rowHasBrowserMetadata(row) || graphHasBrowserHints(inputFields) || Boolean(browserProof);

  // Serverless rows: browser/session-cache access is local-only. Surface a
  // read-only note only when the row is browser-shaped; otherwise stay hidden.
  if (runLocality === "serverless") {
    if (!browserFlagged) return base;
    return {
      ...base,
      visible: true,
      status: "serverless-incompatible",
      requiresInput,
      inputFields,
      guidance: SERVERLESS_GUIDANCE,
      nextAction: { id: "switch-to-local", label: "Switch to local run locality" },
      browserProof,
      lastRun,
      lastArtifact: browserProof?.artifact || null
    };
  }

  const isAgentHostLane = adapter === "local-agent-host";
  const hostCataloged = !isAgentHostLane || KNOWN_HOST_AUTH_SLUGS.includes(agentHost);
  // Plan rule: unknown/non-cataloged non-empty host → not a fast-lane row.
  if (isAgentHostLane && agentHost && !hostCataloged) return base;

  const eligible = true;
  const canCheckAuth = isAgentHostLane && hostCataloged && Boolean(agentHost);
  const canUseBrowserProfile = clean(row.browserMode).toLowerCase() === "operator-approved"
    || coerceBoolean(row.requiresBrowser);

  const missing = [];
  if (isAgentHostLane && !agentHost) missing.push("agentHost");
  if (isAgentHostLane && agentHost && agentAuthStatus === "missing") missing.push("agentAuth");
  const missingRequiredInputs = requiresInput
    ? inputFields.filter((f) => f.required).map((f) => f.id)
    : [];

  let status;
  let nextAction;
  let guidance = "";

  if (missing.includes("agentHost")) {
    status = "blocked";
    nextAction = { id: "select-agent-host", label: "Select local agent host" };
    guidance = "Pick which local agent CLI runs this workflow (Claude Code, Codex, Cursor, …).";
  } else if (missing.includes("agentAuth")) {
    status = "blocked";
    nextAction = { id: "check-auth", label: "Check host status" };
    guidance = "The local agent host CLI is not authenticated — open the auth panel and sign in.";
  } else if (lastRun && lastRun.succeeded) {
    status = "connected";
    nextAction = { id: "run-sandbox", label: "Run again" };
    guidance = browserProof
      ? (browserProof.reachedTarget
          ? `Reached ${browserProof.platform || "target"}${browserProof.artifact ? " · artifact generated" : ""} · run ${lastRun.runId}`
          : `Run ${lastRun.runId} completed, but the browser did not reach the target${browserProof.fallbackUsed ? " (fallback used)" : ""}.`)
      : `Run ${lastRun.runId} completed.`;
  } else if (lastRun && !lastRun.succeeded) {
    status = "failed";
    nextAction = { id: "review-failed-run", label: "Review failed run" };
    guidance = "Browser run failed before reaching target · open run output.";
  } else if (requiresInput) {
    status = "ready";
    nextAction = { id: "fill-run-inputs", label: "Fill required run inputs" };
    guidance = `This workflow needs run inputs before it can run: ${missingRequiredInputs.join(", ")}.`;
  } else {
    status = "ready";
    nextAction = { id: "run-sandbox", label: "Run local browser smoke" };
    guidance = "Configured for local execution — run to persist a receipt.";
  }

  return {
    ...base,
    eligible,
    visible: true,
    status,
    requiresInput,
    inputFields,
    missing: [...missing, ...(status === "ready" && requiresInput ? missingRequiredInputs : [])],
    nextAction,
    guidance,
    canRun: !missing.includes("agentHost"),
    canCheckAuth,
    canUseBrowserProfile,
    browserProof,
    lastRun,
    lastArtifact: browserProof?.artifact || null
  };
}

export {
  BROWSER_CAPABLE_ADAPTERS,
  BROWSER_HINT_FIELD_IDS,
  SERVERLESS_GUIDANCE,
  STATE_KIND,
  deriveSandboxBrowserAgentState,
  extractBrowserProofFromRunRecord
};
