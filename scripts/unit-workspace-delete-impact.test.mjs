#!/usr/bin/env node
/**
 * Unit coverage for Governed Delete Impact V1 — roadmap Phase 1.4 / 2.6.
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install).
 *
 *   - api-registry delete surfaces data-source/sandbox FK references
 *   - sandbox-environment delete predicts sidecar run-history keys + nav shortcuts
 *   - data-source delete surfaces widget bindings + sourceId sidecar key
 *   - sidecar narrowing when the live map is provided
 *   - never throws on partial / empty input
 *
 * Run with:  node --test scripts/unit-workspace-delete-impact.test.mjs
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

const { computeDeleteImpact, sandboxRunSourceId } = await import(
  pathToFileURL(path.join(kitLib, "workspace-delete-impact.js")).href
);

const config = {
  dataModel: {
    objects: [
      {
        id: "apis",
        objectType: "api-registry",
        rows: [{ id: "r1", integrationId: "leadshark", Name: "LeadShark" }],
      },
      {
        id: "sources",
        objectType: "data-source",
        rows: [
          { id: "s1", registryId: "leadshark", sourceId: "src:leads" },
          { id: "s2", registryId: "other" },
        ],
      },
      {
        id: "flows",
        objectType: "sandbox-environment",
        rows: [{ id: "w1", Name: "Nightly Sync", schedulerRegistryId: "leadshark", lastSourceId: "sandbox:flows:nightly-sync" }],
      },
      {
        id: "nav-folders",
        objectType: "helper-threads",
        rows: [{ id: "n1", type: "view", workflowObjectId: "flows", workflowRowId: "w1" }],
      },
    ],
  },
  canvas: {
    widgets: [
      { id: "wgt1", title: "Leads table", config: { binding: { objectId: "sources" } } },
      { id: "wgt2", title: "Unrelated", config: { binding: { objectId: "elsewhere" } } },
    ],
  },
};

test("delete-impact — public API exports", () => {
  assert.equal(typeof computeDeleteImpact, "function");
  assert.equal(typeof sandboxRunSourceId, "function");
});

test("sandboxRunSourceId — stable slug key", () => {
  assert.equal(sandboxRunSourceId("flows", "Nightly Sync"), "sandbox:flows:nightly-sync");
  assert.equal(sandboxRunSourceId("", "x"), null);
  assert.equal(sandboxRunSourceId("flows", ""), null);
});

test("api-registry delete — surfaces data-source + sandbox FK references", () => {
  const impact = computeDeleteImpact(config, {}, { kind: "object", objectId: "apis" });
  assert.equal(impact.target.objectType, "api-registry");
  const fields = impact.references.map((r) => r.field).sort();
  assert.ok(fields.includes("registryId"));
  assert.ok(fields.includes("schedulerRegistryId"));
  // s2 (registryId: "other") must NOT be flagged
  const values = impact.references.map((r) => r.value);
  assert.ok(values.every((v) => v === "leadshark"));
  assert.equal(impact.summary.references, 2);
});

test("sandbox-environment delete — predicts sidecar keys + nav shortcut", () => {
  const impact = computeDeleteImpact(config, {}, { kind: "object", objectId: "flows" });
  assert.ok(impact.sidecarKeys.includes("sandbox:flows:nightly-sync"));
  const navRefs = impact.references.filter((r) => r.kind === "nav-shortcut");
  assert.equal(navRefs.length, 1);
});

test("data-source delete — surfaces widget binding + sourceId sidecar key", () => {
  const impact = computeDeleteImpact(config, {}, { kind: "object", objectId: "sources" });
  const widgetRefs = impact.references.filter((r) => r.kind === "widget-binding");
  assert.equal(widgetRefs.length, 1);
  assert.equal(widgetRefs[0].fromObjectLabel, "Leads table");
  assert.ok(impact.sidecarKeys.includes("src:leads"));
});

test("row delete — scopes to a single row", () => {
  const row = config.dataModel.objects[2].rows[0];
  const impact = computeDeleteImpact(config, {}, { kind: "row", objectId: "flows", objectType: "sandbox-environment", row });
  assert.equal(impact.target.kind, "row");
  assert.ok(impact.sidecarKeys.includes("sandbox:flows:nightly-sync"));
});

test("sidecar narrowing — only keys present in the live map survive", () => {
  const live = { "sandbox:flows:nightly-sync": { records: [] } };
  const impact = computeDeleteImpact(config, live, { kind: "object", objectId: "flows" });
  // lastSourceId duplicates the computed key here; src not present is dropped
  assert.deepEqual(impact.sidecarKeys, ["sandbox:flows:nightly-sync"]);
});

test("delete-impact — never throws on partial/empty input", () => {
  assert.doesNotThrow(() => computeDeleteImpact(undefined, undefined, undefined));
  assert.doesNotThrow(() => computeDeleteImpact({}, {}, { kind: "object", objectId: "nope" }));
  const empty = computeDeleteImpact(null, null, null);
  assert.equal(empty.summary.references, 0);
  assert.equal(empty.summary.sidecarKeys, 0);
});
