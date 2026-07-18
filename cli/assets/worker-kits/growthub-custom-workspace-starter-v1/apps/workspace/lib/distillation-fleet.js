/**
 * Distillation fleet — Sprint 3: the mothership dynamic proxy, the router
 * signals harvested traces feed it, and the composed flywheel state. Pure:
 * no React, no fetch, no fs.
 *
 * THE CORE UNLOCK this module encodes: a custom model is a governed IDENTITY
 * + a ROUTING POLICY, not a weights file. The policy lives as metadata on an
 * ordinary API Registry row (`metadata.mothershipProxy`) — same PATCH
 * allowlist, same row shape the AI-Agent node and the custom-models cockpit
 * already consume — so the user's model is USABLE from day one:
 *
 *   priority 1  local tuned student  (requires tuned-tag VERIFIED evidence)
 *   priority 2  local base fallback  (Gemma-class via the local runtime)
 *   priority 3  frontier teacher     (requires a configured auth env NAME)
 *
 * Routing is EVIDENCE-GATED, never optimistic: deriveActiveRoute only ranks
 * a target its evidence supports, and names why for every skipped target.
 * Every proxied invocation is harvested as a distillation trace, so serving
 * through the proxy IS corpus growth — the flywheel's entry point.
 */

import { parseDistillationTraces, fnv1a64 } from "./distillation-gateway.js";
import { parseTrainingRunReceipts, TRAINING_RUN_OBJECT_TYPE } from "./training-run-receipts.js";
import { deriveEndpointVerification } from "./training-verification.js";

export const MOTHERSHIP_PROXY_KIND = "mothership-dynamic-proxy";
export const MOTHERSHIP_PROXY_SCHEMA = "growthub-mothership-proxy-v1";
export const ROUTE_TARGETS = ["local-student", "local-base", "teacher"];

