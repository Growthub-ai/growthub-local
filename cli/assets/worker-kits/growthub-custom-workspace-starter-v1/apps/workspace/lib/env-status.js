/**
 * Env Status V1 — the honest, secret-safe "which referenced env keys actually
 * resolve right now" signal.
 *
 * The creation cockpit (api-registry drawer) cannot read process.env in the
 * browser, so auth readiness must come from a server signal. This module is the
 * pure core of `GET /api/workspace/env-status`: given the governed config and
 * the runtime environment it returns the set of *referenced* auth/env ref slugs
 * whose candidate keys resolve to a value — slugs only, never a value.
 *
 * Pure + env-injectable so it is deterministically testable.
 */

import { describePostgresAdapter } from "./adapters/persistence/postgres.js";
import { describeQstashKvAdapter } from "./adapters/persistence/qstash-kv.js";
import { describeProviderManagedAdapter } from "./adapters/persistence/provider-managed.js";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

/** Canonical UPPER_SNAKE candidate expansion for a logical ref. */
function envKeyCandidates(ref) {
  const token = clean(ref).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase();
  if (!token) return [];
  return Array.from(new Set([token, `${token}_API_KEY`, `${token}_TOKEN`]));
}

/**
 * Collect every auth/env ref slug referenced by the governed config:
 *   - api-registry rows: authRef
 *   - data-source rows:  authRef
 *   - sandbox-environment rows: envRefs (comma-separated)
 * Returns the original ref strings (deduped), preserving the operator's casing
 * so the cockpit can match them against a registry row's authRef.
 */
function collectReferencedRefs(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const refs = new Set();
  for (const object of objects) {
    const rows = Array.isArray(object?.rows) ? object.rows : [];
    if (object?.objectType === "api-registry" || object?.objectType === "data-source") {
      for (const row of rows) {
        const ref = clean(row?.authRef);
        if (ref) refs.add(ref);
      }
    }
    if (object?.objectType === "sandbox-environment") {
      for (const row of rows) {
        for (const part of clean(row?.envRefs).split(",")) {
          const ref = clean(part);
          if (ref) refs.add(ref);
        }
      }
    }
  }
  return Array.from(refs);
}

/**
 * Return the referenced refs whose candidate keys resolve in `env`.
 * `env` is injectable (defaults to process.env). Never returns a value.
 */
function computeConfiguredEnvRefs(workspaceConfig, env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  const resolves = (ref) => envKeyCandidates(ref).some((key) => Boolean(source[key]));
  return collectReferencedRefs(workspaceConfig).filter(resolves);
}

/**
 * Persistence/serverless adapter env-readiness — single-sourced from the real
 * thin-adapter descriptors (postgres / qstash-kv / provider-managed). These are
 * the durable-runtime layers a serverless workflow needs; the cockpit surfaces
 * exactly which are env-ready so "make this workflow persistent + scheduled"
 * has an honest, actionable signal. Slugs/booleans only — never a value.
 */
function listPersistenceAdapterReadiness(env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  const descriptors = [describePostgresAdapter(), describeQstashKvAdapter(), describeProviderManagedAdapter()];
  return descriptors.map((d) => {
    const requiredEnv = Array.isArray(d.requiredEnv) ? d.requiredEnv : [];
    const missingEnv = requiredEnv.filter((k) => !source[k]);
    return {
      id: d.id,
      label: d.label,
      mode: d.mode,
      requiredEnv,
      // provider-managed needs no env (the deploy provider owns persistence).
      configured: requiredEnv.length === 0 ? true : missingEnv.length === 0,
      missingEnv,
    };
  });
}

export {
  envKeyCandidates,
  collectReferencedRefs,
  computeConfiguredEnvRefs,
  listPersistenceAdapterReadiness,
};
