#!/usr/bin/env node
/**
 * Unit coverage for .env.local merge V1 — roadmap Phase 1.3 / 3.3.
 *
 * Standalone — runs against the bundled growthub-custom-workspace-starter-v1
 * sources via node:test (no npm install).
 *
 *   - upserts new keys, replaces existing assignments in place
 *   - preserves comments, blank lines, and untouched entries
 *   - handles `export ` prefix and quotes values that need it
 *   - skips invalid key names and null/undefined values
 *
 * Run with:  node --test scripts/unit-env-local-file.test.mjs
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

const { mergeEnvLocalContent, quoteIfNeeded } = await import(
  pathToFileURL(path.join(kitLib, "env-local-file.js")).href
);

test("merge — appends a new key to empty content", () => {
  assert.equal(mergeEnvLocalContent("", { LEADSHARK: "abc" }), "LEADSHARK=abc\n");
});

test("merge — replaces an existing assignment in place", () => {
  const existing = "# secrets\nLEADSHARK=old\nOTHER=keep\n";
  const out = mergeEnvLocalContent(existing, { LEADSHARK: "new" });
  assert.equal(out, "# secrets\nLEADSHARK=new\nOTHER=keep\n");
});

test("merge — preserves comments + blank lines, appends unknown keys", () => {
  const existing = "# header\n\nA=1\n";
  const out = mergeEnvLocalContent(existing, { B: "2" });
  assert.equal(out, "# header\n\nA=1\nB=2\n");
});

test("merge — handles `export ` prefix", () => {
  const out = mergeEnvLocalContent("export TOKEN=old\n", { TOKEN: "new" });
  assert.equal(out, "TOKEN=new\n");
});

test("merge — quotes values that need quoting", () => {
  const out = mergeEnvLocalContent("", { KEY: "has space" });
  assert.equal(out, 'KEY="has space"\n');
});

test("merge — skips invalid keys and null/undefined values", () => {
  assert.equal(mergeEnvLocalContent("A=1\n", { "bad key": "x" }), "A=1\n");
  assert.equal(mergeEnvLocalContent("A=1\n", { B: null, C: undefined }), "A=1\n");
});

test("merge — multiple updates in one pass", () => {
  const out = mergeEnvLocalContent("A=1\n", { A: "2", B: "3" });
  assert.equal(out, "A=2\nB=3\n");
});

test("quoteIfNeeded — bare vs quoted", () => {
  assert.equal(quoteIfNeeded("simple"), "simple");
  assert.equal(quoteIfNeeded("a b"), '"a b"');
  assert.equal(quoteIfNeeded(""), '""');
  assert.equal(quoteIfNeeded('quote"inside'), '"quote\\"inside"');
});
