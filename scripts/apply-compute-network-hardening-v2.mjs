#!/usr/bin/env node
/**
 * Current-head, invariant-driven compute network hardening.
 *
 * This supersedes the original text-fragile applicator. Each mutation accepts
 * either the known unsafe form or the final governed form, and every file is
 * asserted for the production invariant before it is written.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (rel, value) => fs.writeFileSync(path.join(root, rel), value);
const fail = (message) => { throw new Error(`[network-v2] ${message}`); };

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) fail(`missing unsafe source for ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) fail(`ambiguous unsafe source for ${label}`);
  return source.slice(0, index) + after + source.slice(index + before.length);
}

// ---------------------------------------------------------------------------
// Real sandbox-run route: one DNS-pinned JSON boundary and one streamed
// artifact verifier. No raw provider fetch and no arrayBuffer artifact read.
// ---------------------------------------------------------------------------
const routePath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/sandbox-run/route.js";
let route = read(routePath);
if (!route.includes('from "@/lib/compute-network-policy"')) {
  route = replaceOnce(
    route,
    `import {\n  compileComputeAuthority,\n  verifyComputeAuthorityAgainstWorkspace\n} from "@/lib/compute-authority";`,
    `import {\n  compileComputeAuthority,\n  verifyComputeAuthorityAgainstWorkspace\n} from "@/lib/compute-authority";\nimport {\n  createGovernedComputeFetchJson,\n  verifyGovernedComputeArtifact\n} from "@/lib/compute-network-policy";`,
    "route network import",
  );
}
if (!route.includes("const governedComputeFetchJson = createGovernedComputeFetchJson();")) {
  route = replaceOnce(
    route,
    `import { buildInferenceTrustContext } from "@/lib/sandbox-execution-context";\n`,
    `import { buildInferenceTrustContext } from "@/lib/sandbox-execution-context";\n\n// All provider control-plane requests cross one server-owned DNS-pinned,\n// redirect-refusing, bounded outbound boundary.\nconst governedComputeFetchJson = createGovernedComputeFetchJson();\n`,
    "route governed fetch singleton",
  );
}
const unsafeVerifierStart = route.indexOf("/** Canonical artifact materialization/readback. Provider SHA claims alone fail. */");
if (unsafeVerifierStart >= 0) {
  const unsafeVerifierEnd = route.indexOf("async function runServerlessScheduler", unsafeVerifierStart);
  if (unsafeVerifierEnd < 0) fail("could not bound unsafe artifact verifier");
  route = `${route.slice(0, unsafeVerifierStart)}${route.slice(unsafeVerifierEnd)}`;
}
if (!route.includes("fetchJson: governedComputeFetchJson,")) {
  const inlineFetch = `          fetchJson: async (url, init) => {\n            const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });\n            const text = await res.text();\n            let parsed = null;\n            try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }\n            if (!res.ok) {\n              const detail = parsed?.message || parsed?.error || text.slice(0, 200);\n              const err = new Error(\`HTTP \${res.status}\${detail ? \`: \${detail}\` : ""}\`);\n              err.status = res.status;\n              throw err;\n            }\n            return parsed;\n          },`;
  route = replaceOnce(
    route,
    inlineFetch,
    `          // Provider quote/allocation/status/cancel/release traffic is\n          // allowlisted, DNS-pinned, redirect-refused, and size-bounded.\n          fetchJson: governedComputeFetchJson,`,
    "route provider fetch",
  );
}
if (!route.includes("verifyArtifact: (artifact, workSpec) => verifyGovernedComputeArtifact")) {
  route = replaceOnce(
    route,
    `          verifyArtifact: verifyComputeArtifactBytes,`,
    `          // Artifact bytes are streamed and re-hashed; local paths are\n          // confined to governed roots and the sealed work-spec output.\n          verifyArtifact: (artifact, workSpec) => verifyGovernedComputeArtifact({ artifact, workSpec }),`,
    "route artifact verifier",
  );
}
for (const marker of [
  'from "@/lib/compute-network-policy"',
  "const governedComputeFetchJson = createGovernedComputeFetchJson();",
  "fetchJson: governedComputeFetchJson,",
  "verifyArtifact: (artifact, workSpec) => verifyGovernedComputeArtifact",
]) if (!route.includes(marker)) fail(`route invariant missing: ${marker}`);
if (route.includes("verifyComputeArtifactBytes") || route.includes("Buffer.from(await res.arrayBuffer())")) fail("unsafe artifact materialization remains in route");
write(routePath, route);

