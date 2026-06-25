/**
 * Unit tests for the V1 derivation twins that compound on `deriveBlastRadius`:
 *
 *   - deriveStaleSurfaces     (workspace-stale-surfaces.js)
 *   - deriveWorkflowImpact    (workspace-workflow-impact.js)
 *   - deriveProvenanceLineage (workspace-provenance-lineage.js)
 *
 * Each is a PURE deriver over the read-only metadata graph — no new graph, no
 * mutation, no secrets — that reuses the shipped spine. These tests prove the
 * causal semantics on a binding-rich fixture (the shape real workspaces grow
 * into) and the honest-empty behaviour on a sparse/seed graph.
 *
 * Run with:  node --test scripts/unit-workspace-derivations.test.mjs
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

const load = (file) => import(pathToFileURL(path.join(kitLib, file)).href);
const { deriveStaleSurfaces } = await load("workspace-stale-surfaces.js");
const { deriveWorkflowImpact } = await load("workspace-workflow-impact.js");
const { deriveProvenanceLineage } = await load("workspace-provenance-lineage.js");

const T_OLD = "2026-06-01T00:00:00.000Z";
const T_NEW = "2026-06-20T00:00:00.000Z";

/**
 * Fixture mirroring the real edge taxonomy with a fresh upstream refetch:
 *   sourceRecord(fetchedAt=NEW) <-backedBySourceRecord- object
 *   object <-bindsToObject- widget <-containsWidget- dashboard
 *   object <-readsObject- workflowNode <-containsNode- workflow
 *   run(ranAt=NEW) -executedWorkflow-> workflow ; run -producedArtifact-> artifact(promotable)
 */
function fixture() {
  const node = (id, type, label, summary = {}) => ({ id, type, label, summary: { label, ...summary }, metadataId: id });
  const edge = (from, to, relation) => ({ id: `${from}::${relation}::${to}`, from, to, relation });
  return {
    kind: "growthub-workspace-metadata-graph-v1",
    version: 1,
    warnings: [],
    nodes: [
      node("src", "sourceRecord", "Stripe", { fetchedAt: T_NEW }),
      node("obj", "dataModelObject", "Customers"),
      node("fld", "field", "mrr"),
      node("wgt", "widget", "MRR Chart"),
      node("dsh", "dashboard", "Overview"),
      node("wf", "workflow", "Sync"),
      node("wfn", "workflowNode", "read customers"),
      node("run", "run", "run-1", { ranAt: T_NEW }),
      node("art", "outputArtifact", "report.csv", { promotable: true }),
    ],
    edges: [
      edge("obj", "src", "backedBySourceRecord"),
      edge("wgt", "obj", "bindsToObject"),
      edge("wgt", "fld", "usesField"),
      edge("dsh", "wgt", "containsWidget"),
      edge("wf", "wfn", "containsNode"),
      edge("wfn", "obj", "readsObject"),
      edge("run", "wf", "executedWorkflow"),
      edge("run", "art", "producedArtifact"),
    ],
  };
}

// ── deriveStaleSurfaces ────────────────────────────────────────────────────

test("deriveStaleSurfaces: a fresh source refetch marks its whole reverse closure stale", () => {
  const out = deriveStaleSurfaces(fixture(), { since: T_OLD });
  assert.equal(out.kind, "growthub-workspace-stale-surfaces-v1");
  const ids = out.staleSurfaces.map((s) => s.id).sort();
  // src (fetchedAt) + run (ranAt) are seeds; their dependents go stale.
  assert.deepEqual(ids, ["dsh", "obj", "wf", "wfn", "wgt"]);
  assert.equal(out.byType.dashboard, 1);
  assert.equal(out.byType.widget, 1);
});

test("deriveStaleSurfaces: seedIds is the preflight entry point (no timestamps needed)", () => {
  const out = deriveStaleSurfaces(fixture(), { seedIds: ["obj"] });
  // Everything that depends on the object the PATCH touched.
  const ids = out.staleSurfaces.map((s) => s.id).sort();
  assert.ok(ids.includes("wgt"));
  assert.ok(ids.includes("dsh"));
  assert.equal(out.seeds[0].id, "obj");
});

test("deriveStaleSurfaces: a node fresher than the seed is NOT reported stale", () => {
  const g = fixture();
  // Make the widget fresher than the source change → it is not stale.
  g.nodes.find((n) => n.id === "wgt").summary.ranAt = "2026-06-25T00:00:00.000Z";
  const out = deriveStaleSurfaces(g, { since: T_OLD });
  assert.ok(!out.staleSurfaces.some((s) => s.id === "wgt"));
});

