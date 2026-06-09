/**
 * Sandbox Serverless Flow V1 — the governed persistence + scheduling journey for
 * one sandbox-environment workflow row, expressed in the EXACT same step shape
 * as the API Registry creation cockpit (lib/api-registry-creation-flow.js) so it
 * renders through the same cockpit interface and mental model.
 *
 * It connects the dots that already exist:
 *   - runLocality local|serverless toggle (sandbox row)
 *   - execution adapter (sandbox-adapter-registry)
 *   - schedulerRegistryId reference field → an API Registry row that delegates
 *     the serverless run (sandbox-run's registry-delegation mode)
 *   - the scheduler row's authRef → resolved via env-status configuredEnvRefs
 *   - durable persistence via the real thin adapters (postgres / qstash-kv /
 *     provider-managed) surfaced by env-status persistenceAdapters
 *
 * Pure + deterministic; never reads process.env, never throws. Secret-safe
 * (slugs/ids/booleans only).
 */

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

const SCHEDULER_OK_STATUSES = new Set(["connected", "approved", "ok", "success", "live", "tested"]);
const STATE_KIND = "growthub-sandbox-serverless-state-v1";

function findApiRegistryRow(workspaceConfig, integrationId) {
  const id = clean(integrationId);
  if (!id) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    if (object?.objectType !== "api-registry") continue;
    const match = (object.rows || []).find((r) => clean(r?.integrationId) === id);
    if (match) return match;
  }
  return null;
}

/**
 * Derive the serverless/scheduling/persistence journey for a sandbox row.
 *
 * @param {object} input
 * @param {object} input.sandboxRow          the row being edited (drawer draft)
 * @param {object} [input.workspaceConfig]   for scheduler row lookup
 * @param {string[]} [input.configuredEnvRefs] auth/env slugs that resolve (env-status)
 * @param {object[]} [input.persistenceAdapters] [{id,label,mode,configured,missingEnv}]
 */
