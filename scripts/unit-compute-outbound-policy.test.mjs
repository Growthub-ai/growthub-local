import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const registryPath = path.join(app, "lib/adapters/compute/compute-adapter-registry.js");
const canonicalPath = path.join(app, "lib/compute-network-policy.js");
const removedParallelPath = path.join(app, "lib/compute-outbound-policy.js");

test("compute has one production outbound-network authority", () => {
  assert.equal(fs.existsSync(canonicalPath), true, "canonical compute network policy exists");
  assert.equal(fs.existsSync(removedParallelPath), false, "parallel outbound policy universe stays removed");
  const registry = fs.readFileSync(registryPath, "utf8");
  assert.match(registry, /createGovernedComputeFetchJson/);
  assert.match(registry, /from "\.\.\/\.\.\/compute-network-policy\.js"/);
  assert.doesNotMatch(registry, /compute-outbound-policy/);
});
