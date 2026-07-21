#!/usr/bin/env node
/** One unconditional compute certification entrypoint for local runs and CI. */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suites = [
  "scripts/unit-compute-contract.test.mjs",
  "scripts/unit-compute-capacity-profiles.test.mjs",
  "scripts/unit-compute-provider-registry.test.mjs",
  "scripts/unit-compute-resolver.test.mjs",
  "scripts/unit-compute-work-spec.test.mjs",
  "scripts/unit-compute-authority.test.mjs",
  "scripts/unit-compute-authority-production.test.mjs",
  "scripts/unit-compute-execution.test.mjs",
  "scripts/unit-compute-runpod.test.mjs",
  "scripts/unit-compute-modal.test.mjs",
  "scripts/unit-compute-ray.test.mjs",
  "scripts/unit-compute-customer-state.test.mjs",
  "scripts/unit-compute-adversarial.test.mjs",
  "scripts/unit-compute-route-wiring.test.mjs",
  "scripts/unit-training-evidence-completeness.test.mjs",
];

let failures = 0;
for (const suite of suites) {
  const file = path.join(root, suite);
  if (!existsSync(file)) { console.error(`[compute-certification] missing ${suite}`); failures += 1; continue; }
  console.log(`\n[compute-certification] node --test ${suite}`);
  const run = spawnSync(process.execPath, ["--test", file], { cwd: root, stdio: "inherit", env: process.env });
  if (run.status !== 0) failures += 1;
}

for (const proof of ["scripts/e2e-compute-route-realization-loop.mjs", "scripts/e2e-compute-realization-loop.mjs"]) {
  const file = path.join(root, proof);
  if (!existsSync(file)) { console.error(`[compute-certification] missing ${proof}`); failures += 1; continue; }
  console.log(`\n[compute-certification] node ${proof}`);
  const run = spawnSync(process.execPath, [file], { cwd: root, stdio: "inherit", env: process.env });
  if (run.status !== 0) failures += 1;
}

if (failures) {
  console.error(`\n[compute-certification] FAILED (${failures} suite(s))`);
  process.exit(1);
}
console.log("\n[compute-certification] all suites and composed route proofs passed");
