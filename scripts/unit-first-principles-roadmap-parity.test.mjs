/**
 * First-Principles Roadmap parity gate — freezes the blast-radius grammar
 * that the hosted GH App read model ports (S3 of
 * PRODUCT-ROADMAP-ALIGNMENT-V2-FIRST-PRINCIPLES: `gh-app-hosted-blast-radius-v1`
 * mirrors `growthub-workspace-blast-radius-v1`).
 *
 * The hosted port copies these exact semantics; if any of them change here,
 * this gate fails so the change is made deliberately on BOTH sides:
 *   1. kind + version constants
 *   2. transitive reverse-dependency closure via BFS (shortest path first)
 *   3. deterministic ordering: distance → type → id
 *   4. single-visit cycle termination
 *   5. honest truncation (`truncated: true` + "(truncated)" summary suffix)
 *   6. unknown-origin → null origin + explicit warning, never a fabricated result
 *   7. summary sentence shapes for impact and no-impact
 *
 * Run with:  node --test scripts/unit-first-principles-roadmap-parity.test.mjs
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

const { deriveBlastRadius, BLAST_RADIUS_KIND, BLAST_RADIUS_VERSION, DEFAULT_MAX_NODES } = await import(
  pathToFileURL(path.join(kitLib, "workspace-metadata-impact.js")).href
);

// The exact fixture the hosted port's tests mirror: a package installation
// with a workflow version pinned by a routine exposed by a customer app.
const CHAIN_GRAPH = {
  nodes: [
    { id: "pkg-inst-1", type: "package-installation", label: "CRM add-on", metadataId: "pkg-inst-1" },
    { id: "wfv-report-3", type: "workflow-version", label: "Report v3", metadataId: "wfv-report-3" },
    { id: "routine-weekly", type: "routine", label: "Weekly routine", metadataId: "routine-weekly" },
    { id: "app-portal", type: "customer-app", label: "Customer portal", metadataId: "app-portal" },
  ],
  edges: [
    { from: "wfv-report-3", to: "pkg-inst-1", relation: "requiresPackage" },
    { from: "routine-weekly", to: "wfv-report-3", relation: "pinsVersion" },
    { from: "app-portal", to: "routine-weekly", relation: "exposesCapability" },
  ],
};

test("1. kind and version constants are frozen", () => {
  assert.equal(BLAST_RADIUS_KIND, "growthub-workspace-blast-radius-v1");
  assert.equal(BLAST_RADIUS_VERSION, 1);
  assert.equal(DEFAULT_MAX_NODES, 500);
});

test("2 + 3. transitive closure with BFS distances, ordered distance → type → id", () => {
  const radius = deriveBlastRadius(CHAIN_GRAPH, "pkg-inst-1");
  assert.equal(radius.total, 3);
  assert.deepEqual(
    radius.impacted.map((node) => [node.id, node.distance, node.viaRelation]),
    [
      ["wfv-report-3", 1, "requiresPackage"],
      ["routine-weekly", 2, "pinsVersion"],
      ["app-portal", 3, "exposesCapability"],
    ],
  );
  assert.deepEqual(radius.byType, { "workflow-version": 1, routine: 1, "customer-app": 1 });

  // Determinism: reversed input ordering produces byte-identical output.
  const reversed = deriveBlastRadius(
    { nodes: [...CHAIN_GRAPH.nodes].reverse(), edges: [...CHAIN_GRAPH.edges].reverse() },
    "pkg-inst-1",
  );
  assert.equal(JSON.stringify(reversed), JSON.stringify(radius));
});

test("4 + 5. cycle termination and honest truncation", () => {
  const cyclic = {
    nodes: [
      { id: "a", type: "routine", label: "A", metadataId: "a" },
      { id: "b", type: "routine", label: "B", metadataId: "b" },
      { id: "c", type: "routine", label: "C", metadataId: "c" },
    ],
    edges: [
      { from: "b", to: "a", relation: "pinsVersion" },
      { from: "c", to: "b", relation: "pinsVersion" },
      { from: "a", to: "c", relation: "pinsVersion" },
    ],
  };
  const full = deriveBlastRadius(cyclic, "a");
  assert.equal(full.total, 2);
  assert.equal(full.truncated, false);

  const truncated = deriveBlastRadius(cyclic, "a", { maxNodes: 1 });
  assert.equal(truncated.total, 1);
  assert.equal(truncated.truncated, true);
  assert.match(truncated.summary, /\(truncated\)\.$/);
});

test("6. unknown origin yields null origin + explicit warning, never a fabricated result", () => {
  const radius = deriveBlastRadius(CHAIN_GRAPH, "ghost");
  assert.equal(radius.origin, null);
  assert.deepEqual(radius.warnings, ['origin "ghost" not found in graph']);
  assert.equal(radius.total, 0);
  assert.equal(radius.summary, "No impact computed.");
});

test("7. summary sentence shapes are frozen", () => {
  const impact = deriveBlastRadius(CHAIN_GRAPH, "pkg-inst-1");
  assert.equal(
    impact.summary,
    'Changing "CRM add-on" affects 3 downstream node(s): 1 customer-app, 1 routine, 1 workflow-version.',
  );
  const none = deriveBlastRadius(CHAIN_GRAPH, "app-portal");
  assert.equal(none.summary, 'Changing "Customer portal" has no downstream impact — nothing depends on it.');
});
