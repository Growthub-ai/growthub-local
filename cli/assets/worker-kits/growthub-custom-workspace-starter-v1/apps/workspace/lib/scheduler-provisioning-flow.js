/**
 * Scheduler Provisioning Flow V1 — the governed "set it up for me" journey for
 * one sandbox-environment workflow, in the SAME step shape as the API Registry
 * creation cockpit (lib/api-registry-creation-flow.js) so it renders through the
 * same renderer and mental model.
 *
 * Honest state model (findings 1, 3, 4, 13). The journey distinguishes:
 *
 *   provider → cadence → auth → provision → reconfirm → bound
 *
 * and reads the server-stamped lifecycle status WITHOUT overclaiming:
 *
 *   unprovisioned · scaffolded · endpoint-confirmed · schedule-created ·
 *   scheduled · paused · needs-reconfirm · failed · canceled
 *
 *   - "endpoint-confirmed" means the destination returned 200, NOT that a
 *     provider schedule exists.
 *   - "schedule-created"/"scheduled" require provider schedule evidence
 *     (providerScheduleId) for provider-schedule providers, or an explicit
 *     external-manual confirmation for external-scheduling providers (Supabase).
 *   - `hasSchedule` is the durable concept the UI uses to keep lifecycle controls
 *     visible across paused / needs-reconfirm / endpoint-confirmed / failed.
 *
 * Auth + provider capability + URL truth are single-sourced from
 * lib/scheduler-providers.js. Pure, deterministic, secret-safe, never throws.
 */

import { normalizeCadence, cadenceToCron, describeCadence } from "./scheduler-cadence.js";
import { KNOWN_SCHEDULER_PROVIDERS, normalizeProvider, providerCaps, authCandidates, resolveAuthReadiness } from "./scheduler-providers.js";

const STEP_KIND = "growthub-scheduler-provisioning-state-v1";

// States that mean "a schedule artifact/registration exists" — lifecycle
// controls stay available across all of them (finding 3).
const SCHEDULE_BEARING = new Set(["scaffolded", "endpoint-confirmed", "schedule-created", "scheduled", "paused", "needs-reconfirm"]);

const STATUS_LABEL = {
  unprovisioned: "Not provisioned",
  scaffolded: "Endpoint scaffolded",
  "endpoint-confirmed": "Endpoint verified",
  "schedule-created": "Provider schedule created",
  scheduled: "Scheduled (trusted)",
  paused: "Paused",
  "needs-reconfirm": "Needs re-confirmation",
  failed: "Failed",
  canceled: "Canceled",
};

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

