#!/usr/bin/env node
/**
 * Unit coverage for lib/creation-error-recovery.js — structured, actionable
 * recovery for creation-lane failures (review #222 Extension 8).
 *
 * Run with:  node --test scripts/unit-creation-error-recovery.test.mjs
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
const { classifyCreationError } = await import(pathToFileURL(path.join(kitLib, "creation-error-recovery.js")).href);

test("read-only runtime (409) → exact env guidance, not retryable", () => {
  const r = classifyCreationError({ phase: "create", httpStatus: 409 });
  assert.equal(r.errorKind, "read_only_runtime");
  assert.equal(r.retryable, false);
  assert.match(r.requiredAction, /WORKSPACE_CONFIG_ALLOW_FS_WRITE/);
});

test("refresh missing-resolver reason → resolver guidance, retryable", () => {
  const r = classifyCreationError({ phase: "refresh", reason: "missing-resolver" });
  assert.equal(r.errorKind, "missing_resolver");
  assert.equal(r.retryable, true);
  assert.equal(r.suggestedRoute, "/api/workspace/resolver-templates");
});

test("refresh not-live-backed → recreate guidance", () => {
  const r = classifyCreationError({ phase: "refresh", reason: "not-live-backed" });
  assert.equal(r.errorKind, "not_live_backed");
  assert.match(r.requiredAction, /live-backed/);
});

test("test failure → check request guidance, retryable", () => {
  const r = classifyCreationError({ phase: "test", httpStatus: 502, detail: "request timed out" });
  assert.equal(r.errorKind, "api_test_failed");
  assert.equal(r.retryable, true);
  assert.equal(r.safeDetail, "request timed out");
});

test("env not configured", () => {
  const r = classifyCreationError({ phase: "test", reason: "env_not_configured" });
  assert.equal(r.errorKind, "env_not_configured");
  assert.match(r.requiredAction, /Settings/);
});

test("unknown fallback + never throws", () => {
  assert.doesNotThrow(() => classifyCreationError());
  const r = classifyCreationError({ phase: "refresh" });
  assert.equal(r.errorKind, "source_refresh_failed");
  const u = classifyCreationError({ phase: "weird" });
  assert.equal(u.errorKind, "unknown");
  assert.equal(u.retryable, true);
});
