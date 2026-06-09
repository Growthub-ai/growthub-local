/**
 * Serverless Upgrade Onboarding V1 — derives the one-time "upgrade your
 * localhost workflow to a persistent, scheduled serverless workflow" nudge from
 * the workspace configuration state, following the same one-time onboarding
 * pattern as the lens walkthrough (workspace-ui-cache dismiss flag).
 *
 * It reads only the existing model: sandbox-environment rows and their
 * `runLocality` field (already part of the governed schema). When the operator
 * has workflows but none are serverless — and hasn't dismissed the nudge — the
 * upgrade path shows once.
 *
 * Pure + deterministic; never throws. The dismiss flag is read by the caller
 * from the governed workspace-ui-cache row and passed in.
 */

const SERVERLESS_UPGRADE_DISMISS_FLAG = "serverlessUpgradeDismissed";
const UPGRADE_STATE_KIND = "growthub-serverless-upgrade-state-v1";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

/** Is a sandbox row configured to run serverless? */
function rowIsServerless(row) {
  return isPlainObject(row) && clean(row.runLocality).toLowerCase() === "serverless";
}

/** Collect every sandbox-environment (workflow) row across the data model. */
function collectWorkflowRows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const rows = [];
  for (const object of objects) {
    if (object?.objectType !== "sandbox-environment") continue;
    for (const row of Array.isArray(object.rows) ? object.rows : []) {
      if (isPlainObject(row)) rows.push(row);
    }
  }
  return rows;
}

/**
 * Derive the serverless-upgrade onboarding state.
 *
 * @param {object} workspaceConfig
 * @param {object} [options]
 * @param {boolean} [options.dismissed] dismiss flag from workspace-ui-cache
 */
function deriveServerlessUpgradeState(workspaceConfig, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const rows = collectWorkflowRows(workspaceConfig);
  const serverlessCount = rows.filter(rowIsServerless).length;
  const localCount = rows.length - serverlessCount;
  const hasWorkflows = rows.length > 0;
  const dismissed = opts.dismissed === true || String(opts.dismissed || "") === "true";
  // Show the one-time path only when the operator has built workflows but none
  // are serverless yet — the moment the upgrade mental model is most useful.
  const showOnboarding = hasWorkflows && serverlessCount === 0 && !dismissed;
  return {
    kind: UPGRADE_STATE_KIND,
    version: 1,
    hasWorkflows,
    workflowCount: rows.length,
    serverlessCount,
    localCount,
    allLocal: hasWorkflows && serverlessCount === 0,
    dismissed,
    showOnboarding,
    headline: showOnboarding
      ? "Upgrade a workflow to serverless"
      : serverlessCount > 0
        ? "Serverless workflows are active"
        : "Workflows run locally",
    subheadline: showOnboarding
      ? "Make it persistent and scheduled — it runs on invocation through your configured adapter, not just on this machine."
      : "",
  };
}

export {
  SERVERLESS_UPGRADE_DISMISS_FLAG,
  UPGRADE_STATE_KIND,
  rowIsServerless,
  collectWorkflowRows,
  deriveServerlessUpgradeState,
};
