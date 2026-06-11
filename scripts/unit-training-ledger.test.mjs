/**
 * Training ledger — registry entry + pure eligibility driver invariants.
 *
 * Guards the /training slash command (same single-entry contract as /swarm
 * and /workflows) and the deterministic ledger derivation:
 *   - /training is read-only: view switch only, no intent, no prompt seed,
 *     no patch/execute surface
 *   - the deriver is a pure causation driver: workspace evidence in,
 *     low-entropy eligibility out (blocked → eligible → complete)
 *   - the feature seed materializes a ledger the deriver scores complete
 *
 * Run with:  node --test scripts/unit-training-ledger.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kitApp = path.join(
  repoRoot,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace",
);

const { HELPER_COMMANDS, HELPER_COMMAND_ALLOWED_KEYS } = await import(
  pathToFileURL(path.join(kitApp, "app/data-model/components/helper-commands.js")).href
);
const { deriveTrainingLedgerState, parseExportSummary, TRAINING_OBJECT_TYPE } = await import(
  pathToFileURL(path.join(kitApp, "lib/training-ledger.js")).href
);
const { TRAINING_OBJECT, buildFeatureWorkspaceSeed } = await import(
  pathToFileURL(path.join(repoRoot, "scripts/lib/workspace-feature-seed.mjs")).href
);

test("/training is registered read-only with a view switch and nothing else", () => {
  const cmd = HELPER_COMMANDS.find((c) => c.name === "/training");
  assert.ok(cmd, "/training present in registry");
  assert.equal(cmd.mutates, false);
  assert.equal(cmd.view, "training");
  assert.equal(cmd.intent, undefined, "read-only command must not seed an intent");
  assert.equal(cmd.promptTemplate, undefined, "read-only command must not seed a prompt");
  for (const key of Object.keys(cmd)) {
    assert.ok(HELPER_COMMAND_ALLOWED_KEYS.includes(key), `${key} is an allowed command key`);
  }
});

test("deriver is blocked with no ledger object, eligible with rows but no exports", () => {
  const blocked = deriveTrainingLedgerState({ workspaceConfig: { dataModel: { objects: [] } } });
  assert.equal(blocked.present, false);
  assert.equal(blocked.eligibility.state, "blocked");

  const eligible = deriveTrainingLedgerState({
    workspaceConfig: {
      dataModel: {
        objects: [{
          objectType: TRAINING_OBJECT_TYPE,
          rows: [{ Name: "workspace-local", localModel: "gemma3:4b" }],
        }],
      },
    },
  });
  assert.equal(eligible.present, true);
  assert.equal(eligible.eligibility.state, "eligible");
  assert.equal(eligible.coverage.exports, 0);
});

test("feature seed materializes a ledger the deriver scores complete", () => {
  const { workspaceConfig, sourceRecords } = buildFeatureWorkspaceSeed({});
  const state = deriveTrainingLedgerState({ workspaceConfig });
  assert.equal(state.present, true);
  assert.equal(state.eligibility.state, "complete");
  assert.equal(state.coverage.exports, 1);
  assert.equal(state.coverage.records, 4);
  assert.equal(state.coverage.escalations, 1);
  assert.deepEqual(state.coverage.surfaces, { helper: 2, selfEval: 1, swarm: 1 });

  const row = TRAINING_OBJECT.rows[0];
  const ledgerKey = row.lastSourceId;
  assert.ok(sourceRecords[ledgerKey], "sidecar carries the training:* ledger record");
  assert.equal(sourceRecords[ledgerKey].records[0].exportId, row.lastExportId);
});

test("summary parsing never throws and rejects non-objects", () => {
  assert.equal(parseExportSummary(undefined), null);
  assert.equal(parseExportSummary("not json"), null);
  assert.equal(parseExportSummary('"a string"'), null);
  assert.deepEqual(parseExportSummary('{"recordCount":2}'), { recordCount: 2 });
});
