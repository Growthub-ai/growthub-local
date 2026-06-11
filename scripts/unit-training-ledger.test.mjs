/**
 * Training ledger — registry entry + pure eligibility driver invariants.
 *
 * Guards the /training slash command (same single-entry contract as /swarm
 * and /workflows) and the deterministic ledger derivation:
 *   - /training is read-only: view switch only, no intent, no prompt seed,
 *     no patch/execute surface
 *   - the deriver is a pure causation driver: workspace evidence in,
 *     low-entropy eligibility out (blocked → eligible → complete)
 *   - export claims are only complete when the row's lastExportId matches
 *     a record in the training:* sidecar entry at lastSourceId; claims
 *     without sidecar evidence surface as missing, never as complete
 *   - the feature seed materializes a ledger the deriver scores complete
 *     with evidence linked
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
const { TRAINING_OBJECT, TRAINING_EXPORT_SUMMARY, buildFeatureWorkspaceSeed } = await import(
  pathToFileURL(path.join(repoRoot, "scripts/lib/workspace-feature-seed.mjs")).href
);

function configWithRows(rows) {
  return { dataModel: { objects: [{ objectType: TRAINING_OBJECT_TYPE, rows }] } };
}

const CLAIM_ROW = {
  Name: "workspace-local",
  localModel: "gemma3:4b",
  lastExportAt: "2026-06-10T00:00:00.000Z",
  lastExportId: "exp_1",
  lastSourceId: "training:model-training:workspace-local",
  lastExportSummary: JSON.stringify({ recordCount: 3, surfaces: { helper: 3 }, escalations: 0 }),
};

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

test("deriver blocked with no ledger object and no source records", () => {
  const blocked = deriveTrainingLedgerState({ workspaceConfig: { dataModel: { objects: [] } }, workspaceSourceRecords: {} });
  assert.equal(blocked.present, false);
  assert.equal(blocked.eligibility.state, "blocked");
});

test("deriver eligible with ledger row but no export claim", () => {
  const state = deriveTrainingLedgerState({
    workspaceConfig: configWithRows([{ Name: "workspace-local", localModel: "gemma3:4b" }]),
    workspaceSourceRecords: {},
  });
  assert.equal(state.present, true);
  assert.equal(state.eligibility.state, "eligible");
  assert.equal(state.coverage.exports, 0);
  assert.equal(state.models[0].evidence, "none");
});

test("deriver complete only when row export and source record match", () => {
  const matched = deriveTrainingLedgerState({
    workspaceConfig: configWithRows([CLAIM_ROW]),
    workspaceSourceRecords: {
      [CLAIM_ROW.lastSourceId]: { recordCount: 3, records: [{ exportId: "exp_1", recordCount: 3, surfaces: { helper: 3 }, escalations: 0 }] },
    },
  });
  assert.equal(matched.eligibility.state, "complete");
  assert.equal(matched.models[0].evidence, "linked");
  assert.equal(matched.coverage.exports, 1);
  assert.equal(matched.coverage.records, 3);

  const mismatched = deriveTrainingLedgerState({
    workspaceConfig: configWithRows([CLAIM_ROW]),
    workspaceSourceRecords: {
      [CLAIM_ROW.lastSourceId]: { records: [{ exportId: "exp_other" }] },
    },
  });
  assert.equal(mismatched.models[0].evidence, "missing");
  assert.equal(mismatched.eligibility.state, "eligible", "exportId mismatch never reads complete");
  assert.match(mismatched.eligibility.next, /rerun/i);
});

test("deriver flags missing sidecar evidence when row claims export without a record", () => {
  const state = deriveTrainingLedgerState({
    workspaceConfig: configWithRows([CLAIM_ROW]),
    workspaceSourceRecords: {},
  });
  assert.equal(state.models[0].evidence, "missing");
  assert.equal(state.missingEvidence, true);
  assert.equal(state.eligibility.state, "eligible");
  assert.equal(state.coverage.exports, 0, "unverified claims never count as exports");
});

test("deriver flags missing evidence when lastSourceId is absent on a claiming row", () => {
  const row = { ...CLAIM_ROW, lastSourceId: "" };
  const state = deriveTrainingLedgerState({
    workspaceConfig: configWithRows([row]),
    workspaceSourceRecords: { "training:model-training:workspace-local": { records: [{ exportId: "exp_1" }] } },
  });
  assert.equal(state.models[0].evidence, "missing");
  assert.equal(state.eligibility.state, "eligible");
});

test("backward compatibility — config-only callers keep pre-evidence behavior", () => {
  const state = deriveTrainingLedgerState({ workspaceConfig: configWithRows([CLAIM_ROW]) });
  assert.equal(state.models[0].evidence, "unverified");
  assert.equal(state.eligibility.state, "complete");
  assert.equal(state.coverage.exports, 1);
});

test("deriver does not crash on malformed lastExportSummary", () => {
  const row = { ...CLAIM_ROW, lastExportSummary: "{not json" };
  const state = deriveTrainingLedgerState({
    workspaceConfig: configWithRows([row]),
    workspaceSourceRecords: {
      [row.lastSourceId]: { records: [{ exportId: "exp_1", recordCount: 2 }] },
    },
  });
  assert.equal(state.models[0].summary, null);
  assert.equal(state.models[0].evidence, "linked", "sidecar record carries the truth when row summary is malformed");
  assert.equal(state.coverage.records, 2);
});

test("feature seed materializes a ledger the deriver scores complete with evidence linked", () => {
  const { workspaceConfig, sourceRecords } = buildFeatureWorkspaceSeed({});
  const state = deriveTrainingLedgerState({ workspaceConfig, workspaceSourceRecords: sourceRecords });
  assert.equal(state.present, true);
  assert.equal(state.eligibility.state, "complete");
  assert.equal(state.missingEvidence, false);
  assert.equal(state.models[0].evidence, "linked");
  assert.equal(state.coverage.exports, 1);
  assert.equal(state.coverage.records, TRAINING_EXPORT_SUMMARY.recordCount);
  assert.equal(state.coverage.escalations, TRAINING_EXPORT_SUMMARY.escalations);
  assert.deepEqual(state.coverage.surfaces, TRAINING_EXPORT_SUMMARY.surfaces);
});

test("seed row and sidecar record cross-reference exactly", () => {
  const { sourceRecords } = buildFeatureWorkspaceSeed({});
  const row = TRAINING_OBJECT.rows[0];
  assert.equal(TRAINING_OBJECT.id, "model-training");
  assert.equal(TRAINING_OBJECT.objectType, "model-training");
  assert.equal(row.Name, "workspace-local");
  const entry = sourceRecords[row.lastSourceId];
  assert.ok(entry, "sidecar carries the training:* ledger record at row.lastSourceId");
  assert.equal(entry.records[0].exportId, row.lastExportId);
  const rowSummary = parseExportSummary(row.lastExportSummary);
  assert.equal(entry.records[0].recordCount, rowSummary.recordCount);
  assert.deepEqual(entry.records[0].surfaces, rowSummary.surfaces);
});

test("summary parsing never throws and rejects non-objects", () => {
  assert.equal(parseExportSummary(undefined), null);
  assert.equal(parseExportSummary("not json"), null);
  assert.equal(parseExportSummary('"a string"'), null);
  assert.equal(parseExportSummary("[1,2]"), null);
  assert.deepEqual(parseExportSummary('{"recordCount":2}'), { recordCount: 2 });
});
