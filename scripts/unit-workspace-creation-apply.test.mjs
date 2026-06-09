#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kitLib = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const proposals = await import(pathToFileURL(path.join(kitLib, "workspace-creation-proposals.js")).href);
const applyMod = await import(pathToFileURL(path.join(kitLib, "workspace-creation-apply.js")).href);

const { buildCreationProposalBundle } = proposals;
const { applyCreationBundle } = applyMod;

test("applyCreationBundle merges api registry row into config", async () => {
  const bundle = buildCreationProposalBundle({
    name: "Probe API",
    integrationId: "probe-api",
    baseUrl: "https://example.com",
    endpoint: "/v1",
    authMode: "none",
    outputMode: "raw-response",
    skipTest: true,
    testPassed: true,
  }, {});
  const config = { dataModel: { objects: [] } };
  const result = await applyCreationBundle(config, bundle, { skipFileWrites: true });
  assert.ok(result.applied.length >= 1);
  const apiObject = result.config.dataModel.objects.find((o) => o.objectType === "api-registry");
  assert.ok(apiObject);
  assert.ok((apiObject.rows || []).some((r) => r.integrationId === "probe-api"));
});
