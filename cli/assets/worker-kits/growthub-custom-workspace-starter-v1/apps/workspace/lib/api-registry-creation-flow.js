/**
 * API Registry Creation Flow V1 — the governed creation spine for one API.
 *
 * Pure derivation that powers the creation cockpit inside the api-registry
 * record drawer (DataModelShell). Given the live workspace config, the registry
 * row being edited, the source-records sidecar, and the safe runtime signal, it
 * resolves the full operator journey for THIS API as an ordered list of steps:
 *
 *   register → configure auth → test → (resolver) → sandbox tool → data source
 *   → refresh records
 *
 * Each step carries a status (complete | active | pending | blocked | optional),
 * a human description, and — when the operator can act — an `action` descriptor
 * the drawer maps to an existing handler (test / create-data-source /
 * create-sandbox-tool / open-data-source / refresh-source). The cockpit renders
 * this verbatim, so the journey is one derivation, not UI guesswork.
 *
 * Invariants:
 *   - Pure, deterministic, never throws on partial input. `runtime` /
 *     `sourceRecords` are injected (no fetch, no process.env, no React).
 *   - Auth "configured" is resolved ONLY from an explicit runtime signal
 *     (`runtime.configuredEnvRefs`, slugs) — never from a secret value, never
 *     guessed. Absent the signal the auth step stays pending with a verify hint.
 *   - Secret-safe: the output contains slugs, ids, counts, and booleans only.
 */

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function parseMaybeJson(value) {
  if (isPlainObject(value)) return value;
  const text = clean(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** A registry row is "registered" once it has an id and a reachable target. */
function isRegistered(row) {
  return Boolean(clean(row?.integrationId) && (clean(row?.baseUrl) || clean(row?.endpoint)));
}

/** Does this row's last test indicate success? Mirrors the drawer's testApiRecord. */
function isTested(row) {
  const status = clean(row?.status).toLowerCase();
  if (["connected", "ok", "success", "live", "tested"].includes(status)) return true;
  const resp = parseMaybeJson(row?.lastResponse);
  if (resp && (resp.ok === true || resp.status === 200)) return true;
  return false;
}

function findObjectsByType(workspaceConfig, objectType) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects.filter((o) => isPlainObject(o) && o.objectType === objectType);
}

function sandboxRowsForIntegration(workspaceConfig, integrationId) {
  const id = clean(integrationId);
  if (!id) return [];
  const rows = [];
  for (const object of findObjectsByType(workspaceConfig, "sandbox-environment")) {
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      const envRefs = clean(row?.envRefs);
      const schedulerId = clean(row?.schedulerRegistryId);
      const cfg = parseMaybeJson(row?.orchestrationConfig);
      const callsApi = Array.isArray(cfg?.nodes) && cfg.nodes.some(
        (n) => n?.type === "api-registry-call"
          && clean(n?.config?.registryId || n?.config?.integrationId) === id,
      );
      if (callsApi || schedulerId === id || envRefs.split(",").map(clean).includes(clean(row?.authRef))) {
        rows.push(row);
      }
    }
  }
  return rows;
}

function dataSourceRowsForIntegration(workspaceConfig, integrationId) {
  const id = clean(integrationId);
  if (!id) return [];
  const rows = [];
  for (const object of findObjectsByType(workspaceConfig, "data-source")) {
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (clean(row?.registryId) === id) rows.push({ row, objectId: object.id });
    }
  }
  return rows;
}

function sidecarHasRecords(sourceRecords, sourceId) {
  const key = clean(sourceId);
  if (!key || !isPlainObject(sourceRecords)) return false;
  const sidecar = sourceRecords[key];
  if (!isPlainObject(sidecar)) return false;
  if (Number.isFinite(sidecar.recordCount) && sidecar.recordCount > 0) return true;
  return Array.isArray(sidecar.records) && sidecar.records.length > 0;
}

const STEP_KIND = "growthub-api-registry-creation-state-v1";

