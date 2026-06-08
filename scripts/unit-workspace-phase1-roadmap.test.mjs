#!/usr/bin/env node
/**
 * Phase 1 roadmap unit tests — env key catalog + governed delete lifecycle.
 *
 * Run: node --test scripts/unit-workspace-phase1-roadmap.test.mjs
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

const envCatalog = await import(pathToFileURL(path.join(kitLib, "env-key-catalog.js")).href);
const lifecycle = await import(pathToFileURL(path.join(kitLib, "workspace-lifecycle.js")).href);

const baseConfig = {
  integrations: [
    {
      sourceType: "custom-api-webhooks",
      endpointRef: "LEADSHARK",
      hasSecret: true,
      kind: "api",
    },
  ],
  dataModel: {
    objects: [
      {
        id: "api-reg",
        objectType: "api-registry",
        label: "API Registry",
        rows: [{ integrationId: "growthub-smoke", authRef: "LEADSHARK", Name: "Smoke" }],
      },
      {
        id: "sandbox-1",
        objectType: "sandbox-environment",
        label: "Sandbox",
        rows: [{ Name: "my-workflow", envRefs: "LEADSHARK", schedulerRegistryId: "growthub-smoke" }],
      },
      {
        id: "nav-folders",
        objectType: "custom",
        rows: [{
          id: "builder",
          name: "Builder",
          items: [{ type: "workflow", objectId: "sandbox-1", rowId: "my-workflow", label: "My Workflow" }],
        }],
      },
    ],
  },
};

test("env-key-catalog merges config and in-use slugs", () => {
  const prev = process.env.LEADSHARK;
  process.env.LEADSHARK = "test-secret";
  try {
    const { refs } = envCatalog.buildEnvKeyCatalog(baseConfig);
    const lead = refs.find((r) => r.endpointRef === "LEADSHARK");
    assert.ok(lead, "LEADSHARK should appear");
    assert.equal(lead.configured, true);
    assert.equal(lead.source, "config");
    assert.ok(!JSON.stringify(refs).includes("test-secret"), "must not leak values");
  } finally {
    if (prev === undefined) delete process.env.LEADSHARK;
    else process.env.LEADSHARK = prev;
  }
});

test("envKeyCandidates produces expected variants", () => {
  const candidates = envCatalog.envKeyCandidates("leadshark");
  assert.ok(candidates.includes("LEADSHARK"));
  assert.ok(candidates.includes("LEADSHARK_API_KEY"));
});

test("computeDeleteImpact finds FK and nav impacts", () => {
  const table = {
    objectType: "sandbox-environment",
    objectId: "sandbox-1",
    label: "Sandbox",
    mutable: true,
    rows: [{ Name: "my-workflow", envRefs: "LEADSHARK" }],
  };
  const impact = lifecycle.computeDeleteImpact(baseConfig, table, [0]);
  assert.equal(impact.navImpacts.length, 1);
  assert.equal(impact.sidecarKeys.length, 1);
  assert.match(impact.sidecarKeys[0], /^sandbox:sandbox-1:/);
});

test("applyDeleteCascade prunes nav-folders workflow shortcuts", () => {
  const table = {
    objectType: "sandbox-environment",
    objectId: "sandbox-1",
    rows: [{ Name: "my-workflow" }],
  };
  const impact = lifecycle.computeDeleteImpact(baseConfig, table, [0]);
  const next = lifecycle.applyDeleteCascade(baseConfig, impact);
  const nav = next.dataModel.objects.find((o) => o.id === "nav-folders");
  const items = nav.rows[0].items || [];
  assert.equal(items.filter((i) => i.type === "workflow").length, 0);
});
