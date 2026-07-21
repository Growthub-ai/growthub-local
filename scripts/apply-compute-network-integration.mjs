#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executionPath = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-execution.js");
const routePath = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/sandbox-run/route.js");
const proofPath = path.join(root, "scripts/e2e-compute-route-realization-loop.mjs");
const workflowPath = path.join(root, ".github/workflows/apply-compute-network-integration.yml");
const selfPath = fileURLToPath(import.meta.url);

function replaceOnce(source, pattern, replacement, label) {
  const matches = typeof pattern === "string"
    ? source.split(pattern).length - 1
    : [...source.matchAll(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`))].length;
  if (matches !== 1) throw new Error(`${label}: expected exactly one match, found ${matches}`);
  return source.replace(pattern, replacement);
}

let execution = fs.readFileSync(executionPath, "utf8");
if (!execution.includes('from "./compute-network-policy.js"')) {
  execution = replaceOnce(
    execution,
    'import {\n  normalizeComputePolicy,\n  normalizeComputeRequest,\n  sha256Hex,\n  verifyComputeAuthority,\n} from "./compute-work-spec.js";\n',
    'import {\n  normalizeComputePolicy,\n  normalizeComputeRequest,\n  sha256Hex,\n  verifyComputeAuthority,\n} from "./compute-work-spec.js";\nimport { verifyGovernedComputeArtifact } from "./compute-network-policy.js";\n',
    "compute-execution canonical verifier import",
  );
}
execution = replaceOnce(
  execution,
  /      const verified = typeof io\.verifyArtifact === "function"\n        \? await safeCall\(\(\) => io\.verifyArtifact\(candidate, workSpec\)\)\n        : null;/,
  `      // Production verification is server-owned and cannot be selected by the\n      // route or a provider. Node's test runner alone may inject a deterministic\n      // verifier for isolated unit fixtures; booted proofs and production always\n      // cross the DNS-pinned, streaming, governed-root policy.\n      const verified = process.env.NODE_TEST_CONTEXT && typeof io.verifyArtifact === "function"\n        ? await safeCall(() => io.verifyArtifact(candidate, workSpec))\n        : await safeCall(() => verifyGovernedComputeArtifact({\n            artifact: candidate,\n            workSpec,\n            env: io.env || process.env,\n            resolveHostname: io.resolveHostname,\n          }));`,
  "compute-execution production artifact verification",
);
fs.writeFileSync(executionPath, execution);

let route = fs.readFileSync(routePath, "utf8");
if (!route.includes('from "@/lib/compute-network-policy"')) {
  route = replaceOnce(
    route,
    'import {\n  compileComputeAuthority,\n  verifyComputeAuthorityAgainstWorkspace,\n  verifyComputeAuthoritySeal\n} from "@/lib/compute-authority";\n',
    'import {\n  compileComputeAuthority,\n  verifyComputeAuthorityAgainstWorkspace,\n  verifyComputeAuthoritySeal\n} from "@/lib/compute-authority";\nimport {\n  createGovernedComputeFetchJson,\n  verifyGovernedComputeArtifact\n} from "@/lib/compute-network-policy";\n',
    "sandbox route canonical policy import",
  );
}
route = replaceOnce(
  route,
  /async function verifyComputeArtifactBytes\(artifact\) \{[\s\S]*?\n\}\n\nasync function runServerlessScheduler/,
  `async function verifyComputeArtifactBytes(artifact, workSpec) {\n  return verifyGovernedComputeArtifact({ artifact, workSpec });\n}\n\nasync function runServerlessScheduler`,
  "sandbox route artifact verifier",
);
route = replaceOnce(
  route,
  /          fetchJson: async \(url, init\) => \{[\s\S]*?\n          \},\n          now:/,
  `          fetchJson: createGovernedComputeFetchJson(),\n          now:`,
  "sandbox route provider fetch",
);
const createHashUses = (route.match(/createHash\(/g) || []).length;
if (createHashUses === 0) route = route.replace('import { createHash } from "node:crypto";\n', "");
fs.writeFileSync(routePath, route);

let proof = fs.readFileSync(proofPath, "utf8");
if (!proof.includes("GROWTHUB_COMPUTE_NETWORK_ALLOWLIST")) {
  proof = replaceOnce(
    proof,
    "GROWTHUB_COMPUTE_AUTHORITY_KEY: AUTHORITY_KEY",
    'GROWTHUB_COMPUTE_AUTHORITY_KEY: AUTHORITY_KEY, GROWTHUB_COMPUTE_NETWORK_ALLOWLIST: "127.0.0.1", GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST: "127.0.0.1"',
    "booted proof compute network allowlist",
  );
}
fs.writeFileSync(proofPath, proof);

fs.rmSync(workflowPath, { force: true });
fs.rmSync(selfPath, { force: true });
console.log("applied canonical compute network integration and removed temporary patch machinery");
