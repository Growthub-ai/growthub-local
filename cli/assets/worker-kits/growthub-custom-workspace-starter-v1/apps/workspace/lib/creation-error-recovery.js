/**
 * Creation Error Recovery V1 — turns raw failure signals from the creation
 * lane (test / create / refresh / resolver / read-only runtime) into a
 * structured, machine-readable recovery the cockpit can render as an exact next
 * action instead of a generic error string.
 *
 * Pure + deterministic. Input is already-safe (callers redact secrets before
 * passing detail). Output:
 *   { errorKind, retryable, requiredAction, suggestedRoute, safeDetail }
 */

function clean(value) {
  return String(value == null ? "" : value).trim();
}

const RECOVERY = {
  missing_auth_ref: {
    requiredAction: "Set an authRef on this API Registry row, then save the secret in Settings.",
    suggestedRoute: "/settings",
    retryable: false,
  },
  env_not_configured: {
    requiredAction: "Save the secret for this authRef in Settings → APIs & Webhooks (writes .env.local), then reopen.",
    suggestedRoute: "/settings",
    retryable: true,
  },
  api_test_failed: {
    requiredAction: "Check the baseUrl, endpoint, method, and auth header, then Test again.",
    suggestedRoute: "",
    retryable: true,
  },
  not_live_backed: {
    requiredAction: "Recreate the Data Source from the API Registry row so it is live-backed (sourceStorage + integrationId).",
    suggestedRoute: "/data-model",
    retryable: false,
  },
  missing_resolver: {
    requiredAction: "Add a resolver for this integration so refresh can shape the response into rows.",
    suggestedRoute: "/api/workspace/resolver-templates",
    retryable: true,
  },
  missing_integration_id: {
    requiredAction: "Set the Data Source object's integrationId to match the API Registry integrationId.",
    suggestedRoute: "/data-model",
    retryable: false,
  },
  source_refresh_failed: {
    requiredAction: "Re-run Test on the API, confirm the resolver returns rows, then Refresh again.",
    suggestedRoute: "",
    retryable: true,
  },
  read_only_runtime: {
    requiredAction: "Set WORKSPACE_CONFIG_ALLOW_FS_WRITE=true on a writable runtime (or edit growthub.config.json locally) to persist this.",
    suggestedRoute: "",
    retryable: false,
  },
  unknown: {
    requiredAction: "Retry; if it persists, inspect the response in the row's lastResponse.",
    suggestedRoute: "",
    retryable: true,
  },
};

/**
 * Classify a failure from a creation-lane action.
 *
 * @param {object} input
 * @param {string} input.phase      "test" | "create" | "refresh" | "resolver"
 * @param {number} [input.httpStatus]
 * @param {string} [input.reason]   route-supplied reason (e.g. "missing-resolver")
 * @param {string} [input.detail]   already-safe human message
 * @param {boolean} [input.readOnly] true when persistence is read-only (409)
 */
function classifyCreationError(input = {}) {
  const phase = clean(input.phase);
  const reason = clean(input.reason).toLowerCase().replace(/-/g, "_");
  const httpStatus = Number(input.httpStatus) || 0;
  const detail = clean(input.detail);

  let errorKind = "unknown";
  if (input.readOnly || httpStatus === 409) {
    errorKind = "read_only_runtime";
  } else if (reason && RECOVERY[reason]) {
    errorKind = reason; // route reasons like missing_resolver / not_live_backed
  } else if (reason === "not_live_backed") {
    errorKind = "not_live_backed";
  } else if (phase === "test") {
    errorKind = "api_test_failed";
  } else if (phase === "refresh") {
    errorKind = "source_refresh_failed";
  }

  const recovery = RECOVERY[errorKind] || RECOVERY.unknown;
  return {
    errorKind,
    retryable: recovery.retryable,
    requiredAction: recovery.requiredAction,
    suggestedRoute: recovery.suggestedRoute,
    safeDetail: detail || errorKind.replace(/_/g, " "),
  };
}

export { classifyCreationError };
