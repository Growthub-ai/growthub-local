#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildEnvKeyCatalog, envKeyCandidates, isEnvRefResolved } from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/env-key-catalog.js";
import { deleteTableRowsWithCascade, previewDeleteRowsImpact } from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-lifecycle.js";

function testEnvKeyCandidates() {
  const candidates = envKeyCandidates("LEADSHARK");
  assert.ok(candidates.includes("LEADSHARK"));
  assert.ok(candidates.includes("LEADSHARK_API_KEY"));
}

function testBuildCatalogMergesConfigAndEnv() {
  const catalog = buildEnvKeyCatalog({
    integrations: [{
      sourceType: "custom-api-webhooks",
      endpointRef: "LEADSHARK",
      kind: "api",
      hasSecret: true
    }],
    dataModel: { objects: [] }
  }, { LEADSHARK: "secret-value" });
  const lead = catalog.refs.find((ref) => ref.endpointRef === "LEADSHARK");
  assert.ok(lead);
  assert.equal(lead.source, "config");
  assert.equal(lead.resolved, true);
}

function testDeleteImpactAndCascade() {
  const workspaceConfig = {
    canvas: { widgets: [] },
    dataModel: {
      objects: [
        {
          id: "api-registry",
          objectType: "api-registry",
          rows: [{ integrationId: "leadshark", authRef: "LEADSHARK" }]
        },
        {
          id: "sandbox",
          objectType: "sandbox-environment",
          rows: [{ Name: "wf-1", schedulerRegistryId: "leadshark", envRefs: "LEADSHARK" }]
        },
        {
          id: "nav-folders",
          rows: [{
            id: "folder-1",
            items: [{ id: "wf-item", type: "workflow", objectId: "sandbox", rowId: "wf-1", label: "WF" }]
          }]
        }
      ]
    }
  };
  const table = {
    mutable: true,
    storage: "manual-object",
    objectId: "sandbox",
    objectType: "sandbox-environment",
    source: "Sandboxes",
    rows: workspaceConfig.dataModel.objects[1].rows
  };
  const impact = previewDeleteRowsImpact(workspaceConfig, table, [0]);
  assert.ok(impact.impacts.some((item) => item.kind === "nav-workflow"));
  assert.ok(impact.sidecarKeys.some((key) => key.startsWith("sandbox:sandbox:")));

  const next = deleteTableRowsWithCascade(workspaceConfig, table, [0]);
  const sandboxRows = next.dataModel.objects.find((o) => o.id === "sandbox").rows;
  assert.equal(sandboxRows.length, 0);
  const navItems = next.dataModel.objects.find((o) => o.id === "nav-folders").rows[0].items;
  assert.equal(navItems.length, 0);
}

testEnvKeyCandidates();
testBuildCatalogMergesConfigAndEnv();
testDeleteImpactAndCascade();
console.log("unit-env-key-catalog: ok");