function deriveSandboxServerlessState(input = {}) {
  const row = isPlainObject(input.sandboxRow) ? input.sandboxRow : {};
  const workspaceConfig = isPlainObject(input.workspaceConfig) ? input.workspaceConfig : {};
  const configuredRefs = new Set((Array.isArray(input.configuredEnvRefs) ? input.configuredEnvRefs : []).map((s) => clean(s).toUpperCase()));
  const adapters = Array.isArray(input.persistenceAdapters) ? input.persistenceAdapters : [];
  // When the cockpit is rendered above the drawer's own editable fields
  // (locality toggle, adapter picker, scheduler reference dropdown), those steps
  // show status only — the inline field is the editor (no duplicate button).
  const inlineEditing = input.inlineEditing === true;
  const inline = (action) => (inlineEditing ? null : action);

  const locality = clean(row.runLocality).toLowerCase() === "serverless" ? "serverless" : "local";
  const isServerless = locality === "serverless";
  const adapterId = clean(row.adapter);
  const adapterChosen = Boolean(adapterId);

  const schedulerId = clean(row.schedulerRegistryId);
  const schedulerRow = isServerless ? findApiRegistryRow(workspaceConfig, schedulerId) : null;
  const schedulerLinked = isServerless ? Boolean(schedulerId) : true;
  const schedulerHealthy = Boolean(schedulerRow) && SCHEDULER_OK_STATUSES.has(clean(schedulerRow.status).toLowerCase());
  const schedulerAuthRef = clean(schedulerRow?.authRef).toUpperCase();
  const schedulerAuthConfigured = !schedulerAuthRef || configuredRefs.has(schedulerAuthRef);

  // Durable persistence: any real adapter that is env-ready. provider-managed is
  // always "ready" (the deploy provider owns persistence). qstash-kv/postgres
  // require their env keys — surfaced honestly with the missing keys.
  const durableAdapters = adapters.filter((a) => a && a.configured);
  const durableReady = durableAdapters.length > 0;
  const envBackedAdapter = durableAdapters.find((a) => Array.isArray(a.requiredEnv) && a.requiredEnv.length > 0) || durableAdapters[0] || null;

  const steps = [];

  steps.push({
    id: "locality",
    label: "Choose run locality",
    status: "complete",
    description: isServerless
      ? "Serverless — runs are delegated to a scheduler and persist across redeploy."
      : "Local — runs execute in-process on this machine.",
    action: inline({ id: "toggle-locality", label: isServerless ? "Switch to local" : "Switch to serverless" }),
  });

  steps.push({
    id: "adapter",
    label: "Pick an execution adapter",
    status: adapterChosen ? "complete" : "active",
    description: adapterChosen
      ? `Adapter "${adapterId}".`
      : "Select the execution adapter for this workflow.",
    action: adapterChosen ? null : inline({ id: "edit-adapter", label: "Choose adapter" }),
  });

  if (isServerless) {
    steps.push({
      id: "scheduler",
      label: "Link a scheduler",
      status: schedulerLinked ? (schedulerHealthy ? "complete" : "pending") : "active",
      description: !schedulerLinked
        ? "Set schedulerRegistryId to an API Registry row that delegates the serverless run."
        : schedulerHealthy
          ? `Scheduler "${schedulerId}" is connected.`
          : `Scheduler "${schedulerId}" is linked but not connected yet — test that API Registry row.`,
      hint: schedulerLinked && !schedulerRow ? "The referenced API Registry row was not found." : undefined,
      action: inline({ id: "link-scheduler", label: schedulerLinked ? "Review scheduler" : "Link scheduler" }),
    });

    steps.push({
      id: "scheduler-auth",
      label: "Scheduler auth resolves",
      status: !schedulerAuthRef
        ? (schedulerHealthy ? "complete" : "blocked")
        : schedulerAuthConfigured
          ? "complete"
          : (schedulerLinked ? "pending" : "blocked"),
      description: !schedulerAuthRef
        ? "The scheduler needs no secret."
        : schedulerAuthConfigured
          ? `Scheduler secret ${schedulerAuthRef} resolves in this runtime.`
          : `Save the scheduler secret ${schedulerAuthRef} in Settings → APIs & Webhooks.`,
      action: schedulerAuthRef && !schedulerAuthConfigured ? { id: "open-settings", label: "Open Settings", href: "/settings" } : null,
    });

    steps.push({
      id: "persistence",
      label: "Enable durable persistence",
      status: durableReady ? "complete" : "active",
      description: durableReady
        ? `Durable store ready (${(envBackedAdapter || durableAdapters[0]).label}).`
        : "Configure a durable store so serverless runs survive redeploy.",
      hint: durableReady
        ? undefined
        : adapters.length
          ? `Configure one adapter — e.g. ${adapters.filter((a) => !a.configured && (a.missingEnv || []).length).map((a) => `${a.label} (${a.missingEnv.join(", ")})`).join("; ") || "set the adapter env keys"}.`
          : "No persistence adapter signal yet.",
      action: durableReady ? null : { id: "open-settings", label: "Configure persistence", href: "/settings" },
    });
  }

  steps.push({
    id: "run",
    label: isServerless ? "Run on the scheduler" : "Run locally",
    status: "optional",
    description: isServerless
      ? "Once the scheduler, auth, and store are ready, run delegates to the serverless scheduler."
      : "Run this workflow in-process.",
    action: inline({ id: "run-sandbox", label: "Run" }),
  });

  for (const s of steps) { if (!s.hint) delete s.hint; }

  const required = steps.filter((s) => s.status !== "optional");
  const completedCount = required.filter((s) => s.status === "complete").length;
  const totalCount = required.length;
  const complete = completedCount >= totalCount;
  const nextStep = steps.find((s) => s.status === "active")
    || steps.find((s) => s.status === "pending")
    || steps.find((s) => s.status === "blocked")
    || null;

  // Milestone score tied to evidence.
  let score = isServerless ? 10 : 40;
  if (adapterChosen) score = Math.max(score, isServerless ? 25 : 70);
  if (isServerless && schedulerLinked) score = Math.max(score, 45);
  if (isServerless && schedulerHealthy) score = Math.max(score, 60);
  if (isServerless && schedulerAuthConfigured && schedulerLinked) score = Math.max(score, 75);
  if (isServerless && durableReady) score = Math.max(score, 90);
  if (complete) score = 100;

  return {
    kind: STATE_KIND,
    version: 1,
    locality,
    isServerless,
    adapterChosen,
    schedulerLinked,
    schedulerHealthy,
    schedulerAuthConfigured,
    durableReady,
    completedCount,
    totalCount,
    complete,
    score,
    nextStepId: nextStep ? nextStep.id : null,
    nextAction: nextStep && nextStep.action ? { stepId: nextStep.id, ...nextStep.action } : null,
    headline: !isServerless
      ? "This workflow runs locally."
      : complete
        ? "This workflow is scheduled and durable."
        : "Make this workflow persistent and scheduled.",
    steps,
  };
}

export { STATE_KIND, deriveSandboxServerlessState };