// ---------------------------------------------------------------------------
// Executor: bounded non-recursive journal compaction, canonical evaluation
// only, and customer policy before an explicit provider pin.
// ---------------------------------------------------------------------------
const executionPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-execution.js";
let execution = read(executionPath);
if (!execution.includes("Never recurse during compaction")) {
  execution = replaceOnce(
    execution,
    `  const critical = ordered.filter((event) => criticalTypes.has(event.type));\n  const latest = ordered.slice(-Math.max(0, MAX_EVENTS - critical.length));\n  return mergeEvents([], [...critical, ...latest]).slice(-MAX_EVENTS);`,
    `  // Never recurse during compaction: a hostile provider may emit more\n  // critical events than the cap. Preserve the first request anchor, newest\n  // critical transitions, then newest non-critical context.\n  const firstRequest = ordered.find((event) => event.type === "compute-requested") || null;\n  const criticalTail = ordered\n    .filter((event) => criticalTypes.has(event.type) && event !== firstRequest)\n    .slice(-(MAX_EVENTS - (firstRequest ? 1 : 0)));\n  const criticalIds = new Set([\n    ...(firstRequest ? [eventIdentity(firstRequest)] : []),\n    ...criticalTail.map(eventIdentity),\n  ]);\n  const remaining = Math.max(0, MAX_EVENTS - criticalIds.size);\n  const nonCriticalTail = ordered.filter((event) => !criticalTypes.has(event.type)).slice(-remaining);\n  const keepIds = new Set([...criticalIds, ...nonCriticalTail.map(eventIdentity)]);\n  return ordered.filter((event) => keepIds.has(eventIdentity(event))).slice(-MAX_EVENTS);`,
    "non-recursive event compaction",
  );
}
if (!execution.includes("Legacy/provider-authored evaluation is never carried forward")) {
  execution = replaceOnce(
    execution,
    `    evaluation: incoming?.evaluation?.source === "workspace-canonical"\n      ? incoming.evaluation\n      : prior?.evaluation?.source === "workspace-canonical"\n        ? prior.evaluation\n        : incoming.evaluation || prior.evaluation,`,
    `    // Legacy/provider-authored evaluation is never carried forward as\n    // promotion authority. Only the workspace-owned evaluator may persist.\n    evaluation: incoming?.evaluation?.source === "workspace-canonical"\n      ? incoming.evaluation\n      : prior?.evaluation?.source === "workspace-canonical"\n        ? prior.evaluation\n        : null,`,
    "canonical evaluation-only merge",
  );
}
if (!execution.includes("Hard customer policy gates are evaluated before an explicit pin")) {
  const oldFilter = `function providerMayBeObserved(provider, policy, selectionMode, pinnedProviderId) {\n  const providerId = str(provider?.providerId);\n  const availability = Array.isArray(provider?.availabilityModes)\n    ? provider.availabilityModes.map(String)\n    : [];\n  if (selectionMode === "explicit" && pinnedProviderId) return providerId === pinnedProviderId;\n  if (policy?.mode === "local" || policy?.localOnly === true) return providerId === LOCAL_PROVIDER_ID;\n  if (policy?.mode === "cloud" || policy?.excludeLocal === true) return providerId !== LOCAL_PROVIDER_ID;\n  if (policy?.mode === "reserved-cluster" || policy?.reservedOnly === true) {\n    return providerId !== LOCAL_PROVIDER_ID\n      && availability.some((mode) => mode === "reserved" || mode === "warm");\n  }\n  if (policy?.allowPreemptible !== true && availability.length === 1 && availability[0] === "spot") return false;\n  return true;\n}`;
  const newFilter = `function providerMayBeObserved(provider, policy, selectionMode, pinnedProviderId) {\n  const providerId = str(provider?.providerId);\n  const availability = Array.isArray(provider?.availabilityModes)\n    ? provider.availabilityModes.map(String)\n    : [];\n  // Hard customer policy gates are evaluated before an explicit pin. A pin\n  // selects within the allowed universe; it cannot authorize a forbidden\n  // local, remote, reserved, or spot provider to receive even a quote probe.\n  if (policy?.mode === "local" || policy?.localOnly === true) {\n    if (providerId !== LOCAL_PROVIDER_ID) return false;\n  }\n  if ((policy?.mode === "cloud" || policy?.excludeLocal === true) && providerId === LOCAL_PROVIDER_ID) return false;\n  if (policy?.mode === "reserved-cluster" || policy?.reservedOnly === true) {\n    if (providerId === LOCAL_PROVIDER_ID || !availability.some((mode) => mode === "reserved" || mode === "warm")) return false;\n  }\n  if (policy?.allowPreemptible !== true && availability.length === 1 && availability[0] === "spot") return false;\n  if (selectionMode === "explicit" && pinnedProviderId) return providerId === pinnedProviderId;\n  return true;\n}`;
  execution = replaceOnce(execution, oldFilter, newFilter, "policy-before-pin provider filtering");
}
for (const marker of [
  "Never recurse during compaction",
  "Legacy/provider-authored evaluation is never carried forward",
  "Hard customer policy gates are evaluated before an explicit pin",
]) if (!execution.includes(marker)) fail(`executor invariant missing: ${marker}`);
write(executionPath, execution);

