/**
 * Unit tests for deriveBlastRadius — the TRANSITIVE reverse-dependency closure
 * over the workspace metadata graph. Proves it reaches nodes the shipped
 * single-hop `findDependents` / `selectImpactedNodes` cannot (e.g. the
 * dashboard that contains the widget that uses the changed field), terminates
 * on cycles, orders deterministically, and truncates honestly.
 *
 * Run with:  node --test scripts/unit-workspace-metadata-impact.test.mjs
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

const { deriveBlastRadius, BLAST_RADIUS_KIND } = await import(
  pathToFileURL(path.join(kitLib, "workspace-metadata-impact.js")).href
);
const { findDependents } = await import(
  pathToFileURL(path.join(kitLib, "workspace-metadata-graph.js")).href
);

// A hand-built graph envelope mirroring the real edge taxonomy:
//   dashboard --containsWidget--> widget --usesField--> field
//   widget --bindsToObject--> object ; field belongs to object
// Changing the FIELD must reach the widget (1 hop) AND the dashboard (2 hops).
function fixtureGraph() {
  const node = (id, type, label) => ({ id, type, label, summary: { label }, metadataId: id });
  const edge = (from, fromType, to, toType, relation) => ({
    id: `${from}::${relation}::${to}`, from, fromType, to, toType, relation
  });
  return {
    kind: "growthub-workspace-metadata-graph-v1",
    version: 1,
    nodes: [
      node("obj-customers", "dataModelObject", "Customers"),
      node("fld-email", "field", "email"),
      node("wgt-table", "widget", "Customer Table"),
      node("wgt-chart", "widget", "Signups Chart"),
      node("dsh-overview", "dashboard", "Overview"),
    ],
    edges: [
      edge("wgt-table", "widget", "obj-customers", "dataModelObject", "bindsToObject"),
      edge("wgt-table", "widget", "fld-email", "field", "usesField"),
      edge("wgt-chart", "widget", "fld-email", "field", "filteredByField"),
      edge("dsh-overview", "dashboard", "wgt-table", "widget", "containsWidget"),
      edge("dsh-overview", "dashboard", "wgt-chart", "widget", "containsWidget"),
    ],
    warnings: [],
  };
}

test("transitive closure reaches the dashboard that single-hop misses", () => {
  const graph = fixtureGraph();

  // Baseline: the shipped single-hop primitive only sees the two widgets.
  const oneHop = findDependents(graph, "fld-email").map((d) => d.node.id).sort();
  assert.deepEqual(oneHop, ["wgt-chart", "wgt-table"]);

  // Blast radius: the two widgets AND the dashboard that contains them.
  const result = deriveBlastRadius(graph, "fld-email");
  assert.equal(result.kind, BLAST_RADIUS_KIND);
  assert.equal(result.total, 3);
  const ids = result.impacted.map((n) => n.id).sort();
  assert.deepEqual(ids, ["dsh-overview", "wgt-chart", "wgt-table"]);
  assert.deepEqual(result.byType, { dashboard: 1, widget: 2 });
});

test("hop distance + viaRelation are recorded, nearest-first ordering", () => {
  const result = deriveBlastRadius(fixtureGraph(), "fld-email");
  const byId = Object.fromEntries(result.impacted.map((n) => [n.id, n]));
  assert.equal(byId["wgt-table"].distance, 1);
  assert.equal(byId["wgt-chart"].distance, 1);
  assert.equal(byId["dsh-overview"].distance, 2);
  assert.equal(byId["wgt-table"].viaRelation, "usesField");
  assert.equal(byId["dsh-overview"].viaRelation, "containsWidget");
  // distances are non-decreasing across the ordered list
  const distances = result.impacted.map((n) => n.distance);
  assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
  assert.equal(result.maxDistanceReached, 2);
});

test("output is deterministic across repeated calls", () => {
  const a = deriveBlastRadius(fixtureGraph(), "fld-email");
  const b = deriveBlastRadius(fixtureGraph(), "fld-email");
  assert.deepEqual(a.impacted, b.impacted);
  assert.equal(a.summary, b.summary);
});

test("a cycle terminates and visits each node once", () => {
  const node = (id) => ({ id, type: "widget", label: id, summary: {}, metadataId: id });
  const edge = (from, to) => ({ id: `${from}::r::${to}`, from, to, relation: "r" });
  const graph = {
    nodes: [node("a"), node("b"), node("c")],
    edges: [edge("a", "b"), edge("b", "c"), edge("c", "a")], // c depends on a → cycle
  };
  const result = deriveBlastRadius(graph, "a");
  // a→ who depends on a? c. c→ b. b→ a (already visited). So {c, b}, not infinite.
  assert.equal(result.total, 2);
  assert.deepEqual(result.impacted.map((n) => n.id).sort(), ["b", "c"]);
});

test("leaf node with no dependents → empty, honest summary", () => {
  const result = deriveBlastRadius(fixtureGraph(), "dsh-overview");
  assert.equal(result.total, 0);
  assert.match(result.summary, /no downstream impact/i);
});

test("maxNodes truncates honestly", () => {
  const result = deriveBlastRadius(fixtureGraph(), "fld-email", { maxNodes: 1 });
  assert.equal(result.truncated, true);
  assert.equal(result.total, 1);
});

test("maxDistance bounds the walk to direct dependents", () => {
  const result = deriveBlastRadius(fixtureGraph(), "fld-email", { maxDistance: 1 });
  assert.equal(result.total, 2); // the two widgets, not the dashboard
  assert.equal(result.truncated, false);
  assert.deepEqual(result.impacted.map((n) => n.id).sort(), ["wgt-chart", "wgt-table"]);
});

test("missing / malformed inputs degrade safely", () => {
  assert.equal(deriveBlastRadius(null, "x").total, 0);
  assert.equal(deriveBlastRadius({}, "x").total, 0);
  assert.equal(deriveBlastRadius(fixtureGraph(), "").warnings.length, 1);
  const notFound = deriveBlastRadius(fixtureGraph(), "nope");
  assert.equal(notFound.total, 0);
  assert.match(notFound.warnings[0], /not found/);
});
