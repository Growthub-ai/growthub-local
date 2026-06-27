/**
 * Serverless-schedule readiness scan — the causality gate that proves a workflow
 * graph is SAFE to run in the selected serverless runtime BEFORE the schedule is
 * allowed to bind / publish / remain active.
 *
 * Scheduler install succeeding (remote schedule exists, row owns scheduleId,
 * trigger node is serverless-scheduler, signed destination/callback validate)
 * proves the BINDING. It does NOT prove the downstream graph can actually run
 * with no human at the keyboard and no local agent state. This module produces
 * that missing COMPATIBILITY proof:
 *
 *   - every downstream node can run in the selected serverless runtime
 *   - all API Registry dependencies resolve through server-side env refs
 *     (`server-secrets`), never browser/client/local-only state
 *   - no secret values are persisted into config / graph / receipts / payloads
 *   - required inputs are available through the trigger / runInputs / delta-tag
 *     contract (the same envelope the serverless destination consumes)
 *   - no local-only agent / process / browser / filesystem state is required
 *     unless explicitly upgraded
 *
 * It is PURE and dependency-injected (graph + workspace config + env in, a
 * structured verdict out) so the same scan runs offline in `node --test`, in the
 * install orchestration core (pre-bind gate), in the publish gate (bound phase),
 * and on resume — one truth, four call sites.
 *
 * When the graph is NOT compatible the scan does not fail vaguely: it returns a
 * thin, actionable delta layer (`blockingNodes` + `warnings`, each carrying
 * canonical `deltaTags` and a `helperAction`) that callers surface to users and
 * agents and persist as a draft delta / blocked receipt.
 */

import { parseOrchestrationGraph } from "./orchestration-graph.js";
import { readServerSecret, envKeyCandidates } from "./server-secrets.js";

const READINESS_KIND = "serverless-schedule-readiness";

/** Canonical delta tags — one vocabulary across code / receipts / docs / UI. */
const READINESS_DELTA_TAGS = {
  SERVERLESS_SCHEDULE: "serverless-schedule",
  RUNTIME_LOCALITY: "runtime-locality",
  INPUT_CONTRACT: "input-contract",
  API_REGISTRY_ENV: "api-registry-env",
  LOCAL_AGENT_UPGRADE_REQUIRED: "local-agent-upgrade-required",
  DOWNSTREAM_NODE_INCOMPATIBLE: "downstream-node-incompatible",
  MISSING_SERVER_SECRET: "missing-server-secret",
  SCHEDULED_INPUT_UNMAPPED: "scheduled-input-unmapped",
  PUBLISHED_GRAPH_REQUIRED: "published-graph-required",
};

// Adapters whose execution requires LOCAL agent/process state and therefore
// cannot be silently scheduled as serverless — they must be upgraded to an
// API-backed runtime first. Mirrors `SERVERLESS_LOCAL_ADAPTERS` in
// workspace-add-ons.js (the bind helper normalizes these; the scan refuses to
// schedule them silently and emits an explicit upgrade delta instead).
const LOCAL_ONLY_ADAPTERS = new Set(["local-agent-host", "local-intelligence"]);

function clean(value) {
  return String(value == null ? "" : value).trim();
}

/** Runtime-live graph field precedence — must match the runner. */
function liveGraphFieldForRow(row) {
  return parseOrchestrationGraph(row?.orchestrationGraph) ? "orchestrationGraph" : "orchestrationConfig";
}

/** Collect `{{input.X}}` keys referenced anywhere in a string/template. */
function collectInputRefs(text, out = new Set()) {
  const str = String(text == null ? "" : text);
  if (!str.includes("{{")) return out;
  const re = /\{\{\s*input\.([a-zA-Z0-9_.]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(str))) out.add(m[1]);
  return out;
}

/** Recursively collect input refs from any nested config value. */
function collectInputRefsDeep(value, out = new Set()) {
  if (value == null) return out;
  if (typeof value === "string") return collectInputRefs(value, out);
  if (Array.isArray(value)) {
    for (const item of value) collectInputRefsDeep(item, out);
    return out;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value)) collectInputRefsDeep(v, out);
  }
  return out;
}

