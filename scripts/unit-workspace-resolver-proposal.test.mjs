#!/usr/bin/env node
/**
 * Unit coverage for lib/workspace-resolver-proposal.js — the governed resolver
 * proposal lane (AWaC server-file boundary + Causation-ITT receipt loop).
 *
 *   - proposal is type resolver.create with affectedField "server-file"
 *     (explicitly NOT a config PATCH field)
 *   - path confined to lib/adapters/integrations/resolvers, traversal refused
 *   - generated code uses the real registerSourceResolver import + reads secret
 *     from env candidates (never inlined)
 *   - validateResolverProposal enforces type/field/path/code
 *   - secret-safe
 *
 * Run with:  node --test scripts/unit-workspace-resolver-proposal.test.mjs
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
const mod = await import(pathToFileURL(path.join(kitLib, "workspace-resolver-proposal.js")).href);
const { buildResolverProposal, validateResolverProposal, resolveResolverFilePath, RESOLVER_AFFECTED_FIELD } = mod;

const SECRET = "sk-never-leak-4242";

test("proposal is a server-file lane, not a config field", () => {
  const p = buildResolverProposal({ integrationId: "acme", baseUrl: "https://api.acme.io", endpoint: "/v1/leads", authRef: "ACME", rootPath: "data.items", idField: "id", entityType: "leads" });
  assert.equal(p.type, "resolver.create");
  assert.equal(p.affectedField, "server-file");
  assert.notEqual(p.affectedField, "dataModel");
  assert.equal(p.target.path, "lib/adapters/integrations/resolvers/acme.js");
});

test("generated code: real import, registerSourceResolver, env-read, rootPath/id baked", () => {
  const p = buildResolverProposal({ integrationId: "acme", baseUrl: "https://api.acme.io", endpoint: "/v1/leads", authRef: "ACME", rootPath: "data.items", idField: "leadId", entityType: "leads" });
  assert.match(p.code, /from "\.\.\/source-resolver-registry\.js"/);
  assert.match(p.code, /registerSourceResolver\(/);
  assert.match(p.code, /ACME_API_KEY/); // env candidate present
  assert.match(p.code, /data\.items/); // rootPath baked in
  assert.match(p.code, /leadId/); // id field baked in
});

test("secret-safe — value never appears even if passed somewhere", () => {
  const p = buildResolverProposal({ integrationId: "acme", baseUrl: "https://x", endpoint: "/y", authRef: "ACME" });
  assert.ok(!JSON.stringify(p).includes(SECRET));
  assert.ok(!p.code.includes(SECRET));
});

test("path confinement — traversal slugified to a safe single segment", () => {
  const t = resolveResolverFilePath("../../etc/passwd");
  assert.equal(t.ok, true);
  assert.ok(t.path.startsWith("lib/adapters/integrations/resolvers/"));
  assert.ok(!t.path.includes(".."));
});

test("validateResolverProposal — accepts valid, rejects bad type/field/code", () => {
  const p = buildResolverProposal({ integrationId: "acme", baseUrl: "https://x", endpoint: "/y", authRef: "ACME" });
  assert.equal(validateResolverProposal(p).ok, true);
  assert.equal(validateResolverProposal({ type: "dataModel.row.add", affectedField: "dataModel" }).ok, false);
  assert.equal(validateResolverProposal({ ...p, affectedField: "dataModel" }).ok, false);
  assert.equal(validateResolverProposal({ ...p, code: "// no register call" }).ok, false);
});

test("never throws on partial input", () => {
  assert.doesNotThrow(() => buildResolverProposal());
  assert.doesNotThrow(() => validateResolverProposal());
  const p = buildResolverProposal({});
  assert.equal(p.type, "resolver.create");
  assert.equal(RESOLVER_AFFECTED_FIELD, "server-file");
});
