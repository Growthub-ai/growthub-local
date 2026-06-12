/**
 * Browser / local agent fast lane — eligibility + proof deriver V1.
 *
 * Pure deriver for the no-code "Browser / local agent" panel on eligible
 * sandbox-environment records. Mirrors the deriver discipline of
 * `lib/sandbox-serverless-flow.js`: deterministic, never reads process.env,
 * never fetches, never writes config, never throws. Secret-safe (slugs / ids /
 * booleans / URLs only — values come from run receipts that were already
 * redacted server-side).
 *
 * Source-of-truth rules:
 *   - This is NOT a new runtime or contract. Eligibility describes what the
 *     existing sandbox-run path (local-process / local-agent-host) already
 *     supports; proof comes only from persisted run evidence
 *     (row.lastResponse JSON or source-record history) — never from row
 *     status fields alone.
 *   - Browser/session access is local-only. `runLocality: serverless` rows
 *     surface a read-only "serverless-incompatible" note pointing at the
 *     existing schedulerRegistryId delegation lane.
 *   - `reachedTarget` / artifact claims are read from run output verbatim —
 *     never synthesized. Fallback runs are surfaced truthfully and demote
 *     the lane below "connected".
 */

import { KNOWN_HOST_AUTH_SLUGS, getAgentHostCapabilities } from "./sandbox-agent-host-catalog.js";
import { discoverRunInputSchema } from "./orchestration-run-inputs.js";
import { parseOrchestrationGraph } from "./orchestration-graph.js";