/** Top-level keys available to a scheduled run (no human input). */
function collectAvailableInputKeys(inputNode, triggerInput) {
  const keys = new Set();
  const sample = inputNode?.config?.samplePayload;
  const addObjectKeys = (obj) => {
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const k of Object.keys(obj)) keys.add(k);
    }
  };
  if (sample && typeof sample === "object") addObjectKeys(sample);
  else if (typeof sample === "string" && sample.trim()) {
    try { addObjectKeys(JSON.parse(sample)); } catch { /* ignore */ }
  }
  // The scheduled payload the serverless destination feeds into runInputs.
  if (triggerInput && typeof triggerInput === "object") addObjectKeys(triggerInput);
  else if (typeof triggerInput === "string" && triggerInput.trim()) {
    try { addObjectKeys(JSON.parse(triggerInput)); } catch { /* ignore */ }
  }
  return keys;
}

/** A referenced `a.b.c` key is satisfied if its ROOT segment is available. */
function refRootSatisfied(ref, availableKeys) {
  const root = String(ref || "").split(".")[0];
  return availableKeys.has(root);
}

function findRegistryRow(workspaceConfig, registryId) {
  const id = clean(registryId);
  if (!id) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    const objectType = clean(object?.objectType);
    const objectId = clean(object?.id || object?.objectId);
    if (objectType !== "api-registry" && objectId !== "api-registry") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (clean(row?.integrationId) === id || clean(row?.id) === id || clean(row?.Name) === id) return row;
    }
  }
  return null;
}

