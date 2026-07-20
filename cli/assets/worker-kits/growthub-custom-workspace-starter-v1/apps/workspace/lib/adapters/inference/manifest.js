/**
 * Inference manifest compiler — the draft -> publish -> runtime handshake.
 *
 * A manifest binds a workflow version to the exact model identity it was
 * proven against: composite SHA over base model + allowed adapters + schema,
 * plus the tool contract hash and bounded cost/cache policy. It is compiled
 * from the governed control-plane configuration during the draft test run,
 * signed with the workspace signing key, re-verified at publish against the
 * live API Registry state (mismatch blocks publish with a diff), stored on
 * the published row, and enforced again by the gateway on every invocation.
 *
 * Honesty boundary: a manifest is compiled only when the governed row
 * carries real, resolvable artifact hashes. Nothing is synthesized from a
 * missing artifact — an unbindable row yields `available: false` with the
 * exact reason, never a fabricated composite.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeSchemaContract, sha256Hex, stableStringify } from "./contracts.js";

/** Constant-time hex comparison; length mismatch is an immediate (safe) fail. */
function safeEqualHex(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export const INFERENCE_MANIFEST_VERSION = "1.0";
const SIGNING_KEY_ENV = "GROWTHUB_WORKSPACE_SIGNING_KEY";

function clean(value) {
  return String(value || "").trim();
}

function lowerSha(value) {
  const sha = clean(value).toLowerCase();
  return /^[0-9a-f]{64}$/.test(sha) ? sha : "";
}

export function resolveManifestSigningKey(env = process.env) {
  const key = clean(env?.[SIGNING_KEY_ENV]);
  if (!key) return null;
  return { key, keyId: sha256Hex(`growthub-manifest-key:${key}`).slice(0, 16) };
}

export function manifestSha256(manifest) {
  return sha256Hex(stableStringify(manifest));
}

export function compositeSha256({ baseModelSha256, adapterSha256s = [], schemaHash = "" }) {
  return sha256Hex({
    base_model_sha256: lowerSha(baseModelSha256),
    adapter_sha256s: [...adapterSha256s].map(lowerSha).sort(),
    schema_hash: String(schemaHash || ""),
  });
}

/**
 * Compile a manifest from the merged governed control-plane configuration.
 * Returns `{ available: false, reason }` when the row cannot be bound.
 */
export function compileInferenceManifest({
  workflowId = "",
  workflowVersion = "",
  integrationId = "",
  control = {},
  maxTokens = 0,
  now = () => Date.now(),
} = {}) {
  const runtime = control.runtime && typeof control.runtime === "object" ? control.runtime : {};
  const modelSpec = runtime.model || runtime.baseModel || control.base_model_ref || {};
  const baseModelSha256 = lowerSha(
    modelSpec.sha256 || modelSpec.base_model_sha256 || modelSpec.modelSha256 || modelSpec.artifact_ref?.sha256,
  );
  if (!baseModelSha256) {
    return { available: false, reason: "governed runtime does not declare a resolvable base-model SHA-256; manifest not compiled" };
  }
  const allowedAdapters = Array.isArray(runtime.allowedAdapters || runtime.loraAdapters)
    ? (runtime.allowedAdapters || runtime.loraAdapters)
    : [];
  const adapterRefs = [];
  const adapterShas = [];
  for (const adapter of allowedAdapters) {
    const ref = clean(adapter?.ref || adapter?.lora_ref || adapter?.lora_id || adapter?.adapter_ref?.id);
    const sha = lowerSha(adapter?.sha256 || adapter?.adapterSha256 || adapter?.adapter_sha256 || adapter?.adapter_ref?.sha256);
    if (!ref || !sha) {
      return { available: false, reason: `allowed adapter ${ref || "(unnamed)"} lacks a resolvable SHA-256; manifest not compiled` };
    }
    adapterRefs.push(ref);
    adapterShas.push(sha);
  }
  const schemaContract = normalizeSchemaContract(control.response_schema || null);
  const schemaHash = schemaContract ? schemaContract.grammarHash : "";
  const toolOpenapiHash = control.tools?.openapi
    ? sha256Hex(stableStringify(control.tools.openapi))
    : "";
  const cacheTtl = Math.max(0, Math.min(86_400, Math.floor(Number(control.cache?.ttl ?? control.cache_ttl) || 0)));
  const maxCents = Number(control.economics?.maxCostCents ?? control.cost_policy?.max_cents);
  const manifest = {
    manifest_version: INFERENCE_MANIFEST_VERSION,
    workflow_id: clean(workflowId),
    ...(clean(workflowVersion) ? { workflow_version: clean(workflowVersion) } : {}),
    ...(clean(integrationId) ? { integration_id: clean(integrationId) } : {}),
    composite_sha256: compositeSha256({ baseModelSha256, adapterSha256s: adapterShas, schemaHash }),
    base_model_sha256: baseModelSha256,
    adapter_sha256s: [...adapterShas].sort(),
    schema_hash: schemaHash,
    tool_openapi_hash: toolOpenapiHash,
    cache_ttl_seconds: cacheTtl,
    allowed_adapters: adapterRefs,
    max_tokens: Math.max(1, Math.floor(Number(maxTokens) || Number(control.maxTokensLimit) || 4096)),
    ...(Number.isFinite(maxCents) && maxCents >= 0 ? { cost_policy: { max_cents: maxCents } } : {}),
    created_at: new Date(Number(now()) || Date.now()).toISOString(),
  };
  return { available: true, manifest };
}

export function signInferenceManifest(manifest, { env = process.env, signingKey = null } = {}) {
  const resolved = signingKey || resolveManifestSigningKey(env);
  const digest = manifestSha256(manifest);
  if (!resolved) {
    return { manifest, manifest_sha256: digest, signature: null, key_id: null, algorithm: "unsigned" };
  }
  return {
    manifest,
    manifest_sha256: digest,
    signature: createHmac("sha256", resolved.key).update(digest).digest("hex"),
    key_id: resolved.keyId,
    algorithm: "hmac-sha256",
  };
}

export function verifySignedInferenceManifest(signed, { env = process.env, signingKey = null } = {}) {
  if (!signed?.manifest || typeof signed.manifest !== "object") {
    return { ok: false, reason: "signed manifest is missing its manifest body" };
  }
  const digest = manifestSha256(signed.manifest);
  if (digest !== String(signed.manifest_sha256 || "")) {
    return { ok: false, reason: "manifest body does not match its recorded manifest_sha256" };
  }
  if (signed.algorithm === "unsigned" || signed.signature == null) {
    return { ok: true, unsigned: true, reason: "manifest is unsigned; workspace signing key was not configured at compile time" };
  }
  const resolved = signingKey || resolveManifestSigningKey(env);
  if (!resolved) {
    return { ok: false, reason: "manifest is signed but no workspace signing key is configured to verify it" };
  }
  const expected = createHmac("sha256", resolved.key).update(digest).digest("hex");
  return safeEqualHex(expected, signed.signature)
    ? { ok: true, unsigned: false }
    : { ok: false, reason: "manifest signature does not verify with the workspace signing key" };
}

/**
 * Runtime enforcement: does the live resolved identity match the manifest?
 * The resolved adapter (if any) must be a member of the manifest's allowed
 * adapter set; base model and schema hashes must match exactly.
 */
export function verifyManifestAgainstIdentity(signed, {
  baseModelSha256 = "",
  adapterSha256 = "",
  schemaHash = "",
  env = process.env,
  signingKey = null,
} = {}) {
  if (!signed?.manifest) {
    return { status: "not_requested", manifest_sha256: null, composite_sha256: null, diffs: [] };
  }
  const manifest = signed.manifest;
  const signature = verifySignedInferenceManifest(signed, { env, signingKey });
  const diffs = [];
  const liveBase = lowerSha(baseModelSha256);
  const liveAdapter = lowerSha(adapterSha256);
  if (!signature.ok) {
    return {
      status: "mismatch",
      manifest_sha256: String(signed.manifest_sha256 || "") || null,
      composite_sha256: manifest.composite_sha256 || null,
      diffs: [{ field: "signature", expected: "valid workspace-key signature", actual: signature.reason }],
      reason: signature.reason,
    };
  }
  if (liveBase !== lowerSha(manifest.base_model_sha256)) {
    diffs.push({ field: "base_model_sha256", expected: String(manifest.base_model_sha256 || ""), actual: liveBase || "(unresolved)" });
  }
  if (liveAdapter && !manifest.adapter_sha256s.includes(liveAdapter)) {
    diffs.push({ field: "adapter_sha256", expected: `one of [${manifest.adapter_sha256s.join(", ")}]`, actual: liveAdapter });
  }
  if (String(schemaHash || "") !== String(manifest.schema_hash || "")) {
    diffs.push({ field: "schema_hash", expected: String(manifest.schema_hash || ""), actual: String(schemaHash || "") });
  }
  return {
    status: diffs.length ? "mismatch" : signature.unsigned ? "unsigned" : "verified",
    manifest_sha256: String(signed.manifest_sha256 || "") || null,
    composite_sha256: manifest.composite_sha256 || null,
    diffs,
    ...(diffs.length ? { reason: "live gateway identity does not match the published inference manifest" }
      : signature.unsigned ? { reason: signature.reason } : {}),
  };
}

/**
 * Derive the manifest-bindable integrations a workflow graph references:
 * every api-registry row reachable from the graph's api-registry-call nodes
 * (directly or as a mothership-policy route target) that declares
 * `metadata.inferenceControlPlane`. Declaring the control plane is the
 * operator's opt-in to the evidentiary handshake — from that point a
 * manifest is REQUIRED, not best-effort.
 */
export function expectedManifestIntegrations({ workspaceConfig, graph } = {}) {
  const rows = (Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [])
    .filter((object) => object?.objectType === "api-registry")
    .flatMap((object) => Array.isArray(object.rows) ? object.rows : []);
  const referenced = new Set();
  for (const node of Array.isArray(graph?.nodes) ? graph.nodes : []) {
    if (String(node?.type || "") !== "api-registry-call") continue;
    const registryId = clean(node?.config?.registryId || node?.config?.integrationId);
    if (registryId) referenced.add(registryId);
  }
  const expected = new Set();
  for (const row of rows) {
    const rowId = clean(row?.integrationId);
    if (!rowId) continue;
    const declaresControlPlane = row?.metadata?.inferenceControlPlane && typeof row.metadata.inferenceControlPlane === "object";
    if (referenced.has(rowId) && declaresControlPlane) expected.add(rowId);
    // A referenced mothership policy also binds each of its governed local
    // routes that declare artifact identity through its own registry rows.
    const routes = Array.isArray(row?.metadata?.mothershipProxy?.routes) ? row.metadata.mothershipProxy.routes : [];
    if (referenced.has(rowId)) {
      for (const route of routes) {
        const routeRegistryId = clean(route?.registryId);
        if (!routeRegistryId) continue;
        const routeRow = rows.find((candidate) => clean(candidate?.integrationId) === routeRegistryId);
        if (routeRow?.metadata?.inferenceControlPlane && typeof routeRow.metadata.inferenceControlPlane === "object") {
          expected.add(routeRegistryId);
        }
      }
    }
  }
  return expected;
}

/**
 * Publish-gate verification with SET semantics: every expected integration
 * (derived from the tested workflow graph, NOT from whichever invocation
 * records happen to carry a manifest) must present exactly one valid,
 * SIGNED manifest whose composite still matches the live registry identity.
 * Missing, unsigned, unavailable, conflicting-duplicate, and unexpected
 * manifests all block the promotion — a workflow that needs the handshake
 * cannot publish without handshake evidence.
 */
export function verifyWorkflowManifestsAtPublish({ workspaceConfig, invocations = [], expectedIntegrationIds = null, env = process.env } = {}) {
  const rows = (Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [])
    .filter((object) => object?.objectType === "api-registry")
    .flatMap((object) => Array.isArray(object.rows) ? object.rows : []);
  const expected = new Set([...(expectedIntegrationIds instanceof Set ? expectedIntegrationIds : Array.isArray(expectedIntegrationIds) ? expectedIntegrationIds : [])].map(clean).filter(Boolean));
  const mismatches = [];
  const manifestsByIntegration = new Map();

  for (const invocation of Array.isArray(invocations) ? invocations : []) {
    // An invocation that opted into the control plane but could not bind a
    // manifest is a hard publish failure, never a silent skip.
    const unavailableReason = clean(invocation?.inferenceManifestUnavailable);
    const invocationIntegration = clean(invocation?.integrationId);
    if (unavailableReason && (expected.size === 0 || expected.has(invocationIntegration))) {
      mismatches.push({ integrationId: invocationIntegration || "(unknown)", diffs: [{ field: "manifest", expected: "a bindable signed manifest from the tested run", actual: unavailableReason }] });
      continue;
    }
    const signed = invocation?.inferenceManifest;
    if (!signed?.manifest) continue;
    const integrationId = clean(signed.manifest.integration_id);
    if (!integrationId) {
      mismatches.push({ integrationId: "(unknown)", diffs: [{ field: "integration_id", expected: "a governed integration id", actual: "(missing)" }] });
      continue;
    }
    if (!expected.has(integrationId)) {
      mismatches.push({ integrationId, diffs: [{ field: "expected_set", expected: `one of [${[...expected].join(", ")}]`, actual: `unexpected manifest for ${integrationId}` }] });
      continue;
    }
    const previous = manifestsByIntegration.get(integrationId);
    if (previous && previous.manifest_sha256 !== signed.manifest_sha256) {
      mismatches.push({ integrationId, diffs: [{ field: "manifest_sha256", expected: previous.manifest_sha256, actual: `conflicting duplicate ${signed.manifest_sha256}` }] });
      continue;
    }
    const signature = verifySignedInferenceManifest(signed, { env });
    if (!signature.ok || signature.unsigned) {
      // Publish is a production trust boundary: an unsigned manifest (or a
      // missing/mismatched signing key) fails closed. The digest proves
      // internal consistency, not origin or authorization.
      mismatches.push({ integrationId, diffs: [{ field: "signature", expected: "a manifest signed by the workspace signing key", actual: signature.unsigned ? "unsigned manifest" : String(signature.reason) }] });
      continue;
    }
    const liveRow = rows.find((row) => clean(row?.integrationId) === integrationId) || null;
    if (!liveRow) {
      mismatches.push({ integrationId, diffs: [{ field: "registry_row", expected: `live api-registry row ${integrationId}`, actual: "(missing)" }] });
      continue;
    }
    const liveControl = liveRow?.metadata?.inferenceControlPlane;
    const liveCompiled = compileInferenceManifest({
      workflowId: signed.manifest.workflow_id,
      integrationId,
      control: liveControl && typeof liveControl === "object" ? liveControl : {},
      maxTokens: signed.manifest.max_tokens,
    });
    if (!liveCompiled.available) {
      mismatches.push({ integrationId, diffs: [{ field: "live_manifest", expected: "compilable live registry identity", actual: liveCompiled.reason }] });
      continue;
    }
    const diffs = diffInferenceManifests(signed.manifest, liveCompiled.manifest);
    if (diffs.length) {
      mismatches.push({ integrationId, diffs });
      continue;
    }
    manifestsByIntegration.set(integrationId, signed);
  }

  // One-to-one set match: every expected integration must have produced a
  // valid signed manifest in the tested run.
  for (const integrationId of expected) {
    if (!manifestsByIntegration.has(integrationId) && !mismatches.some((entry) => entry.integrationId === integrationId)) {
      mismatches.push({ integrationId, diffs: [{ field: "manifest", expected: "exactly one valid signed manifest from the tested run", actual: "(none produced)" }] });
    }
  }
  return { ok: mismatches.length === 0, mismatches, manifests: [...manifestsByIntegration.values()] };
}

/** Field-level diff between a tested-run manifest and a freshly compiled one. */
export function diffInferenceManifests(testedManifest, liveManifest) {
  const fields = ["composite_sha256", "base_model_sha256", "schema_hash", "tool_openapi_hash"];
  const diffs = [];
  for (const field of fields) {
    const expected = stableStringify(testedManifest?.[field] ?? "");
    const actual = stableStringify(liveManifest?.[field] ?? "");
    if (expected !== actual) diffs.push({ field, expected, actual });
  }
  const testedAdapters = stableStringify(testedManifest?.adapter_sha256s ?? []);
  const liveAdapters = stableStringify(liveManifest?.adapter_sha256s ?? []);
  if (testedAdapters !== liveAdapters) diffs.push({ field: "adapter_sha256s", expected: testedAdapters, actual: liveAdapters });
  return diffs;
}
