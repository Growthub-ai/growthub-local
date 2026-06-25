/**
 * Growthub Workspace App-Readiness V1 — ship-readiness deriver.
 *
 * Composes the signals the workspace already records into ONE app-scoped
 * eligibility verdict: `{ ready, blocking[], nextAction }`. Eligibility, not a
 * flag — readiness is computed from the live state every call, never stored.
 *
 * Signal sources, all already present in the read-only metadata graph the
 * Workspace Map builds:
 *   - integration.status      — an unconnected integration blocks its dependents
 *   - sandbox.authStatus      — an unauthenticated sandbox cannot run
 *   - pipelineHealth.status / latestOk — an untested or failing pipeline blocks
 *   - workflow.lifecycleStatus — a draft-only workflow is a soft (non-blocking)
 *                                signal that proof is still pending
 *
 * Callers that hold richer signals (env-status, deploy check shape, swarm
 * eligibility) may pass them via `options.extraBlockers` / `options.extraSignals`
 * — they are merged in without changing the shape. Pure: no fetch, no fs, no
 * writes, no secrets. Deterministic ordering so receipts/diffs stay clean.
 */

const APP_READINESS_KIND = "growthub-workspace-app-readiness-v1";
const APP_READINESS_VERSION = 1;

// Severity rank → lower sorts first (most urgent blocker becomes nextAction).
const SEVERITY = { blocker: 0, warning: 1 };

