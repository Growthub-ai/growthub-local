#!/usr/bin/env node
/**
 * Unit coverage for Orchestration Delta History V1 — roadmap Phase 1.5 / 2.4.
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install).
 *
 *   - summaries are newest-first with stable ordinals/versions
 *   - tags aggregate from delta + nodeDeltas, normalized + deduped
 *   - JSON-string columns parse (export/import round-trip safety)
 *   - tag filter is case-insensitive
 *   - never throws on partial / empty / malformed input
 *
 * Run with:  node --test scripts/unit-workspace-orchestration-deltas.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib",
);

const { summarizeOrchestrationDeltas, collectDeltaTags, filterDeltasByTag } = await import(
  pathToFileURL(path.join(kitLib, "workspace-orchestration-deltas.js")).href
);

const deltas = [
  {
    at: "2026-01-01T00:00:00.000Z",
    version: "2",
    previousVersion: "1",
    changeReason: "initial publish",
    deltaTags: ["Routing"],
    nodeDeltas: [{ nodeId: "n1", label: "Start", deltaTags: ["routing"], previous: null }],
    nodeCount: 1,
    edgeCount: 0,
  },
  {
    at: "2026-02-01T00:00:00.000Z",
    version: "3",
    previousVersion: "2",
    changeReason: "swap model",
    deltaTags: [],
    nodeDeltas: [
      { nodeId: "n2", label: "LLM", changeReason: "gpt→claude", deltaTags: ["Model"], previous: { type: "llm" } },
    ],
    nodeCount: 2,
    edgeCount: 1,
  },
];

test("deltas — public API exports", () => {
  assert.equal(typeof summarizeOrchestrationDeltas, "function");
  assert.equal(typeof collectDeltaTags, "function");
  assert.equal(typeof filterDeltasByTag, "function");
});

test("summarize — newest-first with ordinals/versions", () => {
  const s = summarizeOrchestrationDeltas(deltas);
  assert.equal(s.length, 2);
  assert.equal(s[0].version, "3"); // newest first
  assert.equal(s[1].version, "2");
  assert.equal(s[0].ordinal, 2);
  assert.equal(s[1].ordinal, 1);
});

test("summarize — tags aggregate from delta + nodeDeltas, normalized", () => {
  const s = summarizeOrchestrationDeltas(deltas);
  const v3 = s[0];
  // v3 delta.deltaTags empty → falls back to node tags ("model")
  assert.deepEqual(v3.deltaTags, ["model"]);
  const v2 = s[1];
  assert.deepEqual(v2.deltaTags, ["routing"]);
  assert.equal(v2.nodeDeltas[0].isNew, true);
  assert.equal(v3.nodeDeltas[0].isNew, false);
});

test("collectDeltaTags — distinct sorted union", () => {
  assert.deepEqual(collectDeltaTags(summarizeOrchestrationDeltas(deltas)), ["model", "routing"]);
});

test("filterDeltasByTag — case-insensitive", () => {
  const s = summarizeOrchestrationDeltas(deltas);
  assert.equal(filterDeltasByTag(s, "MODEL").length, 1);
  assert.equal(filterDeltasByTag(s, "model")[0].version, "3");
  assert.equal(filterDeltasByTag(s, "").length, 2);
  assert.equal(filterDeltasByTag(s, "nope").length, 0);
});

test("summarize — parses JSON-string column", () => {
  const s = summarizeOrchestrationDeltas(JSON.stringify(deltas));
  assert.equal(s.length, 2);
  assert.equal(s[0].version, "3");
});

test("summarize — never throws on partial/empty/malformed", () => {
  assert.deepEqual(summarizeOrchestrationDeltas(undefined), []);
  assert.deepEqual(summarizeOrchestrationDeltas(null), []);
  assert.deepEqual(summarizeOrchestrationDeltas("not json"), []);
  assert.deepEqual(summarizeOrchestrationDeltas(42), []);
  const partial = summarizeOrchestrationDeltas([{}]);
  assert.equal(partial.length, 1);
  assert.equal(partial[0].action, "publish");
});
