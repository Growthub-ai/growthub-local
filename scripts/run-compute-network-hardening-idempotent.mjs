#!/usr/bin/env node
/**
 * Exact-head compatibility wrapper for the one-shot network applicator.
 *
 * Parallel hardening commits may land the canonical protection before the
 * applicator runs. Update only its recognition markers in the ephemeral
 * Actions checkout, then execute the same applicator. Production files and
 * tests remain the authority; this wrapper never weakens or skips a change.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const applicatorPath = path.join(root, "scripts/apply-compute-network-hardening.mjs");
const networkPath = path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-network-policy.js",
);

let applicator = fs.readFileSync(applicatorPath, "utf8");
const network = fs.readFileSync(networkPath, "utf8");

if (network.includes("mixed public/private DNS answers")) {
  applicator = applicator.replace(
    '`resolves to mixed public/private addresses`,\n  "metadata and mixed-DNS refusal",',
    '`mixed public/private DNS answers`,\n  "metadata and mixed-DNS refusal",',
  );
}
if (network.includes("metadata-service address")) {
  applicator = applicator.replace(
    '`resolves to a forbidden metadata-service address`,',
    '`metadata-service address`,',
  );
}

fs.writeFileSync(applicatorPath, applicator);
await import(`${pathToFileURL(applicatorPath).href}?exactHead=${Date.now()}`);
