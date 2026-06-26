/**
 * Unit tests for derivePatchImpact — the authoritative current-vs-merged patch
 * impact deriver. Proves added/modified AND (critically) REMOVED objects/
 * dashboards are reported with their downstream, so deleting a business surface
 * never silently returns "no impact".
 *
 * Run with:  node --test scripts/unit-workspace-patch-impact.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const { derivePatchImpact } = await import(pathToFileURL(path.join(kitLib, "workspace-patch-impact.js")).href);

// Graph nodes mirror buildWorkspaceMetadataGraph: objects carry summary.objectId.
const objNode = (oid) => ({ id: `object:${oid}`, type: "dataModelObject", label: oid, summary: { label: oid, objectId: oid }, metadataId: `object:${oid}` });
const wgtNode = (id, label) => ({ id, type: "widget", label, summary: { label }, metadataId: id });
const edge = (from, to, relation) => ({ id: `${from}::${relation}::${to}`, from, to, relation });
const cfg = (objIds) => ({ dataModel: { objects: objIds.map((id) => ({ id, label: id, rows: [] })) } });

test("derivePatchImpact: an ADDED object is reported as changed", () => {
  const current = { nodes: [objNode("a")], edges: [] };
  const merged = { nodes: [objNode("a"), objNode("b")], edges: [] };
  const out = derivePatchImpact(current, merged, cfg(["a"]), cfg(["a", "b"]));
  assert.equal(out.scope, "changed-only");
  assert.ok(out.seeds.some((s) => s.id === "object:b"));
  assert.equal(out.removed.length, 0);
});

test("derivePatchImpact: a MODIFIED object is reported as changed", () => {
  const current = { nodes: [objNode("a")], edges: [] };
  const merged = { nodes: [objNode("a")], edges: [] };
  const curCfg = cfg(["a"]);
  const mergedCfg = { dataModel: { objects: [{ id: "a", label: "a", rows: [], columns: ["new"] }] } }; // a changed
  const out = derivePatchImpact(current, merged, curCfg, mergedCfg);
  assert.ok(out.seeds.some((s) => s.id === "object:a"));
});

test("derivePatchImpact: a REMOVED object is reported with its downstream (the key gap)", () => {
  // current: object b exists and a widget depends on it (widget --bindsToObject--> b)
  const current = {
    nodes: [objNode("a"), objNode("b"), wgtNode("wgt", "B Chart")],
    edges: [edge("wgt", "object:b", "bindsToObject")],
  };
  const merged = { nodes: [objNode("a")], edges: [] }; // b deleted
  const out = derivePatchImpact(current, merged, cfg(["a", "b"]), cfg(["a"]));
  assert.equal(out.removed.length, 1);
  assert.equal(out.removed[0].id, "object:b");
  // the widget that depended on the deleted object is surfaced
  assert.ok(out.removed[0].affected.some((n) => n.id === "wgt"));
  assert.ok(out.removed[0].affectedTotal >= 1);
  assert.ok(out.warnings.length >= 1);
  assert.match(out.summary, /removal/);
});

test("derivePatchImpact: a no-op patch reports nothing", () => {
  const g = { nodes: [objNode("a")], edges: [] };
  const out = derivePatchImpact(g, g, cfg(["a"]), cfg(["a"]));
  assert.equal(out.total, 0);
  assert.equal(out.removed.length, 0);
});

test("derivePatchImpact: malformed merged graph never throws", () => {
  assert.equal(derivePatchImpact(null, null, {}, {}).total, 0);
});
