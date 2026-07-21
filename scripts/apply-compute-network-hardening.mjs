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

const routePath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/sandbox-run/route.js";
let route = read(routePath);
route = replaceOnce(
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
  "compute network policy import",
);
route = replaceOnce(
  route,
  `import { buildInferenceTrustContext } from "@/lib/sandbox-execution-context";

function coerceBoolean`,
  `import { buildInferenceTrustContext } from "@/lib/sandbox-execution-context";

// One server-owned outbound boundary for every compute provider and artifact
// fetch. It applies operator allowlists, DNS pinning, redirect refusal,
// private/metadata-address controls, response bounds, and streaming hashes.
const governedComputeFetchJson = createGovernedComputeFetchJson();

function coerceBoolean`,
  "governed compute fetch construction",
);
const verifierStart = route.indexOf("/** Canonical artifact materialization/readback. Provider SHA claims alone fail. */");
const verifierEnd = route.indexOf("async function runServerlessScheduler", verifierStart);
if (verifierStart < 0 || verifierEnd < 0) throw new Error("[one-shot] artifact verifier block not found");
route = `${route.slice(0, verifierStart)}${route.slice(verifierEnd)}`;
route = replaceOnce(
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
  "inline compute fetch replacement",
);
route = replaceOnce(
  route,
  `          verifyArtifact: verifyComputeArtifactBytes,`,
  `          // Artifact bytes are streamed through the same outbound policy;
          // local paths are restricted to governed roots and expected output.
          verifyArtifact: (artifact, workSpec) => verifyGovernedComputeArtifact({ artifact, workSpec }),`,
  "artifact verifier wiring",
);
write(routePath, route);

const e2ePath = "scripts/e2e-compute-route-realization-loop.mjs";
let e2e = read(e2ePath);
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
    "compute certification suite registration",
  );
}
write(certificationPath, certification);

console.log("[one-shot] governed compute network policy wired into sandbox-run, route proof, and certification");