/** Upper-snake ref root — same normalization the serverless drivers use. */
function refRoot(ref) {
  return clean(ref).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

/**
 * Is a logical authRef's credential available in the SELECTED runtime? This is
 * the same secret-safe contract the existing serverless causation drivers use:
 * the CLIENT proves presence through `configuredEnvRefs` (resolved ref slugs from
 * env-status — never a value), and the SERVER may additionally resolve the value
 * through `server-secrets` (`env`) so it can also detect a persisted-secret leak.
 * Returns `{ configured, value }` — `value` is only ever set server-side.
 */
function resolveCredentialRef(authRef, configuredRefSet, env) {
  const root = refRoot(authRef);
  if (!root) return { configured: false, value: "" };
  if (configuredRefSet && configuredRefSet.has(root)) return { configured: true, value: "" };
  if (configuredRefSet) {
    for (const candidate of envKeyCandidates(authRef)) {
      if (configuredRefSet.has(candidate)) return { configured: true, value: "" };
    }
  }
  if (env) {
    const hit = readServerSecret(authRef, env);
    if (hit) return { configured: true, value: hit.value };
  }
  return { configured: false, value: "" };
}

/** Does a stored object literally contain a secret VALUE (leak)? */
function containsSecretValue(obj, secretValue) {
  const secret = clean(secretValue);
  if (!secret || secret.length < 6) return false;
  try {
    return JSON.stringify(obj || {}).includes(secret);
  } catch {
    return false;
  }
}

/**
 * Decide whether a node is LOCAL-ONLY (cannot run in the serverless runtime).
 * Conservative: an ai-agent / sandbox-adapter node is incompatible unless it is
 * provably API-backed (registry-backed or an API provider/model declared).
 */
function classifyNodeLocality(node, { adapterLocality } = {}) {
  const type = clean(node?.type);
  const config = node?.config && typeof node.config === "object" ? node.config : {};
  // Explicit local-state requirements on any node.
  if (config.requiresLocalFilesystem === true || config.requiresBrowser === true || config.browserAccess === true || config.local === true) {
    return { local: true, reason: "node declares local filesystem / browser / desktop state" };
  }
  const adapterId = clean(config.adapter || node?.adapter);
  if (adapterId && LOCAL_ONLY_ADAPTERS.has(adapterId)) {
    return { local: true, reason: `node adapter "${adapterId}" requires local agent state` };
  }
  if (adapterId && typeof adapterLocality === "function") {
    const locality = clean(adapterLocality(adapterId));
    if (locality === "local") return { local: true, reason: `node adapter "${adapterId}" is local-only` };
  }
  if (type === "ai-agent") {
    const apiBacked =
      config.apiBacked === true ||
      Boolean(clean(config.registryId) || clean(config.integrationId)) ||
      ["claude", "anthropic", "openai", "api", "api-registry"].includes(clean(config.provider).toLowerCase()) ||
      clean(config.runtime).toLowerCase() === "api";
    const host = clean(config.host || config.agentHost);
    const localHost = /_local$|^local-/.test(host) || clean(config.runtime).toLowerCase() === "local";
    if (!apiBacked || localHost) {
      return { local: true, reason: `ai-agent node "${node?.id || ""}" is not API-backed (host=${host || "n/a"})` };
    }
  }
  return { local: false, reason: "" };
}

/**
 * Run the serverless-readiness scan against a workflow row's live graph.
 *
 * @param {object}   args
 * @param {object}   args.row              the owning sandbox-environment row
 * @param {object}   args.workspaceConfig  full workspace config (to resolve API Registry rows)
 * @param {string[]} [args.configuredEnvRefs] resolved credential ref slugs (env-status) — the
 *                                            secret-safe, CLIENT-usable credential signal (no values)
 * @param {object}   [args.env]            server-only injectable env; enables persisted-secret-leak
 *                                            detection. Omit on the client (use configuredEnvRefs).
 * @param {object}   [args.expected]       { scheduleId, schedulerRegistryId, providerId, productId }
 * @param {"pre-bind"|"bound"} [args.phase] pre-bind: binding not yet written; bound: full trigger check
 * @param {Function} [args.adapterLocality] optional (adapterId) => "local"|"serverless"|"remote"
 * @returns {object} readiness verdict (kind/status/ok/blockingNodes/warnings/deltaTags/checks)
 */
function scanServerlessReadiness({
  row,
  workspaceConfig,
  configuredEnvRefs = [],
  env = null,
  expected = {},
  phase = "pre-bind",
  adapterLocality,
} = {}) {
  const configuredRefSet = new Set((Array.isArray(configuredEnvRefs) ? configuredEnvRefs : []).map((s) => refRoot(s)).filter(Boolean));
  const workflowRow = clean(row?.Name);
  const liveField = liveGraphFieldForRow(row);
  const checks = [];
  const addCheck = (check) => {
    checks.push({
      status: "ok",
      deltaTags: [],
      ...check,
    });
  };

  const graph = parseOrchestrationGraph(row?.[liveField] || row?.orchestrationGraph || row?.orchestrationConfig);

  // ---- Graph-level gate: a published/live graph must exist to scan. --------
  if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length) {
    addCheck({
      nodeId: null,
      nodeType: "graph",
      status: "blocked",
      reason: "no published/live orchestration graph to scan for serverless readiness",
      deltaTags: [READINESS_DELTA_TAGS.PUBLISHED_GRAPH_REQUIRED, READINESS_DELTA_TAGS.SERVERLESS_SCHEDULE],
      helperAction: "Publish the workflow graph (orchestrationGraph/orchestrationConfig) before binding a serverless schedule.",
    });
    return finalize({ workflowRow, liveField, triggerNodeId: null, checks });
  }

  const nodes = graph.nodes.filter((n) => n && typeof n === "object");
  const inputNode = nodes.find((n) => n.type === "input" || n.id === "input") || null;
  const triggerNode = nodes.find((n) => n.type === "data-trigger") || inputNode;
  const triggerNodeId = clean(triggerNode?.id) || null;

  // Reachable-from-trigger set (linear graphs => all nodes). Falls back to all
  // nodes when there are no edges, matching how the runner executes the chain.
  const reachable = reachableNodeIds(graph, triggerNodeId);

  // ---- 1. Input / trigger node -------------------------------------------
  {
    const expectedScheduleId = clean(expected.scheduleId);
    const expectedRegistryId = clean(expected.schedulerRegistryId);
    if (phase === "bound") {
      const cfg = triggerNode?.config && typeof triggerNode.config === "object" ? triggerNode.config : {};
      const schedule = cfg.schedule && typeof cfg.schedule === "object" ? cfg.schedule : {};
      const rowScheduleId = clean(row?.scheduleId);
      const rowRegistryId = clean(row?.schedulerRegistryId);
      const triggerIsScheduler = clean(cfg.trigger) === "serverless-scheduler" && cfg.enabled !== false;
      const scheduleIdAgrees =
        clean(schedule.scheduleId) &&
        clean(schedule.scheduleId) === rowScheduleId &&
        (!expectedScheduleId || clean(schedule.scheduleId) === expectedScheduleId);
      const registryAgrees =
        clean(schedule.schedulerRegistryId) === rowRegistryId &&
        (!expectedRegistryId || clean(schedule.schedulerRegistryId) === expectedRegistryId);
      if (!triggerIsScheduler || !scheduleIdAgrees || !registryAgrees) {
        addCheck({
          nodeId: triggerNodeId,
          nodeType: clean(triggerNode?.type) || "input",
          status: "blocked",
          reason: `trigger node binding does not agree with the owning row (trigger=${clean(cfg.trigger) || "manual"}, trigger.scheduleId=${clean(schedule.scheduleId) || "none"}, row.scheduleId=${rowScheduleId || "none"})`,
          deltaTags: [READINESS_DELTA_TAGS.INPUT_CONTRACT, READINESS_DELTA_TAGS.SERVERLESS_SCHEDULE],
          helperAction: "Re-install the serverless schedule so the trigger node, the owning row, and the remote schedule all carry the same scheduleId.",
        });
      } else {
        addCheck({ nodeId: triggerNodeId, nodeType: clean(triggerNode?.type) || "input", status: "ok", reason: "trigger node bound to serverless-scheduler and agrees with the row" });
      }
    } else {
      // pre-bind: the bind itself will sync the trigger node; just confirm an
      // input/trigger entry point exists for the bind to attach to.
      addCheck({
        nodeId: triggerNodeId,
        nodeType: clean(triggerNode?.type) || "input",
        status: triggerNodeId ? "ok" : "warning",
        reason: triggerNodeId ? "entry trigger/input node present for serverless bind" : "no input/data-trigger node — a canonical schedule-trigger node will be created on bind",
        deltaTags: triggerNodeId ? [] : [READINESS_DELTA_TAGS.SERVERLESS_SCHEDULE],
      });
    }
  }

  // ---- Build the scheduled-input contract (no human at the keyboard) ------
  const availableInputKeys = collectAvailableInputKeys(inputNode, expected.triggerInput ?? row?.schedulerTriggerInput);

  // ---- Walk downstream nodes ---------------------------------------------
  for (const node of nodes) {
    const nodeId = clean(node.id);
    if (triggerNodeId && nodeId === triggerNodeId) continue; // handled above
    if (reachable && reachable.size && nodeId && !reachable.has(nodeId)) {
      addCheck({ nodeId, nodeType: clean(node.type), status: "warning", reason: "node is not reachable from the trigger node", deltaTags: [READINESS_DELTA_TAGS.DOWNSTREAM_NODE_INCOMPATIBLE] });
      continue;
    }
    const type = clean(node.type);

    // 4. Agent / local-process nodes — local-only state cannot be scheduled.
    const locality = classifyNodeLocality(node, { adapterLocality });
    if (locality.local) {
      addCheck({
        nodeId,
        nodeType: type,
        status: "blocked",
        reason: locality.reason,
        deltaTags: [READINESS_DELTA_TAGS.RUNTIME_LOCALITY, READINESS_DELTA_TAGS.LOCAL_AGENT_UPGRADE_REQUIRED],
        helperAction: "Upgrade this node to an API-backed agent/runtime (e.g. Claude/OpenAI/API Registry backed) before serverless scheduling.",
      });
      continue;
    }

    // 2. API Registry call nodes — must resolve through server-side env refs.
    if (type === "api-registry-call") {
      checkApiRegistryNode({ node, nodeId, workspaceConfig, configuredRefSet, env, availableInputKeys, addCheck });
      continue;
    }

    // 3. Transform / filter / mapping nodes — every referenced input must exist.
    if (type === "transform-filter" || type === "normalize-output") {
      const refs = collectInputRefsDeep(node.config);
      const unmapped = [...refs].filter((ref) => !refRootSatisfied(ref, availableInputKeys));
      if (unmapped.length) {
        addCheck({
          nodeId,
          nodeType: type,
          status: "warning",
          reason: `transform references input field(s) not available under scheduled execution: ${unmapped.join(", ")}`,
          deltaTags: [READINESS_DELTA_TAGS.INPUT_CONTRACT, READINESS_DELTA_TAGS.SCHEDULED_INPUT_UNMAPPED],
          helperAction: "Map these fields into the schedule's triggerInput (or the input node samplePayload) so the scheduled run feeds them downstream.",
        });
      } else {
        addCheck({ nodeId, nodeType: type, status: "ok", reason: "transform inputs satisfied under scheduled execution" });
      }
      continue;
    }

    // 5. Tool-result / output node — must be able to write run proof back.
    if (type === "tool-result") {
      const writeOff = node?.config?.writeLastResponse === false;
      addCheck({
        nodeId,
        nodeType: type,
        status: writeOff ? "warning" : "ok",
        reason: writeOff
          ? "result node has writeLastResponse disabled — the serverless bind will enable it so scheduled-run proof syncs back to the row"
          : "result node writes scheduled-run proof back to the owning row",
        deltaTags: writeOff ? [READINESS_DELTA_TAGS.SERVERLESS_SCHEDULE] : [],
      });
      continue;
    }

    addCheck({ nodeId, nodeType: type || "unknown", status: "ok", reason: "node has no local-only runtime requirement" });
  }

  return finalize({ workflowRow, liveField, triggerNodeId, checks });
}

