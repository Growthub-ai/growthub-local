/**
 * Scheduler Provisioning Flow V1 — the governed "set it up for me" journey for
 * one sandbox-environment workflow, expressed in the EXACT same step shape as
 * the API Registry creation cockpit (lib/api-registry-creation-flow.js) so it
 * renders through the same cockpit interface and mental model.
 *
 * It is the no-code spine of "make this workflow persistent + scheduled":
 *
 *   pick provider → choose cadence → scheduler auth resolves → provision
 *   (scaffold endpoint + register scheduler row + create schedule + confirm 200)
 *   → bound to the workflow
 *
 * Pure + deterministic; never reads process.env, never throws. Secret-safe
 * (slugs/ids/cron/booleans only). Provisioning progress is read from the
 * server-stamped `scheduleStatus` field, exactly as the API Registry cockpit
 * reads the row's `status` — evidence, never optimism.
 */

import { normalizeCadence, cadenceToCron, describeCadence } from "./scheduler-cadence.js";
import { SCHEDULER_PROVIDERS, normalizeProvider, envCandidates } from "./workspace-scheduler-proposal.js";

const STEP_KIND = "growthub-scheduler-provisioning-state-v1";
const SCHEDULER_OK_STATUSES = new Set(["connected", "approved", "ok", "success", "live", "tested"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function findApiRegistryRow(workspaceConfig, integrationId) {
  const id = clean(integrationId);
  if (!id) return null;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    if (object?.objectType !== "api-registry") continue;
    const match = (object.rows || []).find(
      (r) => clean(r?.integrationId) === id || clean(r?.id) === id || clean(r?.Name) === id,
    );
    if (match) return match;
  }
  return null;
}

/**
 * Derive the provisioning journey for a sandbox workflow row.
 *
 * @param {object} input
 * @param {object} input.sandboxRow            the workflow row (drawer draft)
 * @param {object} [input.workspaceConfig]     for scheduler-row lookup
 * @param {string[]} [input.configuredEnvRefs] auth/env slugs that resolve (env-status)
 * @param {boolean} [input.canSave]            filesystem-writable runtime (env-status / persistence)
 * @param {boolean} [input.inlineEditing]      true when the drawer's own fields are the editor
 */
function deriveSchedulerProvisioningState(input = {}) {
  const row = isPlainObject(input.sandboxRow) ? input.sandboxRow : {};
  const workspaceConfig = isPlainObject(input.workspaceConfig) ? input.workspaceConfig : {};
  const configuredRefs = new Set((Array.isArray(input.configuredEnvRefs) ? input.configuredEnvRefs : []).map((s) => clean(s).toUpperCase()));
  const canSave = input.canSave !== false; // default optimistic; the route is the hard gate
  const inlineEditing = input.inlineEditing === true;
  const inline = (action) => (inlineEditing ? null : action);

  const provider = clean(row.scheduleProvider).toLowerCase();
  const providerChosen = SCHEDULER_PROVIDERS.includes(provider);
  const cadence = normalizeCadence(row.scheduleCadence);
  const { cron, error: cronError } = cadenceToCron(cadence, { cron: row.scheduleCron });
  const cadenceScheduled = cadence !== "manual" && !cronError;

  const schedulerId = clean(row.schedulerRegistryId);
  const schedulerRow = findApiRegistryRow(workspaceConfig, schedulerId);
  const schedulerLinked = Boolean(schedulerId);
  const schedulerHealthy = Boolean(schedulerRow) && SCHEDULER_OK_STATUSES.has(clean(schedulerRow.status).toLowerCase());
  const authRef = clean(schedulerRow?.authRef || row.scheduleProvider).toUpperCase();
  const authConfigured = !authRef || configuredRefs.has(authRef);

  const scheduleStatus = clean(row.scheduleStatus).toLowerCase();
  const provisioned = scheduleStatus === "scheduled";
  const provisioning = scheduleStatus === "provisioning";
  const needsReconfirm = scheduleStatus === "needs-reconfirm";
  const failed = scheduleStatus === "failed";

  const steps = [];

  steps.push({
    id: "provider",
    label: "Pick a scheduler provider",
    status: providerChosen ? "complete" : "active",
    description: providerChosen
      ? `Provider "${provider}".`
      : "Choose Supabase Edge Function or QStash Workflows schedule.",
    action: inline({ id: "edit-provider", label: providerChosen ? "Change provider" : "Choose provider" }),
  });

  steps.push({
    id: "cadence",
    label: "Choose how often it runs",
    status: cronError ? "blocked" : cadenceScheduled ? "complete" : "active",
    description: cronError ? cronError : describeCadence(cadence, { cron: row.scheduleCron }),
    action: inline({ id: "edit-cadence", label: cadenceScheduled ? "Change cadence" : "Set cadence" }),
  });

  steps.push({
    id: "auth",
    label: "Scheduler auth resolves",
    status: !authRef
      ? "complete"
      : authConfigured
        ? "complete"
        : (providerChosen ? "pending" : "blocked"),
    description: !authRef
      ? "This scheduler needs no secret."
      : authConfigured
        ? `Scheduler secret ${authRef} resolves in this runtime.`
        : `Set one of ${envCandidates(authRef).join(" / ")} in .env.local (or your hosted runtime), then reopen.`,
    action: authRef && !authConfigured ? { id: "open-settings", label: "Manage in Settings", href: "/settings/apis-webhooks" } : null,
  });

  // The keystone: scaffold the endpoint + register the scheduler row + create
  // the schedule + confirm a 200. Status is read from the server-stamped
  // scheduleStatus, never assumed. The action POSTs to scheduler/provision.
  const provisionReady = providerChosen && cadenceScheduled && authConfigured && canSave;
  steps.push({
    id: "provision",
    label: "Provision & confirm (200)",
    status: provisioned || needsReconfirm
      ? "complete"
      : failed
        ? "blocked"
        : provisioning
          ? "pending"
          : provisionReady
            ? "active"
            : "blocked",
    description: provisioned
      ? "Scheduled and confirmed — the provider returned a 200."
      : failed
        ? `Last provision attempt failed${clean(row.scheduleLastResponse) ? "" : ""}. Re-run provisioning.`
        : provisioning
          ? "Provisioning in progress."
          : !canSave
            ? "Provisioning writes a server endpoint — requires a writable runtime (set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true or use local dev)."
            : "Scaffold the endpoint, register the scheduler, create the schedule, and confirm a 200 — in one click.",
    hint: !provisionReady && !provisioned && canSave
      ? "Finish provider, cadence, and auth first."
      : undefined,
    action: needsReconfirm
      ? null
      : (provisionReady && !provisioning) || failed
        ? { id: "provision-scheduler", label: provisioned ? "Re-provision" : "Set it up for me" }
        : null,
  });

  steps.push({
    id: "reconfirm",
    label: "Re-confirm after runtime change",
    status: needsReconfirm ? "active" : provisioned ? "complete" : "optional",
    description: needsReconfirm
      ? "This runtime changed (redeploy / read-only / disconnected) — re-confirm the schedule with a fresh 200 before it is trusted live."
      : provisioned
        ? "No drift detected; the schedule is trusted."
        : "Drift re-confirmation becomes available once a schedule is provisioned.",
    action: needsReconfirm ? { id: "reconfirm-scheduler", label: "Re-confirm schedule" } : null,
  });

  steps.push({
    id: "bound",
    label: "Bound to the workflow",
    status: provisioned && schedulerLinked && clean(row.runLocality).toLowerCase() === "serverless"
      ? "complete"
      : provisioned
        ? "active"
        : "optional",
    description: provisioned && schedulerLinked
      ? `Serverless runs delegate to "${schedulerId}" on the ${cadence} schedule.`
      : "Once provisioned, the workflow is bound serverless and runs on its cadence.",
    action: null,
  });

  for (const s of steps) { if (!s.hint) delete s.hint; }

  const required = steps.filter((s) => s.status !== "optional");
  const completedCount = required.filter((s) => s.status === "complete").length;
  const totalCount = required.length;
  const complete = provisioned && !needsReconfirm;
  const nextStep = steps.find((s) => s.status === "active")
    || steps.find((s) => s.status === "pending")
    || steps.find((s) => s.status === "blocked")
    || null;

  let score = 0;
  if (providerChosen) score = 20;
  if (providerChosen && cadenceScheduled) score = Math.max(score, 40);
  if (providerChosen && cadenceScheduled && authConfigured) score = Math.max(score, 60);
  if (provisioning) score = Math.max(score, 70);
  if (provisioned) score = 100;
  if (needsReconfirm) score = Math.min(score, 80);

  return {
    kind: STEP_KIND,
    version: 1,
    provider: providerChosen ? provider : "",
    providerChosen,
    cadence,
    cron: cron || null,
    cronError: cronError || null,
    cadenceScheduled,
    authConfigured,
    schedulerLinked,
    schedulerHealthy,
    scheduleStatus: scheduleStatus || "unprovisioned",
    provisioned,
    provisioning,
    needsReconfirm,
    failed,
    completedCount,
    totalCount,
    complete,
    score,
    nextStepId: nextStep ? nextStep.id : null,
    nextAction: nextStep && nextStep.action ? { stepId: nextStep.id, ...nextStep.action } : null,
    headline: !providerChosen
      ? "Schedule this workflow — pick a provider."
      : needsReconfirm
        ? "Runtime changed — re-confirm the schedule."
        : provisioned
          ? "Scheduled, durable, and confirmed."
          : "Set this workflow up to run on a schedule.",
    steps,
  };
}

export { STEP_KIND, deriveSchedulerProvisioningState };
