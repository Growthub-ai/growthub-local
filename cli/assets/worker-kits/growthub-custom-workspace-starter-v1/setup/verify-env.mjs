#!/usr/bin/env node
// Starter kit — env verification.
// Prints a readiness report; exits non-zero if critical env is missing.
import process from "node:process";

const required = []; // starter ships with zero required env — add as the workspace grows
const optional = ["GROWTHUB_KIT_FORKS_HOME", "GROWTHUB_GITHUB_HOME"];

let errors = 0;
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[verify-env] missing required env: ${key}`);
    errors += 1;
  }
}
for (const key of optional) {
  const v = process.env[key];
  console.log(`[verify-env] ${key} = ${v ? v : "(unset — default path applies)"}`);
}
process.exit(errors > 0 ? 1 : 0);
