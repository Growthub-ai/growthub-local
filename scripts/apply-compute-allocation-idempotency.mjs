#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (rel, content) => fs.writeFileSync(path.join(root, rel), content);

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`[allocation-idempotency] missing anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`[allocation-idempotency] ambiguous anchor: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceOrSkip(source, before, after, marker, label) {
  if (source.includes(before)) return replaceOnce(source, before, after, label);
  if (marker && source.includes(marker)) return source;
  throw new Error(`[allocation-idempotency] neither old nor hardened form found: ${label}`);
}

// Production adapter registry: unknown remote adapters are explicitly unsafe,
// so the resolver can fail closed without breaking direct test doubles that do
// not enter the production registry.
const registryPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/compute-adapter-registry.js";
let registry = read(registryPath);
registry = replaceOrSkip(
  registry,
  `const wrappedByOriginal = new WeakMap();`,
  `const wrappedByOriginal = new WeakMap();\n\nfunction normalizedAllocationIdempotency(value) {\n  const input = value && typeof value === "object" ? value : {};\n  const allowedModes = new Set(["provider-native-key", "reconcile-before-create", "endpoint-contract", "unproven"]);\n  const mode = allowedModes.has(String(input.mode || "")) ? String(input.mode) : "unproven";\n  return {\n    guaranteed: input.guaranteed === true,\n    mode,\n    evidence: String(input.evidence || (mode === "unproven" ? "adapter did not prove deterministic allocation reconciliation" : "")).slice(0, 240),\n  };\n}`,
  `function normalizedAllocationIdempotency`,
  "allocation safety normalizer",
);
registry = replaceOrSkip(
  registry,
  `  const wrapped = { ...adapter };\n  for (const method of CONTEXT_METHODS) {`,
  `  const wrapped = { ...adapter };\n  wrapped.describeCapabilities = function governedDescribeCapabilities(config) {\n    const capabilities = adapter.describeCapabilities.call(adapter, config);\n    return {\n      ...(capabilities && typeof capabilities === "object" ? capabilities : {}),\n      // Remote production adapters are unsafe by default. An adapter must\n      // explicitly prove a provider-native key/reconcile seam, or its live\n      // quote must attest the external endpoint contract.\n      allocationIdempotency: normalizedAllocationIdempotency(capabilities?.allocationIdempotency),\n    };\n  };\n  for (const method of CONTEXT_METHODS) {`,
  `wrapped.describeCapabilities = function governedDescribeCapabilities`,
  "production registry capability wrapper",
);
write(registryPath, registry);

// Resolver: every registered remote adapter now carries an explicit safety
// verdict. Static guarantee or dynamic endpoint attestation is required.
const resolverPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-resolver.js";
let resolver = read(resolverPath);
resolver = replaceOrSkip(
  resolver,
  `  } else {\n    if (num(req.gpuCount) > 0) {`,
  `  } else {\n    const allocationSafety = caps.allocationIdempotency && typeof caps.allocationIdempotency === "object"\n      ? caps.allocationIdempotency\n      : null;\n    if (providerId !== "local-machine"\n      && allocationSafety\n      && allocationSafety.guaranteed !== true\n      && quote?.allocationIdempotencyVerified !== true) {\n      flag(\n        "allocation-idempotency-unproven",\n        allocationSafety.evidence\n          ? \`provider cannot safely recover the provider-accepted-before-persist crash window: ${allocationSafety.evidence}\`\n          : "provider cannot prove deterministic allocation reconciliation",\n      );\n    }\n    if (num(req.gpuCount) > 0) {`,
  `allocation-idempotency-unproven`,
  "resolver idempotency eligibility gate",
);
write(resolverPath, resolver);

// Runpod Pods have deterministic name reconciliation. Serverless /run has no
// documented deterministic lookup and is therefore ineligible for governed
// paid execution rather than pretending the upstream journal is enough.
const runpodPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/runpod-compute.js";
let runpod = read(runpodPath);
runpod = replaceOrSkip(
  runpod,
  `      requiredEnv: [c.apiKeyEnv],\n      // Optional extension floors the resolver honors when declared.`,
  `      requiredEnv: [c.apiKeyEnv],\n      allocationIdempotency: c.mode === "serverless"\n        ? {\n            guaranteed: false,\n            mode: "unproven",\n            evidence: "Runpod Serverless /run returns a generated job id and exposes no deterministic idempotency lookup",\n          }\n        : {\n            guaranteed: true,\n            mode: "reconcile-before-create",\n            evidence: "deterministic pod name from the sealed idempotency hash; GET /pods?name runs before POST /pods",\n          },\n      // Optional extension floors the resolver honors when declared.`,
  `Runpod Serverless /run returns a generated job id`,
  "Runpod allocation safety declaration",
);
write(runpodPath, runpod);

