#!/usr/bin/env node
/**
 * Unit coverage for the Workspace Authority Intelligence combiner
 * (lib/workspace-authority-intelligence.js).
 *
 * This is the canonical convergence point of the formerly-separate health +
 * agent-context (#250) and governance-causation (#251) projections. The suite
 * proves the combiner is a PURE read model: it never throws, never echoes
 * secrets, rolls status up correctly from both lanes, normalizes one
 * next-action model across health + governance, and only ever points at
 * EXISTING fix surfaces.
 *
 * Run with:  node --test scripts/unit-workspace-authority-intelligence.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const libPath = path.join(
  here,
  "..",
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-authority-intelligence.js"
);

const {
  AUTHORITY_KIND,
  AUTHORITY_VERSION,
  AUTHORITY_SURFACES,
  deriveAuthorityStatus,
  deriveAuthorityNextActions,
  deriveWorkspaceAuthorityIntelligence,
} = await import(pathToFileURL(libPath).href);

// --- fixtures ---------------------------------------------------------------

// A metadata store with one stale widget (warning) → health "degraded".
function storeWithStaleWidget() {
  return {
    objects: [{ id: "o1" }],
    widgets: [{ id: "w1", objectId: "o1", warnings: ["bound but no axis fields"] }],
  };
}

// A metadata store with a widget bound to a non-existent object → dangling
// edge (error) → health "unhealthy".
function storeWithDanglingEdge() {
  return {
    widgets: [{ id: "w1", objectId: "ghost-object" }],
  };
}

// A receipt pair that confirms a HIGH-severity route-shop: blocked direct,
// then a SUCCEEDED proof within a minute by the same actor.
function highSeverityReceipts() {
  return [
    {
      receiptId: "r1",
      actor: "agent-1",
      lane: "untrusted-direct",
      outcomeStatus: "blocked",
      seq: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      objectRefs: [{ objectId: "obj1", rowName: "Row1" }],
    },
    {
      receiptId: "r2",
      actor: "agent-1",
      lane: "execution-proof",
      outcomeStatus: "verified",
      seq: 2,
      createdAt: "2026-01-01T00:00:30.000Z",
      objectRefs: [{ objectId: "obj1", rowName: "Row1" }],
    },
  ];
}

// A receipt pair that confirms a LOW-severity route-shop: blocked direct, then
// a held proof much later by the same actor.
function lowSeverityReceipts() {
  return [
    {
      receiptId: "rb",
      actor: "agent-9",
      lane: "untrusted-direct",
      outcomeStatus: "blocked",
      seq: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      objectRefs: [{ objectId: "objL", rowName: "RowL" }],
    },
    {
      receiptId: "rf",
      actor: "agent-9",
      lane: "execution-proof",
      outcomeStatus: "rejected",
      seq: 2,
      createdAt: "2026-01-01T01:00:00.000Z",
      objectRefs: [{ objectId: "objL", rowName: "RowL" }],
    },
  ];
}

// --- 1. never throws --------------------------------------------------------

test("empty / partial / malformed input never throws", () => {
  assert.doesNotThrow(() => deriveWorkspaceAuthorityIntelligence());
  assert.doesNotThrow(() => deriveWorkspaceAuthorityIntelligence({}));
  assert.doesNotThrow(() => deriveWorkspaceAuthorityIntelligence({ metadataStore: null, receipts: null }));
  assert.doesNotThrow(() => deriveWorkspaceAuthorityIntelligence({ metadataStore: 7, receipts: "nope", workspaceConfig: 3 }));
  assert.doesNotThrow(() => deriveAuthorityStatus());
  assert.doesNotThrow(() => deriveAuthorityStatus({}));
  assert.doesNotThrow(() => deriveAuthorityNextActions());
  assert.doesNotThrow(() => deriveAuthorityNextActions({ health: null, governance: null }));

  const empty = deriveWorkspaceAuthorityIntelligence();
  assert.equal(empty.kind, AUTHORITY_KIND);
  assert.equal(empty.version, AUTHORITY_VERSION);
  assert.equal(empty.status, "clear");
  assert.ok(Array.isArray(empty.nextActions));
});

// --- 2..5 status rollup -----------------------------------------------------

test("healthy health + clear governance => clear", () => {
  const model = deriveWorkspaceAuthorityIntelligence({ metadataStore: {}, receipts: [] });
  assert.equal(model.health.status, "healthy");
  assert.equal(model.governance.status, "clear");
  assert.equal(model.status, "clear");
});

test("degraded health + clear governance => watch", () => {
  const model = deriveWorkspaceAuthorityIntelligence({ metadataStore: storeWithStaleWidget(), receipts: [] });
  assert.equal(model.health.status, "degraded");
  assert.equal(model.status, "watch");
});

test("unhealthy health + clear governance => attention", () => {
  const model = deriveWorkspaceAuthorityIntelligence({ metadataStore: storeWithDanglingEdge(), receipts: [] });
  assert.equal(model.health.status, "unhealthy");
  assert.equal(model.status, "attention");
});

test("healthy health + alert governance => attention", () => {
  const model = deriveWorkspaceAuthorityIntelligence({ metadataStore: {}, receipts: highSeverityReceipts() });
  assert.equal(model.health.status, "healthy");
  assert.equal(model.governance.status, "alert");
  assert.equal(model.status, "attention");
});

test("deriveAuthorityStatus is a total function over the lane statuses", () => {
  assert.equal(deriveAuthorityStatus({ health: { status: "unhealthy" }, governance: { status: "clear" } }), "attention");
  assert.equal(deriveAuthorityStatus({ health: { status: "healthy" }, governance: { status: "alert" } }), "attention");
  assert.equal(deriveAuthorityStatus({ health: { status: "degraded" }, governance: { status: "clear" } }), "watch");
  assert.equal(deriveAuthorityStatus({ health: { status: "healthy" }, governance: { status: "watch" } }), "watch");
  assert.equal(deriveAuthorityStatus({ health: { status: "healthy" }, governance: { status: "clear" } }), "clear");
});

// --- 6..7 next-action prioritization ---------------------------------------

test("high-severity governance signal outranks a stale-widget warning", () => {
  const model = deriveWorkspaceAuthorityIntelligence({
    metadataStore: storeWithStaleWidget(),
    receipts: highSeverityReceipts(),
  });
  assert.ok(model.nextActions.length >= 2);
  assert.equal(model.nextActions[0].source, "governance");
  assert.equal(model.nextActions[0].severity, "high");
});

test("health error outranks a low-severity governance signal when no high signal exists", () => {
  const model = deriveWorkspaceAuthorityIntelligence({
    metadataStore: storeWithDanglingEdge(),
    receipts: lowSeverityReceipts(),
  });
  assert.equal(model.governance.totals.highSeverity, 0);
  assert.ok(model.nextActions.length >= 2);
  assert.equal(model.nextActions[0].source, "health");
  assert.equal(model.nextActions[0].severity, "error");
});

// --- 8 no secrets -----------------------------------------------------------

test("combined model never echoes secret-shaped values from raw inputs", () => {
  const SECRET = "sk-LIVE-SECRET-shouldNeverSurface-0xDEADBEEF";
  const model = deriveWorkspaceAuthorityIntelligence({
    // secret-shaped values smuggled into raw config + source rows + receipt
    // payloads that the read models must NOT surface.
    metadataStore: {
      objects: [{ id: "o1", apiKey: SECRET, isLiveBacked: true, sourceId: "s1" }],
      widgets: [{ id: "w1", objectId: "o1", token: SECRET }],
      sourceRecords: [{ id: "s1", recordCount: 3, rows: [{ password: SECRET }] }],
    },
    workspaceConfig: { name: "Acme", authToken: SECRET, secrets: { stripe: SECRET } },
    receipts: [{ receiptId: "r1", actor: "a", lane: "x", outcomeStatus: "ok", bearerToken: SECRET }],
  });
  const serialized = JSON.stringify(model);
  assert.equal(serialized.includes(SECRET), false, "no secret-shaped value may appear in the combined packet");
  assert.equal(serialized.includes("sk-LIVE"), false);
});

// --- 9 purity of the source ------------------------------------------------

test("combiner source contains no fetch/window/document/storage/React/fs writes", () => {
  const source = fs.readFileSync(libPath, "utf8");
  // Strip the block comment header so doc prose ("no fetch, no filesystem")
  // does not trip the token scan; only executable code is checked.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const banned of [
    "fetch(",
    "window.",
    "document.",
    "localStorage",
    "sessionStorage",
    "from \"react\"",
    "from 'react'",
    "writeFile",
    "writeFileSync",
    "require(",
  ]) {
    assert.equal(code.includes(banned), false, `combiner code must not contain "${banned}"`);
  }
});

// --- 10 surfaces ------------------------------------------------------------

test("every next-action artifact uses an existing surface only", () => {
  const model = deriveWorkspaceAuthorityIntelligence({
    metadataStore: {
      objects: [{ id: "o1", isLiveBacked: true, sourceId: "missing" }],
      widgets: [{ id: "w1", objectId: "ghost" }, { id: "w2", objectId: "o1", warnings: ["stale"] }],
      pipelineHealth: [{ status: "unhealthy", label: "P1", objectId: "o1", rowId: "Row1", latestRunId: "x" }],
    },
    receipts: highSeverityReceipts(),
  });
  for (const action of model.nextActions) {
    if (action.artifact) {
      assert.ok(
        AUTHORITY_SURFACES.has(action.artifact.surface),
        `unexpected surface "${action.artifact.surface}"`
      );
    }
  }
  // The governance handoff must be a swarm-run target.
  const gov = model.nextActions.find((a) => a.source === "governance" && a.artifact);
  assert.ok(gov);
  assert.equal(gov.artifact.surface, "swarm-run");
});

// --- 11 duplicate same-actor signals ---------------------------------------

test("duplicate same-actor governance signals do not collapse into one", () => {
  const receipts = [
    { receiptId: "b1", actor: "dup", lane: "untrusted-direct", outcomeStatus: "blocked", seq: 1, createdAt: "2026-01-01T00:00:00.000Z", objectRefs: [{ objectId: "o", rowName: "R1" }] },
    { receiptId: "p1", actor: "dup", lane: "execution-proof", outcomeStatus: "verified", seq: 2, createdAt: "2026-01-01T00:00:10.000Z", objectRefs: [{ objectId: "o", rowName: "R1" }] },
    { receiptId: "b2", actor: "dup", lane: "untrusted-direct", outcomeStatus: "blocked", seq: 3, createdAt: "2026-01-01T00:01:00.000Z", objectRefs: [{ objectId: "o", rowName: "R2" }] },
    { receiptId: "p2", actor: "dup", lane: "execution-proof", outcomeStatus: "verified", seq: 4, createdAt: "2026-01-01T00:01:10.000Z", objectRefs: [{ objectId: "o", rowName: "R2" }] },
  ];
  const model = deriveWorkspaceAuthorityIntelligence({ metadataStore: {}, receipts });
  assert.equal(model.governance.totals.routeShopSignals, 2);
  const govActions = model.nextActions.filter((a) => a.source === "governance");
  assert.equal(govActions.length, 2);
  assert.notEqual(govActions[0].id, govActions[1].id);
});

// --- 12 warnings are not laundered into "healthy" --------------------------

test("a degraded/unhealthy health is never rolled up as clear", () => {
  const degraded = deriveWorkspaceAuthorityIntelligence({ metadataStore: storeWithStaleWidget(), receipts: [] });
  assert.notEqual(degraded.status, "clear");
  assert.equal(degraded.summary.health, "degraded");

  const unhealthy = deriveWorkspaceAuthorityIntelligence({ metadataStore: storeWithDanglingEdge(), receipts: [] });
  assert.notEqual(unhealthy.status, "clear");
  assert.equal(unhealthy.summary.health, "unhealthy");
});

// --- shape sanity -----------------------------------------------------------

test("packet exposes the canonical converged shape", () => {
  const model = deriveWorkspaceAuthorityIntelligence({ metadataStore: {}, receipts: [] });
  for (const key of ["kind", "version", "status", "health", "agentContext", "governance", "summary", "nextActions", "generatedFrom"]) {
    assert.ok(key in model, `packet missing "${key}"`);
  }
  assert.equal(model.generatedFrom.sourceRecords, true);
  assert.equal(typeof model.generatedFrom.metadataGraph, "boolean");
  assert.equal(typeof model.generatedFrom.receipts, "boolean");
});
