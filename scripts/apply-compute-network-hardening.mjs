#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (rel, content) => fs.writeFileSync(path.join(root, rel), content);

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`[one-shot] missing anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`[one-shot] ambiguous anchor: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceOrSkip(source, before, after, alreadyMarker, label) {
  if (source.includes(before)) return replaceOnce(source, before, after, label);
  if (alreadyMarker && source.includes(alreadyMarker)) return source;
  throw new Error(`[one-shot] neither old nor hardened form found: ${label}`);
}

const routePath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/sandbox-run/route.js";
let route = read(routePath);
route = replaceOrSkip(
  route,
  `import {
  compileComputeAuthority,
  verifyComputeAuthorityAgainstWorkspace
} from "@/lib/compute-authority";`,
  `import {
  compileComputeAuthority,
  verifyComputeAuthorityAgainstWorkspace
} from "@/lib/compute-authority";
import {
  createGovernedComputeFetchJson,
  verifyGovernedComputeArtifact
} from "@/lib/compute-network-policy";`,
  `from "@/lib/compute-network-policy"`,
  "compute network policy import",
);
route = replaceOrSkip(
  route,
  `import { buildInferenceTrustContext } from "@/lib/sandbox-execution-context";

function coerceBoolean`,
  `import { buildInferenceTrustContext } from "@/lib/sandbox-execution-context";

// One server-owned outbound boundary for every compute provider and artifact
// fetch. It applies operator allowlists, DNS pinning, redirect refusal,
// private/metadata-address controls, response bounds, and streaming hashes.
const governedComputeFetchJson = createGovernedComputeFetchJson();

function coerceBoolean`,
  `const governedComputeFetchJson = createGovernedComputeFetchJson();`,
  "governed compute fetch construction",
);
const verifierStart = route.indexOf("/** Canonical artifact materialization/readback. Provider SHA claims alone fail. */");
if (verifierStart >= 0) {
  const verifierEnd = route.indexOf("async function runServerlessScheduler", verifierStart);
  if (verifierEnd < 0) throw new Error("[one-shot] artifact verifier block end not found");
  route = `${route.slice(0, verifierStart)}${route.slice(verifierEnd)}`;
} else if (!route.includes("verifyGovernedComputeArtifact")) {
  throw new Error("[one-shot] neither unsafe nor governed artifact verifier found");
}
route = replaceOrSkip(
  route,
  `          fetchJson: async (url, init) => {
            const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
            const text = await res.text();
            let parsed = null;
            try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
            if (!res.ok) {
              const detail = parsed?.message || parsed?.error || text.slice(0, 200);
              const err = new Error(\`HTTP \${res.status}\${detail ? \`: \${detail}\` : ""}\`);
              err.status = res.status;
              throw err;
            }
            return parsed;
          },`,
  `          // Every provider quote/allocation/status/cancel/release request
          // crosses the same DNS-pinned, bounded, operator-allowlisted policy.
          fetchJson: governedComputeFetchJson,`,
  `fetchJson: governedComputeFetchJson,`,
  "inline compute fetch replacement",
);
route = replaceOrSkip(
  route,
  `          verifyArtifact: verifyComputeArtifactBytes,`,
  `          // Artifact bytes are streamed through the same outbound policy;
          // local paths are restricted to governed roots and expected output.
          verifyArtifact: (artifact, workSpec) => verifyGovernedComputeArtifact({ artifact, workSpec }),`,
  `verifyArtifact: (artifact, workSpec) => verifyGovernedComputeArtifact`,
  "artifact verifier wiring",
);
write(routePath, route);

const executionPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-execution.js";
let execution = read(executionPath);
execution = replaceOrSkip(
  execution,
  `  const critical = ordered.filter((event) => criticalTypes.has(event.type));
  const latest = ordered.slice(-Math.max(0, MAX_EVENTS - critical.length));
  return mergeEvents([], [...critical, ...latest]).slice(-MAX_EVENTS);`,
  `  // Never recurse during compaction: an attacker/provider may emit more
  // than MAX_EVENTS critical events. Preserve the first request anchor, the
  // latest critical transitions, and then the latest non-critical context.
  const firstRequest = ordered.find((event) => event.type === "compute-requested") || null;
  const criticalTail = ordered
    .filter((event) => criticalTypes.has(event.type) && event !== firstRequest)
    .slice(-(MAX_EVENTS - (firstRequest ? 1 : 0)));
  const criticalIds = new Set([
    ...(firstRequest ? [eventIdentity(firstRequest)] : []),
    ...criticalTail.map(eventIdentity),
  ]);
  const remaining = Math.max(0, MAX_EVENTS - criticalIds.size);
  const nonCriticalTail = ordered
    .filter((event) => !criticalTypes.has(event.type))
    .slice(-remaining);
  const keepIds = new Set([...criticalIds, ...nonCriticalTail.map(eventIdentity)]);
  return ordered.filter((event) => keepIds.has(eventIdentity(event))).slice(-MAX_EVENTS);`,
  `Never recurse during compaction`,
  "non-recursive event compaction",
);
execution = replaceOrSkip(
  execution,
  `    evaluation: incoming?.evaluation?.source === "workspace-canonical"
      ? incoming.evaluation
      : prior?.evaluation?.source === "workspace-canonical"
        ? prior.evaluation
        : incoming.evaluation || prior.evaluation,`,
  `    // Legacy/provider-authored evaluation is never carried forward as
    // authority. Only the workspace-owned canonical evaluator may persist.
    evaluation: incoming?.evaluation?.source === "workspace-canonical"
      ? incoming.evaluation
      : prior?.evaluation?.source === "workspace-canonical"
        ? prior.evaluation
        : null,`,
  `Legacy/provider-authored evaluation is never carried forward`,
  "canonical evaluation-only merge",
);
execution = replaceOrSkip(
  execution,
  `function providerMayBeObserved(provider, policy, selectionMode, pinnedProviderId) {
  const providerId = str(provider?.providerId);
  const availability = Array.isArray(provider?.availabilityModes)
    ? provider.availabilityModes.map(String)
    : [];
  if (selectionMode === "explicit" && pinnedProviderId) return providerId === pinnedProviderId;
  if (policy?.mode === "local" || policy?.localOnly === true) return providerId === LOCAL_PROVIDER_ID;
  if (policy?.mode === "cloud" || policy?.excludeLocal === true) return providerId !== LOCAL_PROVIDER_ID;
  if (policy?.mode === "reserved-cluster" || policy?.reservedOnly === true) {
    return providerId !== LOCAL_PROVIDER_ID
      && availability.some((mode) => mode === "reserved" || mode === "warm");
  }
  if (policy?.allowPreemptible !== true && availability.length === 1 && availability[0] === "spot") return false;
  return true;
}`,
  `function providerMayBeObserved(provider, policy, selectionMode, pinnedProviderId) {
  const providerId = str(provider?.providerId);
  const availability = Array.isArray(provider?.availabilityModes)
    ? provider.availabilityModes.map(String)
    : [];
  // Hard customer policy gates are evaluated before an explicit pin. A pin
  // selects within the allowed universe; it cannot authorize a forbidden
  // local, remote, reserved, or spot provider to receive even a quote probe.
  if (policy?.mode === "local" || policy?.localOnly === true) {
    if (providerId !== LOCAL_PROVIDER_ID) return false;
  }
  if ((policy?.mode === "cloud" || policy?.excludeLocal === true) && providerId === LOCAL_PROVIDER_ID) return false;
  if (policy?.mode === "reserved-cluster" || policy?.reservedOnly === true) {
    if (providerId === LOCAL_PROVIDER_ID || !availability.some((mode) => mode === "reserved" || mode === "warm")) return false;
  }
  if (policy?.allowPreemptible !== true && availability.length === 1 && availability[0] === "spot") return false;
  if (selectionMode === "explicit" && pinnedProviderId) return providerId === pinnedProviderId;
  return true;
}`,
  `Hard customer policy gates are evaluated before an explicit pin`,
  "policy-before-pin provider filtering",
);
write(executionPath, execution);

const networkPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-network-policy.js";
let network = read(networkPath);
network = replaceOrSkip(
  network,
  `const FORBIDDEN_METADATA_HOSTS = new Set([
  "169.254.169.254",`,
  `const FORBIDDEN_METADATA_HOSTS = new Set([
  "169.254.169.254",
  "100.100.100.200",`,
  `"100.100.100.200"`,
  "additional metadata endpoint",
);
network = replaceOrSkip(
  network,
  `  const privateRules = parseComputeHostAllowList(env?.[COMPUTE_PRIVATE_NETWORK_ALLOWLIST_ENV]);
  const privateApproved = hostMatches(hostname, privateRules);
  const normalizedAddresses = addresses.map((entry) => ({
    address: normalizeHost(entry?.address),
    family: Number(entry?.family) || isIP(entry?.address),
  }));
  if (normalizedAddresses.some((entry) => privateOrReservedAddress(entry.address)) && !privateApproved) {`,
  `  const privateRules = parseComputeHostAllowList(env?.[COMPUTE_PRIVATE_NETWORK_ALLOWLIST_ENV]);
  const privateApproved = hostMatches(hostname, privateRules);
  const normalizedAddresses = addresses.map((entry) => ({
    address: normalizeHost(entry?.address),
    family: Number(entry?.family) || isIP(entry?.address),
  }));
  if (normalizedAddresses.some((entry) => FORBIDDEN_METADATA_HOSTS.has(entry.address))) {
    throw new Error(\`compute outbound hostname "\${hostname}" resolves to a forbidden metadata-service address\`);
  }
  const privateAddresses = normalizedAddresses.filter((entry) => privateOrReservedAddress(entry.address));
  if (privateAddresses.length > 0 && privateAddresses.length !== normalizedAddresses.length) {
    throw new Error(\`compute outbound hostname "\${hostname}" resolves to mixed public/private addresses\`);
  }
  if (privateAddresses.length > 0 && !privateApproved) {`,
  `resolves to mixed public/private addresses`,
  "metadata and mixed-DNS refusal",
);
write(networkPath, network);

const runpodPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/runpod-compute.js";
let runpod = read(runpodPath);
runpod = replaceOrSkip(
  runpod,
  `    if (config.mode === "serverless") {
      const res = await ctx.fetchJson(\`${RUNPOD_SERVERLESS_BASE}/\${config.endpointId}/cancel/\${resourceId}\`, { method: "POST", headers: { Authorization: key } });
      return [providerEvent({ type: "compute-cancelled", ctx, providerEventId: \`\${resourceId}:cancel\`, detail: str(res?.status || "CANCELLED") })];
    }`,
  `    if (config.mode === "serverless") {
      const res = await ctx.fetchJson(\`${RUNPOD_SERVERLESS_BASE}/\${config.endpointId}/cancel/\${resourceId}\`, { method: "POST", headers: { Authorization: key } });
      const status = str(res?.status).toUpperCase();
      // A request acknowledgement is not cancellation evidence. Only an
      // explicit terminal acknowledgement may advance the governed lifecycle.
      if (!["CANCELLED", "CANCELED"].includes(status) && res?.cancelled !== true) return [];
      return [providerEvent({ type: "compute-cancelled", ctx, providerEventId: \`\${resourceId}:cancel\`, detail: status || "CANCELLED" })];
    }`,
  `A request acknowledgement is not cancellation evidence`,
  "Runpod serverless cancellation acknowledgement",
);
runpod = replaceOrSkip(
  runpod,
  `    if (config.mode === "serverless") {
      // Scale-to-zero: a terminal job holds no capacity. Cancellation of a
      // live job is the release path; a finished job releases implicitly.
      return [providerEvent({ type: "compute-released", ctx, providerEventId: \`\${resourceId}:released\`, detail: "serverless workers scale to zero — no standing capacity to terminate" })];
    }`,
  `    if (config.mode === "serverless") {
      const terminal = new Set(["COMPLETED", "FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"]);
      const live = new Set(["IN_QUEUE", "IN_PROGRESS"]);
      const failed = (detail) => [providerEvent({
        type: "compute-release-failed",
        ctx,
        providerEventId: \`\${resourceId}:serverless-release-unverified\`,
        detail: \`\${detail} — serverless job release is not confirmed; work may still be billing\`,
        source: "workspace",
      })];
      try {
        const observed = await ctx.fetchJson(\`${RUNPOD_SERVERLESS_BASE}/\${config.endpointId}/status/\${resourceId}\`, { headers: { Authorization: key } });
        const status = str(observed?.status).toUpperCase();
        if (terminal.has(status)) {
          return [providerEvent({ type: "compute-released", ctx, providerEventId: \`\${resourceId}:serverless-released:\${status}\`, detail: \`serverless job \${status} — workers are terminal and scale to zero\` })];
        }
        if (!live.has(status)) return failed(\`provider state \"\${status || "unknown"}\" is not safely classifiable\`);

        const cancelled = await ctx.fetchJson(\`${RUNPOD_SERVERLESS_BASE}/\${config.endpointId}/cancel/\${resourceId}\`, { method: "POST", headers: { Authorization: key } });
        const cancelStatus = str(cancelled?.status).toUpperCase();
        if (!["CANCELLED", "CANCELED"].includes(cancelStatus) && cancelled?.cancelled !== true) {
          return failed(\`provider did not confirm cancellation (status \"\${cancelStatus || "unknown"}\")\`);
        }
        const confirmed = await ctx.fetchJson(\`${RUNPOD_SERVERLESS_BASE}/\${config.endpointId}/status/\${resourceId}\`, { headers: { Authorization: key } });
        const finalStatus = str(confirmed?.status).toUpperCase();
        if (!terminal.has(finalStatus)) return failed(\`post-cancel state \"\${finalStatus || "unknown"}\" is not terminal\`);
        return [providerEvent({ type: "compute-released", ctx, providerEventId: \`\${resourceId}:serverless-released:\${finalStatus}\`, detail: \`serverless release verified in terminal state \${finalStatus}\` })];
      } catch (error) {
        return failed(\`serverless release not confirmed: \${str(error?.message).slice(0, 160)}\`);
      }
    }`,
  `serverless release verified in terminal state`,
  "Runpod serverless release verification",
);
write(runpodPath, runpod);

const e2ePath = "scripts/e2e-compute-route-realization-loop.mjs";
let e2e = read(e2ePath);
if (!e2e.includes("GROWTHUB_COMPUTE_NETWORK_ALLOWLIST")) {
  e2e = replaceOnce(
    e2e,
    `        GROWTHUB_COMPUTE_AUTHORITY_KEY: AUTHORITY_KEY,
`,
    `        GROWTHUB_COMPUTE_AUTHORITY_KEY: AUTHORITY_KEY,
        // The booted fake provider is intentionally loopback; production
        // permits private hosts only through explicit operator allowlists.
        GROWTHUB_COMPUTE_NETWORK_ALLOWLIST: "127.0.0.1",
        GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST: "127.0.0.1",
`,
    "booted route private test allowlist",
  );
}
write(e2ePath, e2e);

const certificationPath = "scripts/run-compute-certification.mjs";
let certification = read(certificationPath);
if (!certification.includes("scripts/unit-compute-network-policy.test.mjs")) {
  certification = replaceOnce(
    certification,
    `  "scripts/unit-compute-budget-policy.test.mjs",
`,
    `  "scripts/unit-compute-budget-policy.test.mjs",
  "scripts/unit-compute-network-policy.test.mjs",
`,
    "compute network certification suite",
  );
}
if (!certification.includes("scripts/unit-compute-runpod-release.test.mjs")) {
  certification = replaceOnce(
    certification,
    `  "scripts/unit-compute-runpod.test.mjs",
`,
    `  "scripts/unit-compute-runpod.test.mjs",
  "scripts/unit-compute-runpod-release.test.mjs",
`,
    "Runpod release certification suite",
  );
}
write(certificationPath, certification);

console.log("[one-shot] governed network, executor safety, and Runpod release truth are wired and ready for certification");