function safeString(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function isConnected(status) {
  const s = safeString(status).toLowerCase();
  return s === "connected" || s === "ok" || s === "active" || s === "ready";
}

// Three-state auth: "authed" | "unauthed" | "unknown". Empty is UNKNOWN, never
// silently "authed" — unknown auth must not pass as ready (review finding D).
function authState(status) {
  const s = safeString(status).toLowerCase();
  if (["authed", "authenticated", "ok", "connected", "ready"].includes(s)) return "authed";
  if (!s) return "unknown";
  return "unauthed";
}

// A local / no-auth sandbox legitimately has no credential — an intentional
// exception, not a silent default.
function isNoAuthSandbox(summary) {
  const locality = safeString(summary.runLocality).toLowerCase();
  const adapter = safeString(summary.adapter).toLowerCase();
  const provider = safeString(summary.authProvider).toLowerCase();
  return locality === "local" || adapter.includes("local") || provider === "none" || provider === "local";
}

/**
 * @param {object} graph a `buildWorkspaceMetadataGraph` envelope
 * @param {object} [options]
 * @param {string} [options.appId] restrict to nodes scoped to this app (when
 *        node summaries carry `appId`/`appScope`); omit for workspace scope.
 * @param {Array<{severity?:string,code:string,message:string,nextAction?:string}>} [options.extraBlockers]
 * @param {object} [options.extraSignals] merged verbatim into `signals`.
 * @returns {object} `{ kind, version, appId, ready, score, blocking[], warnings[], signals, nextAction, summary }`
 */
function deriveAppReadiness(graph, options = {}) {
  const appId = safeString(options.appId).trim() || null;

  const empty = (warning) => ({
    kind: APP_READINESS_KIND,
    version: APP_READINESS_VERSION,
    appId,
    ready: false,
    score: 0,
    blocking: [],
    warnings: warning ? [warning] : [],
    signals: {},
    nextAction: null,
    summary: "No readiness computed."
  });

  if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes)) {
    return empty("graph missing or malformed");
  }

  const inScope = (node) => {
    if (!appId) return true;
    const scope = node.summary && (node.summary.appId || node.summary.appScope);
    return safeString(scope) === appId;
  };

  const nodes = graph.nodes.filter(inScope);
  const issues = [];
  const counts = { integrations: 0, sandboxes: 0, pipelines: 0, workflows: 0 };

  for (const node of nodes) {
    const s = node.summary || {};
    if (node.type === "integration") {
      counts.integrations += 1;
      if (!isConnected(s.status)) {
        issues.push({
          severity: "blocker",
          code: "integration_not_connected",
          subject: node.label || node.id,
          message: `Integration "${node.label || node.id}" is ${safeString(s.status) || "not connected"}.`,
          nextAction: `Connect integration "${node.label || node.id}" (test-source / auth), then re-check readiness.`
        });
      }
    } else if (node.type === "sandbox") {
      counts.sandboxes += 1;
      const state = authState(s.authStatus);
      const subject = node.label || node.id;
      if (state === "authed" || isNoAuthSandbox(s)) {
        // authed, or a deliberate local/no-auth sandbox — ready.
      } else if (state === "unknown") {
        issues.push({
          severity: "warning",
          code: "sandbox_auth_unknown",
          subject,
          message: `Sandbox "${subject}" has no auth status — cannot confirm it can run, and it is not marked local/no-auth.`,
          nextAction: `Authenticate sandbox "${subject}", or mark it local/no-auth (runLocality: local) if it needs no credential.`
        });
      } else {
        issues.push({
          severity: "blocker",
          code: "sandbox_unauthenticated",
          subject,
          message: `Sandbox "${subject}" auth status is ${safeString(s.authStatus)}.`,
          nextAction: `Authenticate sandbox "${subject}" before running.`
        });
      }
    } else if (node.type === "pipelineHealth") {
      counts.pipelines += 1;
      const status = safeString(s.status).toLowerCase();
      if (status === "untested" || s.latestOk === false) {
        issues.push({
          severity: status === "untested" ? "warning" : "blocker",
          code: status === "untested" ? "pipeline_untested" : "pipeline_failing",
          subject: node.label || node.id,
          message: `Pipeline "${node.label || node.id}" is ${status || "failing"}.`,
          nextAction: status === "untested"
            ? `Run "${node.label || node.id}" once to prove it (POST /api/workspace/sandbox-run).`
            : `Investigate the last failing run of "${node.label || node.id}".`
        });
      }
    } else if (node.type === "workflow") {
      counts.workflows += 1;
      if (safeString(s.lifecycleStatus).toLowerCase() === "draft") {
        issues.push({
          severity: "warning",
          code: "workflow_draft_only",
          subject: node.label || node.id,
          message: `Workflow "${node.label || node.id}" is draft-only — durable proof pending.`,
          nextAction: `Prove "${node.label || node.id}" with a sandbox run, then publish.`
        });
      }
    }
  }

  for (const extra of Array.isArray(options.extraBlockers) ? options.extraBlockers : []) {
    if (!extra || !extra.code) continue;
    issues.push({
      severity: extra.severity === "warning" ? "warning" : "blocker",
      code: safeString(extra.code),
      subject: safeString(extra.subject) || safeString(extra.code),
      message: safeString(extra.message) || safeString(extra.code),
      nextAction: extra.nextAction ? safeString(extra.nextAction) : null
    });
  }

  issues.sort((a, b) =>
    (SEVERITY[a.severity] ?? 9) - (SEVERITY[b.severity] ?? 9) ||
    a.code.localeCompare(b.code) ||
    a.subject.localeCompare(b.subject)
  );

  const blocking = issues.filter((i) => i.severity === "blocker");
  const warnings = issues.filter((i) => i.severity === "warning");
  const ready = blocking.length === 0;

  // Score: 100 when ready and clean; each blocker −25, each warning −5, floored at 0.
  const score = Math.max(0, 100 - blocking.length * 25 - warnings.length * 5);
  const nextAction = (blocking[0]?.nextAction)
    || (warnings[0]?.nextAction)
    || (ready ? "Ready — promote/deploy through the governed lane." : null);

  return {
    kind: APP_READINESS_KIND,
    version: APP_READINESS_VERSION,
    appId,
    ready,
    score,
    blocking,
    warnings,
    signals: { ...counts, ...(options.extraSignals && typeof options.extraSignals === "object" ? options.extraSignals : {}) },
    nextAction,
    summary: summarizeReadiness(appId, ready, blocking, warnings, score)
  };
}

function summarizeReadiness(appId, ready, blocking, warnings, score) {
  const scope = appId ? `App "${appId}"` : "Workspace";
  if (ready && !warnings.length) return `${scope} is ready to ship (score ${score}).`;
  if (ready) return `${scope} is ready (score ${score}) with ${warnings.length} warning(s).`;
  return `${scope} is blocked (score ${score}): ${blocking.length} blocker(s), ${warnings.length} warning(s).`;
}

export {
  APP_READINESS_KIND,
  APP_READINESS_VERSION,
  deriveAppReadiness,
  summarizeReadiness
};
