import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

test("remote training continues through the existing governed sandbox-run authority", () => {
  const route = read("app/api/workspace/sandbox-run/route.js");
  const modal = read("app/data-model/components/TrainingHandoffModal.jsx");

  assert.match(route, /\["run",\s*"observe",\s*"cancel",\s*"resume"\]/, "route accepts the bounded observe continuation");
  assert.match(modal, /computeAction:\s*"observe"/, "customer polling invokes the observe continuation");
  assert.match(modal, /remoteCompute\?\.allocation/, "observation begins only after durable allocation evidence exists");
  assert.match(modal, /remoteSelected\s*!==\s*"local-machine"/, "local training never enters remote observation");
  assert.match(modal, /observeInFlight/, "overlapping observation calls are refused client-side");
  assert.match(modal, /observeNow\s*-\s*lastObserveAt\s*>=\s*10_000/, "observation cadence is explicitly bounded");
  assert.doesNotMatch(route, /api\/compute\/run/, "no parallel compute mutation route was introduced");
});
