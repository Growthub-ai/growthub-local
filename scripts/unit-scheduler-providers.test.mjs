#!/usr/bin/env node
/**
 * Unit coverage for lib/scheduler-providers.js — the single source of provider
 * capabilities, auth-candidate resolution, and URL normalization (findings 4,5).
 *
 * Run with:  node --test scripts/unit-scheduler-providers.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitLib = path.join(here, "..", "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib");
const {
  PROVIDER_CAPS, normalizeProvider, providerCaps, authCandidates, resolveAuthReadiness,
  normalizeEndpointUrl, endpointUrlsEquivalent,
} = await import(pathToFileURL(path.join(kitLib, "scheduler-providers.js")).href);

test("provider capability matrix is honest: qstash creates schedule, supabase is external", () => {
  assert.equal(providerCaps("qstash-schedule").createsProviderSchedule, true);
  assert.equal(providerCaps("qstash-schedule").schedulingMode, "provider");
  assert.equal(providerCaps("supabase-edge").createsProviderSchedule, false);
  assert.equal(providerCaps("supabase-edge").schedulingMode, "external");
  assert.equal(normalizeProvider("bogus"), "supabase-edge");
});

test("auth candidates: REF, REF_API_KEY, REF_TOKEN (matches server expansion)", () => {
  assert.deepEqual(authCandidates("QSTASH"), ["QSTASH", "QSTASH_API_KEY", "QSTASH_TOKEN"]);
  assert.deepEqual(authCandidates("supabase edge"), ["SUPABASE_EDGE", "SUPABASE_EDGE_API_KEY", "SUPABASE_EDGE_TOKEN"]);
});

test("auth readiness resolves via ANY candidate + reports which (finding 4)", () => {
  assert.equal(resolveAuthReadiness("QSTASH", ["QSTASH_TOKEN"]).configured, true);
  assert.equal(resolveAuthReadiness("QSTASH", ["QSTASH_TOKEN"]).resolvedVia, "QSTASH_TOKEN");
  assert.equal(resolveAuthReadiness("SUPABASE_EDGE", ["SUPABASE_EDGE_API_KEY"]).configured, true);
  assert.equal(resolveAuthReadiness("QSTASH", []).configured, false);
  assert.equal(resolveAuthReadiness("QSTASH", []).resolvedVia, null);
  assert.equal(resolveAuthReadiness("", []).configured, true); // no auth needed
});

test("auth readiness never returns a secret value", () => {
  const r = resolveAuthReadiness("QSTASH", ["QSTASH_TOKEN"]);
  assert.ok(!Object.values(r).some((v) => typeof v === "string" && v.length > 40));
});

test("url normalization: canonical origin+pathname, trailing slash + query stripped", () => {
  assert.equal(normalizeEndpointUrl("https://A.example.com/api/x/"), "https://a.example.com/api/x");
  assert.equal(normalizeEndpointUrl("https://a.example.com/api/x?token=1"), "https://a.example.com/api/x");
  assert.equal(normalizeEndpointUrl("not a url"), "");
  assert.equal(normalizeEndpointUrl(""), "");
});

test("url equivalence is exact (no substring foolery)", () => {
  assert.equal(endpointUrlsEquivalent("https://a.com/x/", "https://a.com/x").equivalent, true);
  assert.equal(endpointUrlsEquivalent("https://a.com/x", "https://a.com/xyz").equivalent, false);
  assert.equal(endpointUrlsEquivalent("https://a.com/x", "https://b.com/x").equivalent, false);
  assert.equal(endpointUrlsEquivalent("bad", "https://a.com/x").bInvalid, false);
  assert.equal(endpointUrlsEquivalent("https://a.com/x", "bad").bInvalid, true);
});

test("PROVIDER_CAPS is frozen + carries default auth refs", () => {
  assert.equal(Object.isFrozen(PROVIDER_CAPS), true);
  assert.equal(providerCaps("qstash-schedule").authRefDefault, "QSTASH");
  assert.equal(providerCaps("supabase-edge").authRefDefault, "SUPABASE_EDGE");
});
