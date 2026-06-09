#!/usr/bin/env node
/**
 * Unit coverage for lib/api-response-profile.js — the cockpit "Shape" engine
 * (response profiler + resolver recommendation).
 *
 * Run with:  node --test scripts/unit-api-response-profile.test.mjs
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
const mod = await import(pathToFileURL(path.join(kitLib, "api-response-profile.js")).href);
const { profileApiResponse, recommendResolver } = mod;

test("top-level array → usable, no path, resolver optional", () => {
  const resp = JSON.stringify([{ id: 1, name: "A", email: "a@x.com" }, { id: 2, name: "B" }]);
  const p = profileApiResponse(resp);
  assert.equal(p.parsed, true);
  assert.equal(p.usable, true);
  assert.equal(p.arrayPath, "");
  assert.equal(p.recordCount, 2);
  assert.equal(p.candidates.id, "id");
  assert.equal(p.candidates.name, "name");
  assert.equal(p.candidates.email, "email");
  const rec = recommendResolver(p);
  assert.equal(rec.mode, "none");
  assert.equal(rec.level, "optional");
});

test("nested array under data.items → recommended, rootPath", () => {
  const resp = JSON.stringify({ data: { items: [{ id: "x", title: "T", created_at: "2026-01-01" }] } });
  const p = profileApiResponse(resp);
  assert.equal(p.arrayPath, "data.items");
  assert.equal(p.recordCount, 1);
  assert.equal(p.suggestedEntityType, "items");
  assert.equal(p.candidates.timestamp, "created_at");
  const rec = recommendResolver(p);
  assert.equal(rec.level, "recommended");
  assert.equal(rec.rootPath, "data.items");
});

test("known container key 'results' detected at top", () => {
  const resp = JSON.stringify({ results: [{ id: 1 }], count: 1 });
  const p = profileApiResponse(resp);
  assert.equal(p.arrayPath, "results");
  const rec = recommendResolver(p);
  assert.equal(rec.mode, "template");
});

test("pagination present → resolver required", () => {
  const resp = JSON.stringify({ data: [{ id: 1 }], next_cursor: "abc" });
  const p = profileApiResponse(resp);
  assert.equal(p.hasPagination, true);
  const rec = recommendResolver(p);
  assert.equal(rec.level, "required");
  assert.equal(rec.mode, "custom");
});

test("single object response → one row, entityType record", () => {
  const resp = JSON.stringify({ id: "u1", name: "Solo", company: "Acme" });
  const p = profileApiResponse(resp);
  assert.equal(p.recordCount, 1);
  assert.equal(p.suggestedEntityType, "record");
  assert.equal(p.candidates.company, "company");
});

test("unparseable response → required, not usable", () => {
  const p = profileApiResponse("<html>not json</html>");
  assert.equal(p.parsed, false);
  assert.equal(p.usable, false);
  const rec = recommendResolver(p);
  assert.equal(rec.level, "required");
});

test("accepts already-parsed object + never throws on junk", () => {
  assert.doesNotThrow(() => profileApiResponse(undefined));
  assert.doesNotThrow(() => profileApiResponse(null));
  assert.doesNotThrow(() => recommendResolver(undefined));
  const p = profileApiResponse({ items: [{ id: 1 }] });
  assert.equal(p.arrayPath, "items");
});