test("deriveStaleSurfaces: no recent change → honest empty", () => {
  const out = deriveStaleSurfaces(fixture(), { since: "2027-01-01T00:00:00.000Z" });
  assert.equal(out.total, 0);
  assert.match(out.summary, /nothing is stale|No recently-changed/);
});

test("deriveStaleSurfaces: malformed graph never throws", () => {
  assert.equal(deriveStaleSurfaces(null).total, 0);
  assert.equal(deriveStaleSurfaces({}).warnings.length, 1);
});

// ── deriveWorkflowImpact ───────────────────────────────────────────────────

test("deriveWorkflowImpact: a step change rolls up to runs and promotable deliverables", () => {
  const out = deriveWorkflowImpact(fixture(), "wfn");
  assert.equal(out.kind, "growthub-workspace-workflow-impact-v1");
  assert.equal(out.affectedWorkflows.length, 1);
  assert.equal(out.affectedRuns.length, 1);
  assert.equal(out.staleDeliverables.length, 1);
  assert.equal(out.staleDeliverables[0].id, "art");
  assert.equal(out.staleDeliverables[0].promotable, true);
  assert.equal(out.promotableAtRisk, 1);
});

test("deriveWorkflowImpact: a node with no outcome dependents is honest", () => {
  const out = deriveWorkflowImpact(fixture(), "fld");
  // a field feeds a widget/dashboard but no run/deliverable.
  assert.equal(out.affectedRuns.length, 0);
  assert.equal(out.staleDeliverables.length, 0);
  assert.match(out.summary, /no workflow, run, or deliverable|has no outcome-level impact/);
});

test("deriveWorkflowImpact: unknown origin never throws", () => {
  const out = deriveWorkflowImpact(fixture(), "does-not-exist");
  assert.equal(out.total, 0);
  assert.equal(out.warnings.length, 1);
});

// ── deriveProvenanceLineage ────────────────────────────────────────────────

test("deriveProvenanceLineage: dependencies of an artifact reach the run that produced it", () => {
  // art -> run via producedArtifact reversed? edge is run->art, so art's
  // OUTGOING (dependencies) is empty; run is art's dependent (incoming).
  const out = deriveProvenanceLineage(fixture(), "art", { direction: "dependents" });
  assert.equal(out.kind, "growthub-workspace-provenance-lineage-v1");
  assert.deepEqual(out.dependents.map((a) => a.id), ["run"]);
  // alias preserved for backward compat
  assert.deepEqual(out.ancestors, out.dependents);
});

test("deriveProvenanceLineage: dependencies of a run reach the full transitive chain it touched", () => {
  const out = deriveProvenanceLineage(fixture(), "run", { direction: "dependencies" });
  const ids = out.dependencies.map((d) => d.id).sort();
  // run -> wf -> wfn -> obj -> src, and run -> art. Transitive, not one-hop.
  assert.deepEqual(ids, ["art", "obj", "src", "wf", "wfn"]);
  assert.equal(out.dependencies[0].distance, 1);
  assert.deepEqual(out.descendants, out.dependencies); // alias
});

test("deriveProvenanceLineage: a widget that uses an object is the object's DEPENDENT, not its ancestor", () => {
  // The naming-safety case the review flagged: a consumer must never read as
  // an "ancestor" of the thing it consumes.
  const out = deriveProvenanceLineage(fixture(), "obj");
  // object's dependents (incoming) = the widget/workflow node that USE it.
  assert.ok(out.dependents.some((n) => n.id === "wgt"));
  // object's dependencies (outgoing) = the source it is backed by.
  assert.ok(out.dependencies.some((n) => n.id === "src"));
  // the widget is NOT in the object's dependencies (it does not depend ON the widget).
  assert.ok(!out.dependencies.some((n) => n.id === "wgt"));
});

test("deriveProvenanceLineage: legacy direction aliases still resolve", () => {
  const viaLegacy = deriveProvenanceLineage(fixture(), "obj", { direction: "ancestors" });
  const viaCanonical = deriveProvenanceLineage(fixture(), "obj", { direction: "dependents" });
  assert.deepEqual(viaLegacy.dependents.map((n) => n.id), viaCanonical.dependents.map((n) => n.id));
});

test("deriveProvenanceLineage: cycle terminates", () => {
  const g = fixture();
  g.edges.push({ id: "src::cycle::run", from: "src", to: "run", relation: "cycle" });
  g.edges.push({ id: "run::cycle::src", from: "run", to: "src", relation: "cycle" });
  const out = deriveProvenanceLineage(g, "run");
  assert.ok(out.descendants.length > 0); // returns, does not hang
});