function checkApiRegistryNode({ node, nodeId, workspaceConfig, configuredRefSet, env, availableInputKeys, addCheck }) {
  const config = node?.config && typeof node.config === "object" ? node.config : {};
  const registryId = clean(config.registryId || config.integrationId);
  if (!registryId) {
    addCheck({
      nodeId,
      nodeType: "api-registry-call",
      status: "blocked",
      reason: "api-registry-call node has no registryId/integrationId",
      deltaTags: [READINESS_DELTA_TAGS.DOWNSTREAM_NODE_INCOMPATIBLE, READINESS_DELTA_TAGS.API_REGISTRY_ENV],
      helperAction: "Point this API call node at a concrete API Registry row (integrationId) before serverless scheduling.",
    });
    return;
  }
  const registryRow = findRegistryRow(workspaceConfig, registryId);
  if (!registryRow) {
    addCheck({
      nodeId,
      nodeType: "api-registry-call",
      status: "blocked",
      reason: `no API Registry row resolves for integrationId ${registryId}`,
      deltaTags: [READINESS_DELTA_TAGS.DOWNSTREAM_NODE_INCOMPATIBLE, READINESS_DELTA_TAGS.API_REGISTRY_ENV],
      helperAction: `Register/install the API Registry row "${registryId}" so its server-side identity resolves at scheduled run time.`,
    });
    return;
  }
  if (!clean(registryRow.integrationId)) {
    addCheck({
      nodeId,
      nodeType: "api-registry-call",
      status: "blocked",
      reason: `API Registry row for ${registryId} has no concrete integrationId`,
      deltaTags: [READINESS_DELTA_TAGS.API_REGISTRY_ENV, READINESS_DELTA_TAGS.DOWNSTREAM_NODE_INCOMPATIBLE],
      helperAction: "Give the referenced API Registry row a concrete integrationId / registry identity.",
    });
    return;
  }

  // Server-side credential proof. authRef is a logical ref resolved through
  // server-secrets — NEVER a browser/client/local value. When the row declares
  // an authRef, the credential must resolve in the serverless runtime.
  const authRef = clean(config.authRef || registryRow.authRef || registryId);
  const declaresAuth = Boolean(clean(config.authRef || registryRow.authRef));
  const credential = resolveCredentialRef(authRef, configuredRefSet, env);
  if (declaresAuth && !credential.configured) {
    addCheck({
      nodeId,
      nodeType: "api-registry-call",
      status: "blocked",
      reason: `missing server-side credential for API Registry row "${registryId}" (authRef ${authRef})`,
      deltaTags: [READINESS_DELTA_TAGS.API_REGISTRY_ENV, READINESS_DELTA_TAGS.MISSING_SERVER_SECRET],
      helperAction: "Connect the API Registry row to a server-side env ref via server-secrets before publishing the schedule.",
    });
    return;
  }

  // No secret VALUE may be persisted into the graph node config or the registry
  // row (config/graph/receipts/client payloads stay value-free; only refs). This
  // check only runs server-side, where the value is resolvable (credential.value).
  const leaked =
    containsSecretValue(config, credential.value) ||
    containsSecretValue(registryRow, credential.value);
  if (leaked) {
    addCheck({
      nodeId,
      nodeType: "api-registry-call",
      status: "blocked",
      reason: `a credential VALUE is persisted in workspace/graph config for "${registryId}" — secrets must stay server-side as refs`,
      deltaTags: [READINESS_DELTA_TAGS.MISSING_SERVER_SECRET, READINESS_DELTA_TAGS.API_REGISTRY_ENV],
      helperAction: "Remove the inline secret value and reference it via a server-side env ref (authRef) instead.",
    });
    return;
  }

  // Endpoint/body templates must be bindable from the scheduled input contract.
  const refs = collectInputRefs(config.endpoint, collectInputRefs(config.bodyTemplate));
  const unmapped = [...refs].filter((ref) => !refRootSatisfied(ref, availableInputKeys));
  if (unmapped.length) {
    addCheck({
      nodeId,
      nodeType: "api-registry-call",
      status: "warning",
      reason: `endpoint/body template references input field(s) not available under scheduled execution: ${unmapped.join(", ")}`,
      deltaTags: [READINESS_DELTA_TAGS.INPUT_CONTRACT, READINESS_DELTA_TAGS.SCHEDULED_INPUT_UNMAPPED],
      helperAction: "Provide these fields through the schedule's triggerInput so the scheduled call can bind its template.",
    });
    return;
  }

  addCheck({ nodeId, nodeType: "api-registry-call", status: "ok", reason: `API Registry row "${registryId}" resolves with server-side credentials` });
}