// The canonical network module already owns DNS pinning. Assert rather than
// layering a second implementation.
const networkPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-network-policy.js";
const network = read(networkPath);
for (const marker of [
  "mixed public/private DNS answers",
  "metadata-service address",
  "compute outbound redirects are refused",
  "governed-local-file-stream",
  "governed-http-stream",
]) if (!network.includes(marker)) fail(`network invariant missing: ${marker}`);

// Runpod: cancellation acknowledgement is not terminal proof; release must
// query/cancel/re-query before declaring serverless capacity gone.
const runpodPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/runpod-compute.js";
let runpod = read(runpodPath);
if (!runpod.includes("A request acknowledgement is not cancellation evidence")) {
  runpod = replaceOnce(
    runpod,
    `    if (config.mode === "serverless") {\n      const res = await ctx.fetchJson(\`${'${RUNPOD_SERVERLESS_BASE}'}/${'${config.endpointId}'}/cancel/${'${resourceId}'}\`, { method: "POST", headers: { Authorization: key } });\n      return [providerEvent({ type: "compute-cancelled", ctx, providerEventId: \`${'${resourceId}'}:cancel\`, detail: str(res?.status || "CANCELLED") })];\n    }`,
    `    if (config.mode === "serverless") {\n      const res = await ctx.fetchJson(\`${'${RUNPOD_SERVERLESS_BASE}'}/${'${config.endpointId}'}/cancel/${'${resourceId}'}\`, { method: "POST", headers: { Authorization: key } });\n      const status = str(res?.status).toUpperCase();\n      // A request acknowledgement is not cancellation evidence. Only an\n      // explicit terminal acknowledgement may advance the governed lifecycle.\n      if (!["CANCELLED", "CANCELED"].includes(status) && res?.cancelled !== true) return [];\n      return [providerEvent({ type: "compute-cancelled", ctx, providerEventId: \`${'${resourceId}'}:cancel\`, detail: status || "CANCELLED" })];\n    }`,
    "Runpod serverless cancellation acknowledgement",
  );
}
if (!runpod.includes("serverless release verified in terminal state")) {
  runpod = replaceOnce(
    runpod,
    `    if (config.mode === "serverless") {\n      // Scale-to-zero: a terminal job holds no capacity. Cancellation of a\n      // live job is the release path; a finished job releases implicitly.\n      return [providerEvent({ type: "compute-released", ctx, providerEventId: \`${'${resourceId}'}:released\`, detail: "serverless workers scale to zero — no standing capacity to terminate" })];\n    }`,
    `    if (config.mode === "serverless") {\n      const terminal = new Set(["COMPLETED", "FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"]);\n      const live = new Set(["IN_QUEUE", "IN_PROGRESS"]);\n      const failed = (detail) => [providerEvent({\n        type: "compute-release-failed",\n        ctx,\n        providerEventId: \`${'${resourceId}'}:serverless-release-unverified\`,\n        detail: \`${'${detail}'} — serverless job release is not confirmed; work may still be billing\`,\n        source: "workspace",\n      })];\n      try {\n        const observed = await ctx.fetchJson(\`${'${RUNPOD_SERVERLESS_BASE}'}/${'${config.endpointId}'}/status/${'${resourceId}'}\`, { headers: { Authorization: key } });\n        const status = str(observed?.status).toUpperCase();\n        if (terminal.has(status)) return [providerEvent({ type: "compute-released", ctx, providerEventId: \`${'${resourceId}'}:serverless-released:${'${status}'}\`, detail: \`serverless job ${'${status}'} — workers are terminal and scale to zero\` })];\n        if (!live.has(status)) return failed(\`provider state "${'${status || "unknown"}'}" is not safely classifiable\`);\n        const cancelled = await ctx.fetchJson(\`${'${RUNPOD_SERVERLESS_BASE}'}/${'${config.endpointId}'}/cancel/${'${resourceId}'}\`, { method: "POST", headers: { Authorization: key } });\n        const cancelStatus = str(cancelled?.status).toUpperCase();\n        if (!["CANCELLED", "CANCELED"].includes(cancelStatus) && cancelled?.cancelled !== true) return failed(\`provider did not confirm cancellation (status "${'${cancelStatus || "unknown"}'}")\`);\n        const confirmed = await ctx.fetchJson(\`${'${RUNPOD_SERVERLESS_BASE}'}/${'${config.endpointId}'}/status/${'${resourceId}'}\`, { headers: { Authorization: key } });\n        const finalStatus = str(confirmed?.status).toUpperCase();\n        if (!terminal.has(finalStatus)) return failed(\`post-cancel state "${'${finalStatus || "unknown"}'}" is not terminal\`);\n        return [providerEvent({ type: "compute-released", ctx, providerEventId: \`${'${resourceId}'}:serverless-released:${'${finalStatus}'}\`, detail: \`serverless release verified in terminal state ${'${finalStatus}'}\` })];\n      } catch (error) {\n        return failed(\`serverless release not confirmed: ${'${str(error?.message).slice(0, 160)}'}\`);\n      }\n    }`,
    "Runpod serverless release verification",
  );
}
for (const marker of [
  "A request acknowledgement is not cancellation evidence",
  "serverless release verified in terminal state",
]) if (!runpod.includes(marker)) fail(`Runpod invariant missing: ${marker}`);
write(runpodPath, runpod);

// The booted private fake provider is explicit test-only operator policy.
const e2ePath = "scripts/e2e-compute-route-realization-loop.mjs";
let e2e = read(e2ePath);
if (!e2e.includes("GROWTHUB_COMPUTE_NETWORK_ALLOWLIST")) {
  e2e = replaceOnce(
    e2e,
    `        GROWTHUB_COMPUTE_AUTHORITY_KEY: AUTHORITY_KEY,\n`,
    `        GROWTHUB_COMPUTE_AUTHORITY_KEY: AUTHORITY_KEY,\n        GROWTHUB_COMPUTE_NETWORK_ALLOWLIST: "127.0.0.1",\n        GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST: "127.0.0.1",\n`,
    "booted route private provider allowlist",
  );
}
if (!e2e.includes("GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST")) fail("booted route private network policy is missing");
write(e2ePath, e2e);

const certificationPath = "scripts/run-compute-certification.mjs";
const certification = read(certificationPath);
for (const suite of [
  "scripts/unit-compute-network-policy.test.mjs",
  "scripts/unit-compute-runpod-release.test.mjs",
]) if (!certification.includes(suite)) fail(`certification omits ${suite}`);

console.log("[network-v2] governed route, executor, network, Runpod, and booted proof invariants are wired");
