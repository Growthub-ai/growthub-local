#!/usr/bin/env node
/**
 * Keep the one-shot network applicator idempotent as concurrent hardening
 * commits land. This changes recognition markers only; production source and
 * behavioral tests remain the authority.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const applicatorFile = path.join(root, "scripts/apply-compute-network-hardening.mjs");
const networkFile = path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-network-policy.js",
);

let applicator = fs.readFileSync(applicatorFile, "utf8");
const network = fs.readFileSync(networkFile, "utf8");

if (network.includes("mixed public/private DNS answers")) {
  for (const oldMarker of [
    '  `resolves to mixed public/private addresses`,',
    '  `returned mixed public/private DNS answers`,',
  ]) {
    if (applicator.includes(oldMarker)) {
      applicator = applicator.replace(oldMarker, '  `mixed public/private DNS answers`,');
    }
  }
}
if (network.includes("metadata-service address")) {
  applicator = applicator.replace(
    '  `resolves to a forbidden metadata-service address`,',
    '  `metadata-service address`,',
  );
}
if (!applicator.includes('  `mixed public/private DNS answers`,')) {
  throw new Error("network applicator mixed-DNS recognition marker is missing");
}

fs.writeFileSync(applicatorFile, applicator);
console.log("[network] applicator recognizes the canonical metadata and mixed-DNS/rebinding refusals");