// Modal is safe only when the separately deployed worker proves that it dedupes
// the forwarded Growthub idempotency key. Config claims alone do not count.
const modalPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/modal-compute.js";
let modal = read(modalPath);
modal = replaceOrSkip(
  modal,
  `      requiredEnv: [c.tokenIdEnv, c.tokenSecretEnv],\n    };`,
  `      requiredEnv: [c.tokenIdEnv, c.tokenSecretEnv],\n      allocationIdempotency: {\n        guaranteed: false,\n        mode: "endpoint-contract",\n        evidence: "the deployed Modal function must dynamically attest growthub-idempotency-key-v1 at /health",\n      },\n    };`,
  `growthub-idempotency-key-v1 at /health`,
  "Modal static allocation safety declaration",
);
modal = replaceOrSkip(
  modal,
  `    let reachable = false;\n    let probeDetail = "";`,
  `    let reachable = false;\n    let allocationIdempotencyVerified = false;\n    let probeDetail = "";`,
  `let allocationIdempotencyVerified = false`,
  "Modal dynamic safety state",
);
modal = replaceOrSkip(
  modal,
  `        await ctx.fetchJson(\`${config.baseUrl}/health\`, { headers: authHeaders(ctx, config) });\n        reachable = true;`,
  `        const health = await ctx.fetchJson(\`${config.baseUrl}/health\`, { headers: authHeaders(ctx, config) });\n        reachable = true;\n        allocationIdempotencyVerified = String(\n          health?.growthub?.allocationIdempotency || health?.allocationIdempotency || "",\n        ) === "growthub-idempotency-key-v1";`,
  `health?.growthub?.allocationIdempotency`,
  "Modal health attestation",
);
modal = replaceOrSkip(
  modal,
  `      quoteRef: gpu ? gpu.gpu : "",\n      ...(probeDetail ? { adapterMeta: { probeDetail } } : {}),`,
  `      quoteRef: gpu ? gpu.gpu : "",\n      allocationIdempotencyVerified,\n      ...(probeDetail || !allocationIdempotencyVerified\n        ? { adapterMeta: {\n            ...(probeDetail ? { probeDetail } : {}),\n            ...(!allocationIdempotencyVerified ? { allocationIdempotency: "growthub-idempotency-key-v1 attestation missing" } : {}),\n          } }\n        : {}),`,
  `allocationIdempotencyVerified,`,
  "Modal quote attestation evidence",
);
write(modalPath, modal);

// Ray Jobs uses a caller-supplied deterministic submission_id and adopts the
// existing job after an already-exists response.
const rayPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/ray-cluster-compute.js";
let ray = read(rayPath);
ray = replaceOrSkip(
  ray,
  `        requiredEnv: c.authTokenEnv ? [c.authTokenEnv] : [],\n      };`,
  `        requiredEnv: c.authTokenEnv ? [c.authTokenEnv] : [],\n        allocationIdempotency: {\n          guaranteed: true,\n          mode: "provider-native-key",\n          evidence: "Ray submission_id is derived from the sealed idempotency hash; already-exists resolves the same job",\n        },\n      };`,
  `Ray submission_id is derived from the sealed idempotency hash`,
  "Ray allocation safety declaration",
);
write(rayPath, ray);

// The booted Modal-shaped fake provider must prove the same endpoint contract
// required of a real deployed function.
const e2ePath = "scripts/e2e-compute-route-realization-loop.mjs";
let e2e = read(e2ePath);
e2e = replaceOrSkip(
  e2e,
  `  if (url.pathname === "/health") return json(200, { ok: true });`,
  `  if (url.pathname === "/health") return json(200, {\n    ok: true,\n    growthub: { allocationIdempotency: "growthub-idempotency-key-v1" },\n  });`,
  `growthub: { allocationIdempotency: "growthub-idempotency-key-v1" }`,
  "booted provider idempotency attestation",
);
write(e2ePath, e2e);

const certificationPath = "scripts/run-compute-certification.mjs";
let certification = read(certificationPath);
if (!certification.includes("scripts/unit-compute-allocation-idempotency.test.mjs")) {
  certification = replaceOnce(
    certification,
    `  "scripts/unit-compute-budget-policy.test.mjs",\n`,
    `  "scripts/unit-compute-budget-policy.test.mjs",\n  "scripts/unit-compute-allocation-idempotency.test.mjs",\n`,
    "allocation idempotency certification suite",
  );
}
write(certificationPath, certification);

// The eligibility proof above prevents unsafe providers from being selected.
// The runtime applicator below closes the remaining ambiguity window: when a
// safe provider accepted capacity but its response was lost, adopt the exact
// idempotency-bound resource or stay pending without a second paid create.
await import("./apply-compute-allocation-reconciliation.mjs");

console.log("[allocation-idempotency] remote placement requires deterministic eligibility and response reconciliation");
