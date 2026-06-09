#!/usr/bin/env node
/**
 * Unit coverage for workspace-creation-proposals.js
 * Run: node --test scripts/unit-workspace-creation-proposals.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");

const mod = await import(pathToFileURL(path.join(kitLib, "workspace-creation-proposals.js")).href);

test("validateResolverTargetPath refuses traversal and outside directory", () => {
  assert.equal(mod.validateResolverTargetPath("../evil.js").ok, false);
  assert.equal(mod.validateResolverTargetPath("lib/adapters/integrations/resolvers/ok.js").ok, true);
  assert.equal(mod.validateResolverTargetPath("lib/other/foo.js").ok, false);
});

test("buildCreationProposalBundle never includes secret values", () => {
  const bundle = mod.buildCreationProposalBundle({
    name: "LeadShark",
    integrationId: "leadshark",
    baseUrl: "https://api.example.com",
    endpoint: "/v1/leads",
    method: "GET",
    authRef: "leadshark",
    authMode: "api-key-header",
    outputMode: "data-source",
    includeResolver: true,
  }, { env: { LEADSHARK_API_KEY: "super-secret" } });
  const json = JSON.stringify(bundle);
  assert.ok(!json.includes("super-secret"));
  assert.ok(bundle.proposals.some((p) => p.type === "creation.api-registry-row"));
  assert.ok(bundle.proposals.some((p) => p.type === "creation.resolver-file"));
  assert.ok(bundle.proposals.some((p) => p.type === "creation.data-source-row"));
});

test("validateCreationDraft catches incomplete drafts", () => {
  const v = mod.validateCreationDraft({ name: "" });
  assert.equal(v.ok, false);
  assert.ok(v.errors.length > 0);
});