/** BFS reachable node ids from the trigger; null when the graph has no edges. */
function reachableNodeIds(graph, triggerNodeId) {
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  if (!edges.length || !triggerNodeId) return null;
  const adjacency = new Map();
  for (const edge of edges) {
    const from = clean(edge?.from);
    const to = clean(edge?.to);
    if (!from || !to) continue;
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push(to);
  }
  const seen = new Set([triggerNodeId]);
  const queue = [triggerNodeId];
  while (queue.length) {
    const current = queue.shift();
    for (const next of adjacency.get(current) || []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen;
}

function finalize({ workflowRow, liveField, triggerNodeId, checks }) {
  const blockingNodes = checks
    .filter((c) => c.status === "blocked")
    .map((c) => ({ nodeId: c.nodeId, nodeType: c.nodeType, reason: c.reason, deltaTags: c.deltaTags, helperAction: c.helperAction }));
  const warnings = checks
    .filter((c) => c.status === "warning")
    .map((c) => ({ nodeId: c.nodeId, nodeType: c.nodeType, reason: c.reason, deltaTags: c.deltaTags, helperAction: c.helperAction }));
  const deltaTags = normalizeTags(checks.flatMap((c) => c.deltaTags || []));
  const status = blockingNodes.length ? "blocked" : warnings.length ? "warning" : "ready";
  return {
    kind: READINESS_KIND,
    status,
    ok: status !== "blocked",
    workflowRow,
    triggerNodeId,
    liveField,
    blockingNodes,
    warnings,
    deltaTags,
    checks,
  };
}

function normalizeTags(tags) {
  return Array.from(new Set((Array.isArray(tags) ? tags : []).map((t) => clean(t)).filter(Boolean)));
}

/**
 * Atomic delta-tag → config-field map. Each canonical readiness delta tag points
 * at the EXACT orchestration-config / sandbox-row field(s) the operator must
 * change to clear it. The canvas renders the node's border orange and fills ONLY
 * these fields (and the matching delta-tag shields) light-orange — the color IS
 * the guidance, no extra copy. `row:` prefixed keys are sandbox-row fields
 * (e.g. the execution adapter); bare keys are node-config fields.
 */
const READINESS_FIELD_HINTS = {
  [READINESS_DELTA_TAGS.MISSING_SERVER_SECRET]: ["authRef"],
  [READINESS_DELTA_TAGS.API_REGISTRY_ENV]: ["registryId", "integrationId", "authRef"],
  [READINESS_DELTA_TAGS.RUNTIME_LOCALITY]: ["row:adapter"],
  [READINESS_DELTA_TAGS.LOCAL_AGENT_UPGRADE_REQUIRED]: ["row:adapter", "row:agentHost"],
  [READINESS_DELTA_TAGS.INPUT_CONTRACT]: ["endpoint", "bodyTemplate", "samplePayload", "triggerInput"],
  [READINESS_DELTA_TAGS.SCHEDULED_INPUT_UNMAPPED]: ["endpoint", "bodyTemplate", "samplePayload", "triggerInput"],
  [READINESS_DELTA_TAGS.DOWNSTREAM_NODE_INCOMPATIBLE]: ["registryId", "integrationId"],
  [READINESS_DELTA_TAGS.SERVERLESS_SCHEDULE]: [],
  [READINESS_DELTA_TAGS.PUBLISHED_GRAPH_REQUIRED]: [],
};

/**
 * Flatten a readiness verdict into the per-node flag map the canvas/sidecar
 * consume: `{ [nodeId]: { severity, deltaTags, fields, configFields, rowFields,
 * reason, helperAction } }`. `severity` is "blocked" (orange) or "warning"
 * (lighter). The color is keyed only off these fields — nothing else renders.
 */
function readinessFieldFlags(readiness) {
  const out = {};
  const ingest = (entry, severity) => {
    const nodeId = clean(entry?.nodeId);
    if (!nodeId) return;
    const tags = normalizeTags(entry?.deltaTags);
    const fields = normalizeTags(tags.flatMap((t) => READINESS_FIELD_HINTS[t] || []));
    const prev = out[nodeId] || { severity: "warning", deltaTags: [], fields: [], reasons: [], helperActions: [] };
    out[nodeId] = {
      severity: severity === "blocked" || prev.severity === "blocked" ? "blocked" : "warning",
      deltaTags: normalizeTags([...prev.deltaTags, ...tags]),
      fields: normalizeTags([...prev.fields, ...fields]),
      configFields: normalizeTags([...prev.fields, ...fields].filter((f) => !f.startsWith("row:"))),
      rowFields: normalizeTags([...prev.fields, ...fields].filter((f) => f.startsWith("row:")).map((f) => f.slice(4))),
      reasons: [...prev.reasons, entry?.reason].filter(Boolean),
      helperActions: [...prev.helperActions, entry?.helperAction].filter(Boolean),
    };
  };
  for (const n of Array.isArray(readiness?.blockingNodes) ? readiness.blockingNodes : []) ingest(n, "blocked");
  for (const n of Array.isArray(readiness?.warnings) ? readiness.warnings : []) ingest(n, "warning");
  return out;
}

export {
  scanServerlessReadiness,
  readinessFieldFlags,
  classifyNodeLocality,
  collectInputRefs,
  collectAvailableInputKeys,
  READINESS_KIND,
  READINESS_DELTA_TAGS,
  READINESS_FIELD_HINTS,
  LOCAL_ONLY_ADAPTERS,
};