/** Safe integration id fragment from a model tag. */
function safeIdFragment(tag) {
  return String(tag || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

/**
 * Build the mothership proxy policy row proposal — an ordinary api-registry
 * row (kind "custom-model", capabilityType "custom-model-inference", so the
 * cockpit and AI-Agent node treat it as any other custom model) carrying the
 * routing policy in metadata. No secrets: teacher auth is an env-var NAME.
 * Pure shape factory; the caller applies it through the governed PATCH lane.
 */
export function buildMothershipProxyRow({
  modelTag = "",
  workspaceSlug = "workspace-local",
  studentRegistryId = "",
  fallbackBaseModel = "",
  fallbackBaseUrl = "http://127.0.0.1:11434",
  teacher = null, // { providerId, baseUrl, modelTag, authEnvVar }
} = {}) {
  const tag = String(modelTag || "").trim();
  const frag = safeIdFragment(tag) || "custom-model";
  return {
    integrationId: `mothership-proxy-${frag}`,
    name: `${tag || "Custom model"} (mothership proxy)`,
    kind: "custom-model",
    capabilityType: "custom-model-inference",
    baseUrl: String(fallbackBaseUrl || "http://127.0.0.1:11434"),
    endpoint: "/v1/chat/completions",
    metadata: {
      mothershipProxy: {
        schema: MOTHERSHIP_PROXY_SCHEMA,
        modelTag: tag,
        workspaceSlug: String(workspaceSlug || "workspace-local"),
        routes: [
          { target: "local-student", registryId: String(studentRegistryId || ""), modelTag: tag },
          { target: "local-base", baseUrl: String(fallbackBaseUrl || "http://127.0.0.1:11434"), modelTag: String(fallbackBaseModel || "") },
          ...(teacher && typeof teacher === "object" ? [{
            target: "teacher",
            providerId: String(teacher.providerId || ""),
            baseUrl: String(teacher.baseUrl || ""),
            modelTag: String(teacher.modelTag || ""),
            authEnvVar: String(teacher.authEnvVar || ""),
          }] : []),
        ],
        // Serving through the proxy harvests traces — this flag is what the
        // UI renders as "every reply improves your model".
        harvestTraces: true,
      },
    },
  };
}

/**
 * Resolve which route is ACTIVE right now from live evidence:
 *   - studentVerified: tuned-tag verification passed (deriveEndpointVerification)
 *   - localRuntimeConnected: the local server answered a probe
 *   - teacherAuthPresent: the runner found the env var NAME set (boolean only)
 * Returns { active, order, skipped[] } — every skipped target carries the
 * exact reason, so the UI never shows an unexplained downgrade. Pure.
 */
export function deriveActiveRoute({ policyRow = null, studentVerified = false, localRuntimeConnected = false, teacherAuthPresent = false } = {}) {
  const policy = policyRow?.metadata?.mothershipProxy;
  const routes = Array.isArray(policy?.routes) ? policy.routes : [];
  if (routes.length === 0) {
    return { active: null, order: [], skipped: [], reason: "no mothership proxy policy on this row" };
  }
  const skipped = [];
  let active = null;
  const order = [];
  for (const route of routes) {
    const target = String(route?.target || "");
    if (target === "local-student") {
      if (studentVerified && localRuntimeConnected) order.push(route);
      else skipped.push({ target, reason: !studentVerified ? "student not tuned-tag verified yet" : "local runtime not recorded as connected — test the endpoint" });
    } else if (target === "local-base") {
      if (localRuntimeConnected && String(route.modelTag || "")) order.push(route);
      else skipped.push({ target, reason: !localRuntimeConnected ? "local runtime not recorded as connected — test the endpoint" : "no fallback base model chosen" });
    } else if (target === "teacher") {
      if (teacherAuthPresent && String(route.baseUrl || "")) order.push(route);
      else skipped.push({ target, reason: !teacherAuthPresent ? `teacher auth env (${String(route.authEnvVar || "unset")}) not present` : "teacher endpoint not configured" });
    } else {
      skipped.push({ target: target || "unknown", reason: "unrecognized route target" });
    }
  }
  active = order[0] || null;
  return {
    active,
    order,
    skipped,
    reason: active
      ? `serving via ${active.target}`
      : "no route currently serviceable — start the local runtime or configure the teacher",
  };
}

/**
 * Derive the proxy's serving state from the SAME governed evidence the
 * 16-state journey proves — never from caller-invented booleans:
 *   - student verification = deriveEndpointVerification over the student's
 *     api-registry row's stamped chat-completions `lastResponse` (the exact
 *     state-12 semantics: served tag must match the tuned tag, base demotes)
 *   - `localRuntimeConnected` = the row's RECORDED `connected` status (the
 *     same evidence state 14 renders as "Deployed · Healthy"). It is a
 *     stamped claim from the last test, NOT a live probe — named
 *     accordingly, and the route it gates is a derived recommendation the
 *     actual request path re-verifies at call time.
 *   - teacher availability cannot be read from the workspace (the auth env
 *     var exists only at runtime) — it rides in as explicit probe evidence,
 *     default false, honest.
 * Pure, never throws.
 */
export function deriveProxyServingState({ workspaceConfig, policyRow = null, baseModel = "", teacherAuthPresent = false } = {}) {
  const rows = registryRows(workspaceConfig);
  const policy = policyRow || rows.find((r) => r?.metadata?.mothershipProxy) || null;
  const meta = policy?.metadata?.mothershipProxy || null;
  const routes = Array.isArray(meta?.routes) ? meta.routes : [];
  const studentRoute = routes.find((r) => String(r?.target || "") === "local-student") || null;
  const studentRow = studentRoute
    ? rows.find((r) => String(r?.integrationId || "") === String(studentRoute.registryId || "")) || null
    : null;

  const verification = deriveEndpointVerification({
    registryRow: studentRow,
    expectedTag: String(studentRoute?.modelTag || meta?.modelTag || ""),
    baseModel,
  });
  const localRuntimeConnected = rows.some(
    (r) => String(r?.status || "") === "connected" && /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(String(r?.baseUrl || "")),
  );

  const route = deriveActiveRoute({
    policyRow: policy,
    studentVerified: verification.verified,
    localRuntimeConnected,
    teacherAuthPresent: teacherAuthPresent === true,
  });
  return { policyRow: policy, verification, localRuntimeConnected, ...route };
}

// ---------------------------------------------------------------------------
// Router signals — what harvested traces teach the dynamic router
// ---------------------------------------------------------------------------

/**
 * Aggregate router-facing signals from the harvested trace history:
 * expert-activation mass per cluster (expert affinity), KV-cache reuse hints
 * per cluster (locality), and volume. Pure, never throws.
 */
export function deriveRouterSignals({ workspaceSourceRecords = {}, slug = "workspace-local" } = {}) {
  const traces = parseDistillationTraces(workspaceSourceRecords, slug);
  const clusters = {};
  const expertActivations = {};
  for (const t of traces) {
    const cluster = t.clusterId || "uncategorized";
    clusters[cluster] = clusters[cluster] || { traceCount: 0, promptTokens: 0, reusablePrefixes: 0, topExperts: {} };
    const c = clusters[cluster];
    c.traceCount += 1;
    c.promptTokens += t.promptTokens;
    if (t.kvCacheHint?.reusable) c.reusablePrefixes += 1;
    if (t.expertActivations && typeof t.expertActivations === "object") {
      for (const [expertId, count] of Object.entries(t.expertActivations)) {
        const n = Math.max(0, Math.floor(Number(count) || 0));
        if (n === 0) continue;
        expertActivations[expertId] = (expertActivations[expertId] || 0) + n;
        c.topExperts[expertId] = (c.topExperts[expertId] || 0) + n;
      }
    }
  }
  const kvCacheHints = Object.entries(clusters).map(([clusterId, c]) => ({
    clusterId,
    traceCount: c.traceCount,
    avgPromptTokens: c.traceCount > 0 ? Math.round(c.promptTokens / c.traceCount) : 0,
    reusePct: c.traceCount > 0 ? Math.round((c.reusablePrefixes / c.traceCount) * 1000) / 10 : 0,
    prefixAffinityHash: fnv1a64(`${slug}:${clusterId}`),
    topExperts: Object.entries(c.topExperts).sort(([, a], [, b]) => b - a).slice(0, 8).map(([id]) => id),
  }));
  return {
    traceCount: traces.length,
    clusters: Object.keys(clusters).sort(),
    expertActivations,
    kvCacheHints,
  };
}

/**
 * Shard registration proposal — a promoted student (dense or sparse) becomes
 * a first-class fleet citizen: an api-registry row tagged with its cluster
 * affinity and sparsity so the router can place it. Pure shape factory.
 */
export function buildStudentShardRegistration({ modelTag = "", clusterId = "", baseUrl = "http://127.0.0.1:11434", sparsity = null, benchmarkWins = null, generation = 1 } = {}) {
  const tag = String(modelTag || "").trim();
  return {
    integrationId: `custom-model-shard-${safeIdFragment(tag) || "student"}`,
    name: `${tag} (fleet shard)`,
    kind: "custom-model",
    capabilityType: "custom-model-inference",
    baseUrl: String(baseUrl || "http://127.0.0.1:11434"),
    endpoint: "/v1/chat/completions",
    metadata: {
      fleetShard: {
        modelTag: tag,
        clusterId: String(clusterId || ""),
        generation: Math.max(1, Math.floor(Number(generation) || 1)),
        sparsity: sparsity && typeof sparsity === "object" ? {
          activeExpertsPct: Number(sparsity.activeExpertsPct) || 0,
          estimatedFlopsSavedPct: Number(sparsity.estimatedFlopsSavedPct) || 0,
        } : null,
        benchmarkWins: benchmarkWins && typeof benchmarkWins === "object" ? {
          winRatePct: Number(benchmarkWins.winRatePct) || 0,
          promoted: benchmarkWins.promoted === true,
        } : null,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Flywheel state — the composed journey deriver
// ---------------------------------------------------------------------------

/** All receipts (both write lanes) that carry distillation evidence. A
 *  data-model row persists `distillation` as a JSON string column — parse it
 *  so app-lane receipts count exactly like sidecar receipts. */
function distillationReceipts(workspaceConfig, workspaceSourceRecords, slug) {
  const sidecar = parseTrainingRunReceipts(workspaceSourceRecords, slug);
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const rowObject = objects.find((o) => o?.objectType === TRAINING_RUN_OBJECT_TYPE);
  const rows = (Array.isArray(rowObject?.rows) ? rowObject.rows : [])
    .filter((r) => r && typeof r === "object")
    .filter((r) => !slug || String(r?.modelTrainingRowId || "") === slug);
  return [...sidecar, ...rows]
    .map((r) => {
      let d = r?.distillation;
      if (typeof d === "string") { try { d = JSON.parse(d); } catch { d = null; } }
      return d && typeof d === "object" ? { ...r, distillation: d } : r;
    })
    .filter((r) => r?.distillation && typeof r.distillation === "object");
}

/** Registry rows of the workspace (pure read). */
function registryRows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const registry = objects.find((o) => o?.objectType === "api-registry");
  return Array.isArray(registry?.rows) ? registry.rows.filter((r) => r && typeof r === "object") : [];
}

export const FLYWHEEL_STEPS = [
  { id: "traces-harvested", label: "Teacher traces harvested" },
  { id: "student-trained", label: "Student trained" },
  { id: "benchmark-promoted", label: "Benchmark wins promoted" },
  { id: "sparse-specialized", label: "Sparse-MoE specialized" },
  { id: "shard-registered", label: "Registered with the fleet" },
  { id: "self-improving", label: "Self-improvement loop closed" },
];

/**
 * Derive the composed flywheel state over the SAME governed evidence the
 * training runtime reads — receipts (both lanes), the trace sidecar, and the
 * API Registry. Additive: it never re-derives or overrides the #273 runtime
 * ladder; it reports the distillation journey alongside it. Pure, never
 * throws.
 */
export function deriveFlywheelState({ workspaceConfig, workspaceSourceRecords, slug = "workspace-local" } = {}) {
  const traces = parseDistillationTraces(workspaceSourceRecords, slug);
  const receipts = distillationReceipts(workspaceConfig, workspaceSourceRecords, slug);
  const rows = registryRows(workspaceConfig);

  const captureReceipts = receipts.filter((r) => String(r?.runKind || "") === "trace-capture");
  const trainingReceipts = receipts.filter((r) => String(r?.runKind || "") !== "trace-capture");
  const tracesHarvested = traces.length > 0 || captureReceipts.some((r) => (Number(r.distillation?.traceCount) || 0) > 0);

  const studentReceipts = trainingReceipts.filter((r) => ["completed", "imported", "verified"].includes(String(r?.status || "").toLowerCase()));
  const studentTrained = studentReceipts.length > 0;
  const benchmarkPromoted = trainingReceipts.some((r) => r.distillation?.benchmarkWins?.promoted === true);
  const sparseSpecialized = trainingReceipts.some(
    (r) => String(r.distillation?.studentArchitecture || "") === "sparse-moe" && (Number(r.distillation?.sparsity?.activeExpertsPct) || 0) > 0,
  );
  const proxyRow = rows.find((r) => r?.metadata?.mothershipProxy) || null;
  const shardRegistered = rows.some((r) => r?.metadata?.fleetShard);

  // Self-improvement: a later-generation student exists (gen n+1 trained on
  // traces served by gen n) — visible in receipt history, not vibes.
  const generations = trainingReceipts.map((r) => Number(r.distillation?.generation) || 0).filter((g) => g > 0);
  const maxGeneration = generations.length ? Math.max(...generations) : 0;
  const selfImproving = maxGeneration >= 2;

  const done = {
    "traces-harvested": tracesHarvested,
    "student-trained": studentTrained,
    "benchmark-promoted": benchmarkPromoted,
    "sparse-specialized": sparseSpecialized,
    "shard-registered": shardRegistered,
    "self-improving": selfImproving,
  };
  const steps = FLYWHEEL_STEPS.map((s) => ({ ...s, done: done[s.id] === true }));
  const firstOpen = steps.find((s) => !s.done) || null;

  const NEXT_BY_STEP = {
    "traces-harvested": "Point your agents/nodes at the model — the gateway harvests every exchange as governed training evidence.",
    "student-trained": "Run the sized one-click training plan (or keep harvesting until a training-capable machine is available).",
    "benchmark-promoted": "Run the eval harness — the student takes routing priority only after it wins on your own tasks.",
    "sparse-specialized": "Calibrate expert routing and train the sparse student for cheaper, faster serving.",
    "shard-registered": "Register the promoted student as a fleet shard so the router can place it.",
    "self-improving": "Keep using the student — its own traces become the next generation's corpus.",
  };

  return {
    steps,
    completed: steps.filter((s) => s.done).length,
    total: steps.length,
    traceCount: traces.length,
    generation: maxGeneration,
    proxyRow,
    hasProxy: Boolean(proxyRow),
    next: firstOpen ? NEXT_BY_STEP[firstOpen.id] : NEXT_BY_STEP["self-improving"],
    nextStepId: firstOpen ? firstOpen.id : "",
  };
}