function deriveSchedulerProvisioningState(input = {}) {
  const row = isPlainObject(input.sandboxRow) ? input.sandboxRow : {};
  const workspaceConfig = isPlainObject(input.workspaceConfig) ? input.workspaceConfig : {};
  const canSave = input.canSave !== false; // the route is the hard gate
  const inlineEditing = input.inlineEditing === true;
  const inline = (action) => (inlineEditing ? null : action);

  const provider = clean(row.scheduleProvider).toLowerCase();
  const providerChosen = KNOWN_SCHEDULER_PROVIDERS.includes(provider);
  const caps = providerCaps(provider);
  const cadence = normalizeCadence(row.scheduleCadence);
  const { cron, error: cronError } = cadenceToCron(cadence, { cron: row.scheduleCron, timezone: row.scheduleTimezone });
  const cadenceScheduled = cadence !== "manual" && !cronError;

  const schedulerId = clean(row.schedulerRegistryId);
  const schedulerRow = findApiRegistryRow(workspaceConfig, schedulerId);
  const schedulerLinked = Boolean(schedulerId);

  // Auth — candidate-aware (finding 4), names only.
  const authRef = clean(schedulerRow?.authRef || row.scheduleProvider).toUpperCase();
  const auth = resolveAuthReadiness(authRef, input.configuredEnvRefs);
  const authConfigured = auth.configured;

  const scheduleStatus = clean(row.scheduleStatus).toLowerCase() || "unprovisioned";
  const providerScheduleId = clean(row.scheduleProviderScheduleId);
  const confirmationMode = clean(row.scheduleConfirmationMode);
  const paused = ["true", "1", "on", "yes"].includes(clean(row.schedulePaused).toLowerCase());

  const hasSchedule = SCHEDULE_BEARING.has(scheduleStatus);
  const endpointConfirmed = ["endpoint-confirmed", "schedule-created", "scheduled", "paused", "needs-reconfirm"].includes(scheduleStatus);
  const providerScheduleCreated = caps.createsProviderSchedule ? Boolean(providerScheduleId) : confirmationMode === "external-manual";
  const provisioned = scheduleStatus === "scheduled" || scheduleStatus === "schedule-created";
  const needsReconfirm = scheduleStatus === "needs-reconfirm";
  const failed = scheduleStatus === "failed";
  const scaffolded = scheduleStatus === "scaffolded";
  const trustedLive = provisioned && !paused && !needsReconfirm;

  const steps = [];

  steps.push({
    id: "provider",
    label: "Pick a scheduler provider",
    status: providerChosen ? "complete" : "active",
    description: providerChosen
      ? `${caps.label}${caps.createsProviderSchedule ? " — creates a provider schedule." : " — endpoint deploy; scheduling is external (Supabase pg_cron / dashboard)."}`
      : "Choose Supabase Edge Function or QStash Workflows schedule.",
    action: inline({ id: "edit-provider", label: providerChosen ? "Change provider" : "Choose provider" }),
  });

  steps.push({
    id: "cadence",
    label: "Choose how often it runs",
    status: cronError ? "blocked" : cadenceScheduled ? "complete" : "active",
    description: cronError ? cronError : describeCadence(cadence, { cron: row.scheduleCron, timezone: row.scheduleTimezone }),
    action: inline({ id: "edit-cadence", label: cadenceScheduled ? "Change cadence" : "Set cadence" }),
  });

  steps.push({
    id: "auth",
    label: "Scheduler auth resolves",
    status: !authRef ? "complete" : authConfigured ? "complete" : (providerChosen ? "pending" : "blocked"),
    description: !authRef
      ? "This scheduler needs no secret."
      : authConfigured
        ? `Scheduler secret ${auth.resolvedVia || authRef} resolves in this runtime.`
        : `Set one of ${authCandidates(authRef).join(" / ")} in .env.local (or your hosted runtime), then reopen. The value never reaches the browser.`,
    action: authRef && !authConfigured ? { id: "open-settings", label: "Manage in Settings", href: "/settings/apis-webhooks" } : null,
  });

  // The keystone — honest about WHAT was confirmed (finding 1 + 13).
  const provisionReady = providerChosen && cadenceScheduled && authConfigured && canSave;
  let provisionStatus;
  let provisionDescription;
  if (provisioned) {
    provisionStatus = "complete";
    provisionDescription = caps.createsProviderSchedule
      ? `Provider schedule created${providerScheduleId ? ` (id ${providerScheduleId})` : ""} and confirmed.`
      : "Endpoint verified and external schedule confirmed (Supabase pg_cron / dashboard).";
  } else if (failed) {
    provisionStatus = "blocked";
    provisionDescription = "Last provision attempt failed — fix the endpoint/auth and re-provision.";
  } else if (endpointConfirmed) {
    // Endpoint returned 200 but no provider schedule yet — DO NOT claim scheduled.
    provisionStatus = "active";
    provisionDescription = caps.createsProviderSchedule
      ? "Endpoint verified (200), but the provider schedule isn't created yet — provide provider credentials, then provision to create the schedule."
      : "Endpoint verified (200). Wire the recurring schedule in Supabase (pg_cron / dashboard), then confirm it here.";
  } else if (scaffolded) {
    provisionStatus = "active";
    provisionDescription = "Endpoint artifact generated. Deploy it, set its URL, then provision to verify + schedule.";
  } else if (!canSave) {
    provisionStatus = "blocked";
    provisionDescription = "Provisioning writes a server endpoint — requires a writable runtime (WORKSPACE_CONFIG_ALLOW_FS_WRITE=true or local dev).";
  } else {
    provisionStatus = provisionReady ? "active" : "blocked";
    provisionDescription = "Scaffold the endpoint, register the scheduler, and confirm — in one click.";
  }
  steps.push({
    id: "provision",
    label: caps.createsProviderSchedule ? "Provision & create schedule" : "Provision & verify endpoint",
    status: needsReconfirm ? "complete" : provisionStatus,
    description: provisionDescription,
    hint: !provisionReady && !hasSchedule && canSave ? "Finish provider, cadence, and auth first." : undefined,
    action: needsReconfirm
      ? null
      : (provisionReady && provisionStatus === "active") || failed
        ? { id: "provision-scheduler", label: provisioned ? "Re-provision" : endpointConfirmed && !caps.createsProviderSchedule ? "Confirm external schedule" : "Set it up for me" }
        : null,
  });

  steps.push({
    id: "reconfirm",
    label: "Re-confirm after runtime change",
    status: needsReconfirm ? "active" : trustedLive ? "complete" : "optional",
    description: needsReconfirm
      ? "This runtime changed (redeploy / read-only / auth gone / edited endpoint) — re-confirm with fresh evidence before it is trusted live."
      : trustedLive
        ? "No drift detected; the schedule is trusted."
        : "Drift re-confirmation becomes available once a schedule is provisioned.",
    action: needsReconfirm ? { id: "reconfirm-scheduler", label: "Re-confirm schedule" } : null,
  });

  steps.push({
    id: "bound",
    label: "Bound to the workflow",
    status: trustedLive && schedulerLinked && clean(row.runLocality).toLowerCase() === "serverless"
      ? "complete"
      : trustedLive
        ? "active"
        : "optional",
    description: trustedLive && schedulerLinked
      ? `Serverless runs delegate to "${schedulerId}" on the ${cadence} schedule.`
      : "Once trusted live, the workflow is bound serverless and runs on its cadence.",
    action: null,
  });

  for (const s of steps) { if (!s.hint) delete s.hint; }

  const required = steps.filter((s) => s.status !== "optional");
  const completedCount = required.filter((s) => s.status === "complete").length;
  const totalCount = required.length;
  const complete = trustedLive;
  const nextStep = steps.find((s) => s.status === "active")
    || steps.find((s) => s.status === "pending")
    || steps.find((s) => s.status === "blocked")
    || null;

  let score = 0;
  if (providerChosen) score = 20;
  if (providerChosen && cadenceScheduled) score = Math.max(score, 35);
  if (providerChosen && cadenceScheduled && authConfigured) score = Math.max(score, 50);
  if (scaffolded) score = Math.max(score, 55);
  if (endpointConfirmed) score = Math.max(score, 70);
  if (providerScheduleCreated) score = Math.max(score, 85);
  if (trustedLive) score = 100;
  if (needsReconfirm) score = Math.min(score, 80);
  if (failed) score = Math.min(score, 40);

  return {
    kind: STEP_KIND,
    version: 1,
    provider: providerChosen ? provider : "",
    providerChosen,
    createsProviderSchedule: caps.createsProviderSchedule,
    schedulingMode: caps.schedulingMode,
    cadence,
    cron: cron || null,
    cronError: cronError || null,
    cadenceScheduled,
    authConfigured,
    authResolvedVia: auth.resolvedVia,
    schedulerLinked,
    scheduleStatus,
    statusLabel: STATUS_LABEL[scheduleStatus] || scheduleStatus,
    confirmationMode: confirmationMode || null,
    providerScheduleId: providerScheduleId || null,
    providerScheduleCreated,
    endpointConfirmed,
    // Durable concept the UI uses so lifecycle controls survive pause/fail/drift.
    hasSchedule,
    paused,
    provisioned,
    needsReconfirm,
    failed,
    scaffolded,
    trustedLive,
    // Explicit per-action affordances so the drawer never guesses (finding 3).
    canProvision: provisionReady && !provisioned && !needsReconfirm,
    canReprovision: provisioned || endpointConfirmed || scaffolded || failed,
    canReconfirm: needsReconfirm,
    canPause: hasSchedule && !paused && provisioned,
    canResume: paused,
    canVerify: hasSchedule,
    canCancel: hasSchedule || failed,
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
        : trustedLive
          ? "Scheduled, durable, and confirmed."
          : endpointConfirmed && caps.createsProviderSchedule
            ? "Endpoint verified — create the provider schedule."
            : "Set this workflow up to run on a schedule.",
    steps,
  };
}

export { STEP_KIND, SCHEDULE_BEARING, STATUS_LABEL, deriveSchedulerProvisioningState };
