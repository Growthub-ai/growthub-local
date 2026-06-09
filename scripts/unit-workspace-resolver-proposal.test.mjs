#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kitLib = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const mod = await import(pathToFileURL(path.join(kitLib, "workspace-resolver-proposal.js")).href);

const { validateResolverTargetPath, buildResolverFileProposal } = mod;

test("validateResolverTargetPath refuses traversal", () => {
  const bad = validateResolverTargetPath("../../../etc/passwd.js");
  assert.equal(bad.ok, false);
});

test("validateResolverTargetPath accepts resolvers dir", () => {
  const ok = validateResolverTargetPath("lib/adapters/integrations/resolvers/leadshark.js");
  assert.equal(ok.ok, true);
});

test("resolver code never inlines secret values", () => {
  const proposal = buildResolverFileProposal({
    integrationId: "leadshark",
    authRef: "leadshark",
    baseUrl: "https://api.example.com",
    endpoint: "/v1",
    secretValue: "must-not-appear",
  });
  assert.equal(proposal.valid, true);
  assert.equal(proposal.code.includes("must-not-appear"), false);
  assert.ok(proposal.code.includes("registerSourceResolver"));
});
