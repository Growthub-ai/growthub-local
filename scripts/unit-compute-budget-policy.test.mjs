import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleUrl = pathToFileURL(path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-work-spec.js",
)).href;

const {
  ComputeBudgetPolicyError,
  normalizeComputePolicy,
  normalizeComputeRequest,
  sha256Hex,
  validateComputeBudgetPolicy,
} = await import(moduleUrl);

test("valid hard caps stay binding and never allow unknown cost", () => {
  const policy = normalizeComputePolicy({
    mode: "cloud",
    budget: { mode: "hard-cap", maxTotalUsd: 25, maxHourlyUsd: 4 },
  });
  assert.deepEqual(policy.budget, {
    mode: "hard-cap",
    maxTotalUsd: 25,
    maxHourlyUsd: 4,
    allowUnknownCost: false,
  });
});

test("hard cap rejects missing or zero ceilings instead of treating them as unlimited", () => {
  for (const budget of [
    { mode: "hard-cap" },
    { mode: "hard-cap", maxTotalUsd: 0 },
    { mode: "hard-cap", maxHourlyUsd: 0 },
  ]) {
    const verdict = validateComputeBudgetPolicy(budget);
    assert.equal(verdict.ok, false, JSON.stringify(budget));
    assert.throws(() => normalizeComputePolicy({ mode: "cloud", budget }), ComputeBudgetPolicyError);
  }
});

test("malformed, negative, non-finite and numeric-string caps fail closed", () => {
  for (const value of [-1, NaN, Infinity, "25", null]) {
    assert.throws(
      () => normalizeComputeRequest({
        policy: { mode: "cloud", budget: { mode: "hard-cap", maxTotalUsd: value } },
      }),
      ComputeBudgetPolicyError,
      `value ${String(value)} must be rejected`,
    );
  }
});

test("hard cap cannot opt into unknown provider cost", () => {
  const verdict = validateComputeBudgetPolicy({
    mode: "hard-cap",
    maxTotalUsd: 10,
    allowUnknownCost: true,
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reasonCode, "budget-hard-cap-unknown-cost");
});

test("advisory and unlimited may omit caps but reject malformed supplied values", () => {
  assert.equal(validateComputeBudgetPolicy({ mode: "advisory" }).ok, true);
  assert.equal(validateComputeBudgetPolicy({ mode: "unlimited" }).ok, true);
  assert.equal(validateComputeBudgetPolicy({ mode: "advisory", maxTotalUsd: -1 }).ok, false);
  assert.equal(validateComputeBudgetPolicy({ mode: "unlimited", maxHourlyUsd: "free" }).ok, false);
});

test("SHA-256 implementation remains correct after budget hardening", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
