#!/usr/bin/env node
/** Parse-safe current-head allocation idempotency + reconciliation wiring. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (rel, content) => fs.writeFileSync(path.join(root, rel), content);
const lines = (...values) => values.join("\n");

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`[allocation-idempotency-v2] missing anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`[allocation-idempotency-v2] ambiguous anchor: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}
function replaceOrSkip(source, before, after, marker, label) {
  if (source.includes(before)) return replaceOnce(source, before, after, label);
  if (marker && source.includes(marker)) return source;
  throw new Error(`[allocation-idempotency-v2] neither old nor hardened form found: ${label}`);
}

const registryPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/compute-adapter-registry.js";
let registry = read(registryPath);
registry = replaceOrSkip(
  registry,
  'const wrappedByOriginal = new WeakMap();',
  lines(
    'const wrappedByOriginal = new WeakMap();',
    '',
    'function normalizedAllocationIdempotency(value) {',
    '  const input = value && typeof value === "object" ? value : {};',
    '  const allowedModes = new Set(["provider-native-key", "reconcile-before-create", "endpoint-contract", "unproven"]);',
    '  const mode = allowedModes.has(String(input.mode || "")) ? String(input.mode) : "unproven";',
    '  return {',
    '    guaranteed: input.guaranteed === true,',
    '    mode,',
    '    evidence: String(input.evidence || (mode === "unproven" ? "adapter did not prove deterministic allocation reconciliation" : "")).slice(0, 240),',
    '  };',
    '}'
  ),
  'function normalizedAllocationIdempotency',
  "allocation safety normalizer",
);
registry = replaceOrSkip(
  registry,
  lines('  const wrapped = { ...adapter };', '  for (const method of CONTEXT_METHODS) {'),
  lines(
    '  const wrapped = { ...adapter };',
    '  wrapped.describeCapabilities = function governedDescribeCapabilities(config) {',
    '    const capabilities = adapter.describeCapabilities.call(adapter, config);',
    '    return {',
    '      ...(capabilities && typeof capabilities === "object" ? capabilities : {}),',
    '      allocationIdempotency: normalizedAllocationIdempotency(capabilities?.allocationIdempotency),',
    '    };',
    '  };',
    '  for (const method of CONTEXT_METHODS) {'
  ),
  'wrapped.describeCapabilities = function governedDescribeCapabilities',
  "production registry capability wrapper",
);
write(registryPath, registry);

const resolverPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-resolver.js";
let resolver = read(resolverPath);
resolver = replaceOrSkip(
  resolver,
  lines('  } else {', '    if (num(req.gpuCount) > 0) {'),
  lines(
    '  } else {',
    '    const allocationSafety = caps.allocationIdempotency && typeof caps.allocationIdempotency === "object"',
    '      ? caps.allocationIdempotency',
    '      : null;',
    '    if (providerId !== "local-machine"',
    '      && allocationSafety',
    '      && allocationSafety.guaranteed !== true',
    '      && quote?.allocationIdempotencyVerified !== true) {',
    '      flag(',
    '        "allocation-idempotency-unproven",',
    '        allocationSafety.evidence',
    '          ? `provider cannot safely recover the provider-accepted-before-persist crash window: ${allocationSafety.evidence}`',
    '          : "provider cannot prove deterministic allocation reconciliation",',
    '      );',
    '    }',
    '    if (num(req.gpuCount) > 0) {'
  ),
  'allocation-idempotency-unproven',
  "resolver idempotency eligibility gate",
);
write(resolverPath, resolver);

const runpodPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/runpod-compute.js";
let runpod = read(runpodPath);
runpod = replaceOrSkip(
  runpod,
  lines('      requiredEnv: [c.apiKeyEnv],', '      // Optional extension floors the resolver honors when declared.'),
  lines(
    '      requiredEnv: [c.apiKeyEnv],',
    '      allocationIdempotency: c.mode === "serverless"',
    '        ? {',
    '            guaranteed: false,',
    '            mode: "unproven",',
    '            evidence: "Runpod Serverless /run returns a generated job id and exposes no deterministic idempotency lookup",',
    '          }',
    '        : {',
    '            guaranteed: true,',
    '            mode: "reconcile-before-create",',
    '            evidence: "deterministic pod name from the sealed idempotency hash; GET /pods?name runs before POST /pods",',
    '          },',
    '      // Optional extension floors the resolver honors when declared.'
  ),
  'Runpod Serverless /run returns a generated job id',
  "Runpod allocation safety declaration",
);
write(runpodPath, runpod);

const modalPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/modal-compute.js";
let modal = read(modalPath);
modal = replaceOrSkip(
  modal,
  lines('      requiredEnv: [c.tokenIdEnv, c.tokenSecretEnv],', '    };'),
  lines(
    '      requiredEnv: [c.tokenIdEnv, c.tokenSecretEnv],',
    '      allocationIdempotency: {',
    '        guaranteed: false,',
    '        mode: "endpoint-contract",',
    '        evidence: "the deployed Modal function must dynamically attest growthub-idempotency-key-v1 at /health",',
    '      },',
    '    };'
  ),
  'growthub-idempotency-key-v1 at /health',
  "Modal static allocation safety declaration",
);
modal = replaceOrSkip(
  modal,
  lines('    let reachable = false;', '    let probeDetail = "";'),
  lines('    let reachable = false;', '    let allocationIdempotencyVerified = false;', '    let probeDetail = "";'),
  'let allocationIdempotencyVerified = false',
  "Modal dynamic safety state",
);
modal = replaceOrSkip(
  modal,
  lines(
    '        await ctx.fetchJson(`${config.baseUrl}/health`, { headers: authHeaders(ctx, config) });',
    '        reachable = true;'
  ),
  lines(
    '        const health = await ctx.fetchJson(`${config.baseUrl}/health`, { headers: authHeaders(ctx, config) });',
    '        reachable = true;',
    '        allocationIdempotencyVerified = String(',
    '          health?.growthub?.allocationIdempotency || health?.allocationIdempotency || "",',
    '        ) === "growthub-idempotency-key-v1";'
  ),
  'health?.growthub?.allocationIdempotency',
  "Modal health attestation",
);
modal = replaceOrSkip(
  modal,
  lines('      quoteRef: gpu ? gpu.gpu : "",', '      ...(probeDetail ? { adapterMeta: { probeDetail } } : {}),'),
  lines(
    '      quoteRef: gpu ? gpu.gpu : "",',
    '      allocationIdempotencyVerified,',
    '      ...(probeDetail || !allocationIdempotencyVerified',
    '        ? { adapterMeta: {',
    '            ...(probeDetail ? { probeDetail } : {}),',
    '            ...(!allocationIdempotencyVerified ? { allocationIdempotency: "growthub-idempotency-key-v1 attestation missing" } : {}),',
    '          } }',
    '        : {}),'
  ),
  'allocationIdempotencyVerified,',
  "Modal quote attestation evidence",
);
write(modalPath, modal);

const rayPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/ray-cluster-compute.js";
let ray = read(rayPath);
ray = replaceOrSkip(
  ray,
  lines('        requiredEnv: c.authTokenEnv ? [c.authTokenEnv] : [],', '      };'),
  lines(
    '        requiredEnv: c.authTokenEnv ? [c.authTokenEnv] : [],',
    '        allocationIdempotency: {',
    '          guaranteed: true,',
    '          mode: "provider-native-key",',
    '          evidence: "Ray submission_id is derived from the sealed idempotency hash; already-exists resolves the same job",',
    '        },',
    '      };'
  ),
  'Ray submission_id is derived from the sealed idempotency hash',
  "Ray allocation safety declaration",
);
write(rayPath, ray);

const e2ePath = "scripts/e2e-compute-route-realization-loop.mjs";
let e2e = read(e2ePath);
e2e = replaceOrSkip(
  e2e,
  '  if (url.pathname === "/health") return json(200, { ok: true });',
  lines(
    '  if (url.pathname === "/health") return json(200, {',
    '    ok: true,',
    '    growthub: { allocationIdempotency: "growthub-idempotency-key-v1" },',
    '  });'
  ),
  'growthub: { allocationIdempotency: "growthub-idempotency-key-v1" }',
  "booted provider idempotency attestation",
);
write(e2ePath, e2e);

const certificationPath = "scripts/run-compute-certification.mjs";
let certification = read(certificationPath);
if (!certification.includes("scripts/unit-compute-allocation-idempotency.test.mjs")) {
  certification = replaceOnce(
    certification,
    '  "scripts/unit-compute-budget-policy.test.mjs",\n',
    lines(
      '  "scripts/unit-compute-budget-policy.test.mjs",',
      '  "scripts/unit-compute-allocation-idempotency.test.mjs",',
      ''
    ),
    "allocation idempotency certification suite",
  );
}
write(certificationPath, certification);

await import("./apply-compute-allocation-reconciliation.mjs");
console.log("[allocation-idempotency-v2] remote placement requires deterministic eligibility and response reconciliation");