const BROWSER_AGENT_STATE_KIND = "growthub-sandbox-browser-agent-state-v1";
const BROWSER_CAPABLE_ADAPTERS = Object.freeze(["local-process", "local-agent-host"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function coerceBool(value) {
  if (value === true || value === false) return value;
  return ["true", "1", "on", "yes"].includes(clean(value).toLowerCase());
}

function parseMaybeJson(value) {
  if (isPlainObject(value)) return value;
  const text = clean(value);
  if (!text || (text[0] !== "{" && text[0] !== "[")) return null;
  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Normalize browser/notebook proof from one persisted run record.
 *
 * Accepts the run-receipt shape persisted by sandbox-run (source-record entry
 * or row.lastResponse JSON). Proof is searched in:
 *   1. the record's parsed `stdout` JSON (`browser` / `notebook` / `artifact`)
 *   2. the record's `adapterMeta` (same keys, for drop-zone adapters)
 *
 * `notebook` proof is treated as browser proof with platform "notebooklm";
 * `chromeExitCode` maps to `browserExitCode`; `activeNotebookId` stays as
 * platform-specific metadata. Returns null when the record carries no
 * browser-shaped evidence. Never invents `reachedTarget` or artifact state.
 */
function extractBrowserProof(record) {
  const rec = parseMaybeJson(record);
  if (!rec) return null;

  const candidates = [];
  const stdoutJson = parseMaybeJson(rec.stdout);
  if (stdoutJson) candidates.push(stdoutJson);
  if (isPlainObject(rec.adapterMeta)) candidates.push(rec.adapterMeta);
  // Allow callers to pass an already-unwrapped proof payload directly.
  candidates.push(rec);

  for (const payload of candidates) {
    const browserRaw = isPlainObject(payload.browser) ? payload.browser : null;
    const notebookRaw = !browserRaw && isPlainObject(payload.notebook) ? payload.notebook : null;
    const raw = browserRaw || notebookRaw;
    if (!raw) continue;

    const exitRaw = raw.browserExitCode ?? raw.chromeExitCode;
    const exitNum = Number(exitRaw);
    const artifactRaw = isPlainObject(payload.artifact) ? payload.artifact : null;
    const artifactId = clean(artifactRaw?.id);
    const artifactPath = clean(artifactRaw?.DocxArtifactPath || artifactRaw?.artifactPath || artifactRaw?.path);
    // "generated" requires a real id or path — never claimed from status text.
    const artifactGenerated = Boolean(artifactId || artifactPath);

    return {
      platform: clean(raw.platform) || (notebookRaw ? "notebooklm" : ""),
      targetUrl: clean(raw.targetUrl),
      initialUrl: clean(raw.initialUrl),
      currentUrl: clean(raw.currentUrl),
      title: clean(raw.title),
      reachedTarget: raw.reachedTarget === true,
      browserExitCode: Number.isFinite(exitNum) ? exitNum : null,
      stderr: clean(raw.stderr),
      platformMeta: clean(raw.activeNotebookId)
        ? { activeNotebookId: clean(raw.activeNotebookId) }
        : null,
      fallbackUsed: payload.fallbackUsed === true,
      artifact: artifactRaw
        ? {
            id: artifactId,
            status: clean(artifactRaw.Status || artifactRaw.status),
            client: clean(artifactRaw.Client || artifactRaw.client),
            docxStatus: clean(artifactRaw.DocxStatus),
            artifactPath,
            runId: clean(artifactRaw.RunId || artifactRaw.runId),
            generated: artifactGenerated
          }
        : null
    };
  }
  return null;
}

function findObject(workspaceConfig, objectId) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects.find((o) => clean(o?.id) === clean(objectId)) || null;
}

function rowSourceRecords(workspaceSourceRecords, row) {
  const sourceId = clean(row?.lastSourceId);
  if (!sourceId || !isPlainObject(workspaceSourceRecords)) return [];
  const bucket = workspaceSourceRecords[sourceId];
  const records = Array.isArray(bucket?.records) ? bucket.records : Array.isArray(bucket) ? bucket : [];
  return records;
}

function rowDeclaresBrowserIntent(row) {
  return Boolean(
    coerceBool(row?.requiresBrowser)
    || clean(row?.browserMode)
    || clean(row?.browserProfile)
    || clean(row?.platform)
  );
}

function graphDeclaresBrowserIntent(row) {
  const graph = parseOrchestrationGraph(row?.orchestrationGraph || row?.orchestrationConfig);
  if (!graph) return false;
  const tags = Array.isArray(graph?.tags) ? graph.tags.map((t) => clean(t).toLowerCase()) : [];
  if (tags.some((t) => t.includes("browser"))) return true;
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return nodes.some((node) => {
    const haystack = `${clean(node?.type)} ${clean(node?.label)} ${clean(node?.subtitle)} ${clean(node?.config?.templateTag)} ${clean(node?.config?.lane)}`.toLowerCase();
    return haystack.includes("browser") || haystack.includes("notebooklm");
  });
}

function hidden(reason) {
  return {
    kind: BROWSER_AGENT_STATE_KIND,
    version: 1,
    eligible: false,
    visible: false,
    status: "hidden",
    reason,
    adapter: "",
    agentHost: "",
    runLocality: "",
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
}

/**
 * Derive the Browser / local agent fast-lane state for one sandbox record.
 *
 * @param {object} input
 * @param {object} [input.workspaceConfig]        used to confirm the object is a sandbox-environment
 * @param {object} [input.workspaceSourceRecords] sidecar records keyed by sourceId (proof lane)
 * @param {object} input.row                      the sandbox row (drawer draft)
 * @param {string} [input.objectId]               the Data Model object id of the row
 * @param {boolean} [input.running]               live "run in flight" flag from the caller UI
 */
function deriveSandboxBrowserAgentState({ workspaceConfig, workspaceSourceRecords, row, objectId, running } = {}) {
  if (!isPlainObject(row)) return hidden("no row");

  if (objectId !== undefined && workspaceConfig !== undefined) {
    const object = findObject(workspaceConfig, objectId);
    if (object && clean(object.objectType) !== "sandbox-environment") {
      return hidden("not a sandbox-environment object");
    }
  }

  const adapter = clean(row.adapter) || "local-process";
  const agentHost = clean(row.agentHost);
  const runLocality = clean(row.runLocality).toLowerCase() === "serverless" ? "serverless" : "local";

  if (adapter === "local-intelligence") return hidden("local-intelligence rows are model calls, not browser lanes");

  // Proof from persisted evidence only — lastResponse JSON or source records.
  const lastResponse = parseMaybeJson(row.lastResponse);
  const historyProof = rowSourceRecords(workspaceSourceRecords, row)
    .map((rec) => extractBrowserProof(rec))
    .filter(Boolean)
    .pop() || null;
  const browserProof = extractBrowserProof(lastResponse) || historyProof;

  const browserRelevant = rowDeclaresBrowserIntent(row)
    || graphDeclaresBrowserIntent(row)
    || Boolean(browserProof);
  if (!browserRelevant) return hidden("row has no browser/local-agent signal");

  const inputSchema = discoverRunInputSchema(row.orchestrationGraph || row.orchestrationConfig);
  const inputFields = Array.isArray(inputSchema?.fields) ? inputSchema.fields : [];
  const requiresInput = Boolean(inputSchema?.requiresInput);

  if (runLocality === "serverless") {
    return {
      kind: BROWSER_AGENT_STATE_KIND,
      version: 1,
      eligible: false,
      visible: true,
      status: "serverless-incompatible",
      adapter,
      agentHost,
      runLocality,
      requiresInput,
      inputFields,
      missing: [],
      nextAction: { id: "switch-local", label: "Switch to local run locality" },
      guidance: "Browser/session-cache runs require local execution. Serverless rows can delegate to a browser service through schedulerRegistryId when you register one.",
      canRun: false,
      canCheckAuth: false,
      canUseBrowserProfile: false,
      browserProof,
      lastRun: lastResponse
        ? { runId: clean(lastResponse.runId), exitCode: lastResponse.exitCode ?? null, ranAt: clean(lastResponse.ranAt) }
        : null,
      lastArtifact: browserProof?.artifact || null
    };
  }

  const missing = [];
  const isAgentHostAdapter = adapter === "local-agent-host";
  if (!BROWSER_CAPABLE_ADAPTERS.includes(adapter)) {
    // Custom drop-zone adapters stay eligible only when they self-declare
    // browser intent on the row — adapter rules still apply to them.
    if (!rowDeclaresBrowserIntent(row)) return hidden(`adapter ${adapter} is not a browser-capable lane`);
  }
  if (isAgentHostAdapter && !KNOWN_HOST_AUTH_SLUGS.includes(agentHost)) {
    missing.push("agentHost");
  }
  if (!clean(row.command) && !clean(row.instructions) && !parseOrchestrationGraph(row.orchestrationGraph || row.orchestrationConfig)) {
    missing.push("command");
  }

  const capabilities = getAgentHostCapabilities(row);
  const canCheckAuth = Boolean(capabilities);
  const canUseBrowserProfile = clean(row.browserMode).toLowerCase() === "operator-approved";

  // Run evidence drives connected/failed — row.status alone never promotes.
  const lastRunOk = lastResponse ? lastResponse.exitCode === 0 && !lastResponse.error : null;
  const proofReached = browserProof ? browserProof.reachedTarget === true : null;
  const fallbackUsed = browserProof ? browserProof.fallbackUsed === true : false;

  let status;
  let nextAction;
  let guidance;
  if (running === true) {
    status = "running";
    nextAction = { id: "open-background-tasks", label: "Open Background Tasks" };
    guidance = "Run in flight — output lands in the run receipt and Background Tasks.";
  } else if (missing.length > 0) {
    status = "blocked";
    nextAction = missing.includes("agentHost")
      ? { id: "select-agent-host", label: "Select local agent host" }
      : { id: "configure-command", label: "Add a command, instructions, or workflow graph" };
    guidance = missing.includes("agentHost")
      ? "Pick a cataloged local agent host (Claude, Codex, Cursor, …) for this row."
      : "This row has nothing to execute yet — add a command, instructions, or a workflow graph.";
  } else if (lastRunOk === false) {
    status = "failed";
    nextAction = { id: "review-run", label: "Review failed run" };
    guidance = "Browser run failed before reaching target — open run output.";
  } else if (lastRunOk === true && browserProof && proofReached === false) {
    status = "ready";
    nextAction = { id: "run-browser-smoke", label: "Run local browser smoke" };
    guidance = fallbackUsed
      ? "Last run completed but used a fallback without reaching the browser target. Run on a machine with the operator's browser session available."
      : "Last run completed without reaching the browser target — re-run with the target available.";
  } else if (lastRunOk === true) {
    status = "connected";
    nextAction = { id: "open-background-tasks", label: "Open Background Tasks" };
    guidance = browserProof
      ? `Reached ${browserProof.platform || "target"}${browserProof.artifact?.generated ? " · artifact generated" : ""} · run ${clean(lastResponse.runId) || "recorded"}`
      : "Last run succeeded — receipt persisted to source records.";
  } else {
    status = "ready";
    nextAction = requiresInput
      ? { id: "fill-run-inputs", label: "Fill required run inputs" }
      : { id: "run-browser-smoke", label: "Run local browser smoke" };
    guidance = requiresInput
      ? "Fill the workflow's required run inputs, then run through sandbox-run."
      : "Configured for the local browser/agent lane — run when ready.";
  }

  return {
    kind: BROWSER_AGENT_STATE_KIND,
    version: 1,
    eligible: missing.length === 0,
    visible: true,
    status,
    adapter,
    agentHost,
    runLocality,
    requiresInput,
    inputFields,
    missing,
    nextAction,
    guidance,
    canRun: missing.length === 0 && running !== true,
    canCheckAuth,
    canUseBrowserProfile,
    browserProof,
    lastRun: lastResponse
      ? { runId: clean(lastResponse.runId), exitCode: lastResponse.exitCode ?? null, ranAt: clean(lastResponse.ranAt), durationMs: lastResponse.durationMs ?? null }
      : null,
    lastArtifact: browserProof?.artifact || null
  };
}

export {
  BROWSER_AGENT_STATE_KIND,
  BROWSER_CAPABLE_ADAPTERS,
  deriveSandboxBrowserAgentState,
  extractBrowserProof
};
