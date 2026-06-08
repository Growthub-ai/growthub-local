#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kitWorkspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace"
);

const { buildEnvKeyCatalog, isEnvRefResolved } = await import(
  pathToFileURL(path.join(kitWorkspace, "lib/workspace-env-catalog.js")).href
);
const { computeRowDeleteImpact, deleteTableRowWithCascade } = await import(
  pathToFileURL(path.join(kitWorkspace, "lib/workspace-lifecycle.js")).href
);

process.env.PROBE_TEST_KEY = "probe-secret";

const workspaceConfig = {
  integrations: [
    {
      sourceType: "custom-api-webhooks",
      endpointRef: "LEADSHARK",
      hasSecret: true,
      kind: "api"
    }
  ],
  dataModel: {
    objects: [
      {
        id: "sandbox-environments",
        objectType: "sandbox-environment",
        rows: [{ Name: "wf-1", envRefs: "LEADSHARK,MISSING_KEY" }]
      },
      {
        id: "workflow-api-registry",
        objectType: "api-registry",
        rows: [{ integrationId: "probe-api", authRef: "PROBE_TEST_KEY" }]
      }
    ]
  }
};

const catalog = buildEnvKeyCatalog(workspaceConfig);
assert.ok(catalog.refs.some((ref) => ref.endpointRef === "LEADSHARK"), "config slug present");
assert.ok(catalog.refs.some((ref) => ref.endpointRef === "PROBE_TEST_KEY"), "process env slug discovered");
assert.equal(isEnvRefResolved("PROBE_TEST_KEY"), true);

const table = {
  objectType: "sandbox-environment",
  objectId: "sandbox-environments",
  storage: "manual-object",
  mutable: true,
  rows: workspaceConfig.dataModel.objects[0].rows,
  columns: ["Name", "envRefs"]
};
const impact = computeRowDeleteImpact(workspaceConfig, table, 0);
assert.ok(impact.sidecarKeys.includes("sandbox:sandbox-environments:wf-1"));

const deleted = deleteTableRowWithCascade(workspaceConfig, table, 0);
assert.equal(deleted.workspaceConfig.dataModel.objects[0].rows.length, 0);

console.log("unit-workspace-env-catalog: ok");
