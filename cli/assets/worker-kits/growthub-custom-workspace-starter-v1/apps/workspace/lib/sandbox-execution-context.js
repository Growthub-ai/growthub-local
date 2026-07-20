/**
 * Governed inference trust context for sandbox-run execution.
 *
 * This is the single seam that decides, from SERVER-OWNED row state only,
 * whether a run executes with live evidence requirements: published signed
 * manifests, mandatory server-side child-receipt resolution, and concrete
 * tenant-scope binding. The sandbox-run route spreads this object into the
 * orchestration runner's executionContext; unit tests drive the exact same
 * function, so the wiring the HTTP boundary activates is executable test
 * surface rather than route-only code.
 *
 * Trust rules encoded here:
 * - `liveExecution` / `inferenceManifestsRequired` derive from the persisted
 *   row's lifecycleStatus plus the caller's useDraft flag ONLY. Request
 *   metadata cannot enable or disable them (a draft run of a live row is the
 *   one caller-selectable downgrade, and it cannot publish or replay live
 *   state — the publish/live gates reject draft evidence).
 * - lifecycleStatus comparison is case-normalized: a row persisted as
 *   "Live" is live. An un-normalized comparison here would silently skip
 *   manifest and resolver enforcement for exactly the rows that need it.
 * - the child receipt resolver is wrapped so every resolution carries the
 *   server-derived app scope; callers cannot substitute their own.
 */

function normalizedLifecycleStatus(row) {
  return String(row?.lifecycleStatus || "draft").trim().toLowerCase();
}

export function buildInferenceTrustContext({
  row,
  useDraft = false,
  appScope = "",
  resolveContinuation,
  resolveChildReceipt,
} = {}) {
  const live = useDraft !== true && normalizedLifecycleStatus(row) === "live";
  const scopedAppScope = String(appScope || "workspace-wide");
  return {
    // Published manifests bound to the live workflow version; the gateway
    // rejects a pool serving a different composite SHA. On a LIVE (non-draft)
    // run, a control-plane integration without its published signed manifest
    // is refused outright.
    inferenceManifests: Array.isArray(row?.inferenceManifests) ? row.inferenceManifests : [],
    inferenceManifestsRequired: live,
    // Live execution also requires server-owned child-receipt resolution and
    // a concrete tenant scope at the gateway (child_receipt_resolver_required
    // / child_receipt_scope_unbound fail closed before transport).
    liveExecution: live,
    ...(typeof resolveContinuation === "function"
      ? { resolveInferenceContinuation: resolveContinuation }
      : {}),
    ...(typeof resolveChildReceipt === "function"
      ? {
          // Server-owned child receipt resolution: continuations carry only an
          // opaque child receipt id; the canonical receipt is read from the
          // persisted invocation stream and the caller-shaped body discarded.
          // The runner injects the per-node policy/model identity.
          resolveChildReceipt: (args) => resolveChildReceipt({
            ...args,
            appScope: scopedAppScope,
          }),
        }
      : {}),
  };
}
