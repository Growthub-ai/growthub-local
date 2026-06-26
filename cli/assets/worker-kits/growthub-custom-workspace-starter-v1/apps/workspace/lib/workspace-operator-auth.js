/**
 * Mutation access boundary — single hook for operator/admin authorization on
 * high-impact governed workspace mutations (schedule install/uninstall, provider
 * sync, product sync). These routes can spend provider credentials, create/delete
 * remote infrastructure, and mutate workspace config, so they must sit behind the
 * SAME boundary as any governed write.
 *
 * In the open-source starter kit this is intentionally a NO-OP: the kit is
 * local/dev-only unless the host application wraps these routes. Hosted
 * deployments (e.g. Agency Portal / private) replace this with a real check —
 * session/role, the same middleware that guards `/api/workspace`, or an app-scope
 * gate — WITHOUT changing any route: every mutation route calls this one function.
 *
 * Returns { ok: true } when allowed, or { ok: false, status, error } to reject.
 */

function requireWorkspaceOperator(_request) {
  // Starter kit: no built-in auth. Host app is responsible for protecting these
  // routes (reverse proxy, middleware, or platform auth). Set
  // GROWTHUB_REQUIRE_OPERATOR_AUTH=true with no provider configured to hard-block
  // mutations on an unprotected public deployment.
  if (String(process.env.GROWTHUB_REQUIRE_OPERATOR_AUTH || "").trim() === "true") {
    return {
      ok: false,
      status: 403,
      error: "operator authorization required but no operator auth provider is configured for this deployment",
    };
  }
  return { ok: true };
}

export { requireWorkspaceOperator };