/**
 * Derive the full creation state for one API Registry row.
 *
 * @param {object} input
 * @param {object} input.workspaceConfig
 * @param {object} input.registryRow       the row being edited (drawer draft)
 * @param {object} [input.sourceRecords]   source-records sidecar
 * @param {object} [input.runtime]         safe runtime signal (configuredEnvRefs[])
 */
function deriveApiRegistryCreationState(input = {}) {
  const workspaceConfig = isPlainObject(input.workspaceConfig) ? input.workspaceConfig : {};
  const row = isPlainObject(input.registryRow) ? input.registryRow : {};
  const sourceRecords = isPlainObject(input.sourceRecords) ? input.sourceRecords : {};
  const runtime = isPlainObject(input.runtime) ? input.runtime : {};

  const integrationId = clean(row.integrationId);
  const authRef = clean(row.authRef).toUpperCase();
  const registered = isRegistered(row);
  const tested = isTested(row);

  const configuredRefs = new Set(
    (Array.isArray(runtime.configuredEnvRefs) ? runtime.configuredEnvRefs : []).map((s) => clean(s).toUpperCase()),
  );
  const haveEnvSignal = Array.isArray(runtime.configuredEnvRefs);
  const authNeeded = Boolean(authRef);
  const authConfigured = !authNeeded || (haveEnvSignal && configuredRefs.has(authRef));

  const sandboxRows = sandboxRowsForIntegration(workspaceConfig, integrationId);
  const sandboxExists = sandboxRows.length > 0;
  const sourceLinks = dataSourceRowsForIntegration(workspaceConfig, integrationId);
  const sourceExists = sourceLinks.length > 0;
  const linkedSourceId = sourceExists ? clean(sourceLinks[0].row?.sourceId) : "";
  const linkedSourceObjectId = sourceExists ? clean(sourceLinks[0].objectId) : "";
  // refresh-sources keys the sidecar by the data-source OBJECT id; older rows
  // may have keyed by the row's sourceId. Check both so the step is honest.
  const hasRecords = sourceLinks.some(
    (link) => sidecarHasRecords(sourceRecords, clean(link.objectId))
      || sidecarHasRecords(sourceRecords, clean(link.row?.sourceId)),
  );

  // resolverTemplateId other than the passthrough "custom-http" means a real
  // shaping resolver is wired; "custom-http" / empty means raw passthrough.
  const resolverTemplate = clean(row.resolverTemplateId);
  const resolverWired = Boolean(resolverTemplate) && resolverTemplate !== "custom-http";

  const steps = [];
  const step = (s) => { steps.push(s); };

  step({
    id: "register",
    label: "Register the API",
    status: registered ? "complete" : "active",
    description: registered
      ? `Registered as "${integrationId}".`
      : "Fill integrationId and a baseUrl or endpoint on this row.",
    action: registered ? null : { id: "edit", label: "Edit fields" },
  });

  step({
    id: "auth",
    label: "Configure auth secret",
    status: !authNeeded
      ? (registered ? "complete" : "blocked")
      : authConfigured
        ? "complete"
        : (registered ? "pending" : "blocked"),
    description: !authNeeded
      ? "This API needs no secret."
      : authConfigured
        ? `Secret for ${authRef} resolves in this runtime.`
        : `Save the secret for ${authRef} in Settings → APIs & Webhooks (writes .env.local).`,
    hint: authNeeded && !authConfigured && !haveEnvSignal
      ? "Save the secret, then reopen — the cockpit confirms it resolves. The value never reaches the browser."
      : undefined,
    action: authNeeded && !authConfigured ? { id: "open-settings", label: "Open Settings", href: "/settings" } : null,
  });

  step({
    id: "test",
    label: "Test the API",
    status: tested
      ? "complete"
      : (registered && authConfigured ? "active" : "blocked"),
    description: tested
      ? "Last test succeeded — lastResponse saved."
      : "Run a server-side test; the secret stays server-side via authRef.",
    action: !tested && registered && authConfigured ? { id: "test", label: "Test API" } : null,
  });

  step({
    id: "resolver",
    label: "Shape the response (resolver)",
    status: resolverWired ? "complete" : (tested ? "optional" : "blocked"),
    description: resolverWired
      ? `Resolver "${resolverTemplate}" shapes the response into rows.`
      : "Optional: add a resolver to normalize the response into governed rows. Raw passthrough works without one.",
    action: tested && !resolverWired ? { id: "open-resolver", label: "Add resolver", href: "/api/workspace/resolver-templates" } : null,
  });

  step({
    id: "data-source",
    label: "Create a Data Source",
    status: sourceExists
      ? "complete"
      : (tested ? "active" : "blocked"),
    description: sourceExists
      ? `Data Source linked (sourceId "${linkedSourceId}").`
      : "Turn the tested API into a governed Data Source.",
    action: !sourceExists && tested
      ? { id: "create-data-source", label: "Create Data Source" }
      : (sourceExists ? { id: "open-data-source", label: "Open Data Source", objectId: linkedSourceObjectId } : null),
  });

  step({
    id: "refresh",
    label: "Refresh source records",
    status: hasRecords
      ? "complete"
      : (sourceExists ? "active" : "blocked"),
    description: hasRecords
      ? "The Data Source has hydrated records."
      : "Pull live records into the workspace from the Data Source.",
    action: sourceExists && !hasRecords
      ? { id: "refresh-source", label: "Refresh source", sourceId: linkedSourceId, objectId: linkedSourceObjectId }
      : null,
  });

  // Optional automation lane — a sandbox/workflow that calls this API.
  step({
    id: "sandbox-tool",
    label: "Automate (sandbox tool)",
    status: sandboxExists ? "complete" : (tested ? "optional" : "blocked"),
    description: sandboxExists
      ? "A sandbox tool calls this API."
      : "Optional: wrap this API in a sandbox/workflow you can run or schedule.",
    action: tested && !sandboxExists ? { id: "create-sandbox-tool", label: "Create sandbox tool" } : null,
  });

  for (const s of steps) { if (!s.hint) delete s.hint; }

  const required = steps.filter((s) => s.status !== "optional");
  const completedCount = required.filter((s) => s.status === "complete").length;
  const totalCount = required.length;
  const complete = completedCount >= totalCount;
  // The active step (or first pending/blocked) is the operator's next move.
  const nextStep = steps.find((s) => s.status === "active")
    || steps.find((s) => s.status === "pending")
    || steps.find((s) => s.status === "blocked")
    || null;

  // Activation score — milestone-based, tied to real evidence (not a raw
  // step-count progress bar). Each threshold corresponds to a concrete,
  // derived state transition the operator can verify.
  let score = 0;
  if (registered) score = 20;
  if (registered && authConfigured) score = Math.max(score, 35);
  if (tested) score = Math.max(score, 50);
  if (sourceExists) score = Math.max(score, 65);
  if (hasRecords) score = Math.max(score, 80);
  if (sandboxExists) score = Math.max(score, 90);
  if (complete) score = 100;

  return {
    kind: STEP_KIND,
    version: 1,
    integrationId,
    registered,
    tested,
    authNeeded,
    authConfigured,
    sandboxExists,
    sourceExists,
    hasRecords,
    completedCount,
    totalCount,
    complete,
    score,
    nextStepId: nextStep ? nextStep.id : null,
    nextAction: nextStep && nextStep.action ? { stepId: nextStep.id, ...nextStep.action } : null,
    headline: !registered
      ? "Register this API to begin."
      : complete
        ? "This API is live end-to-end."
        : "Finish wiring this API into the workspace.",
    steps,
  };
}

export {
  STEP_KIND,
  isRegistered,
  isTested,
  sandboxRowsForIntegration,
  dataSourceRowsForIntegration,
  sidecarHasRecords,
  deriveApiRegistryCreationState,
};
