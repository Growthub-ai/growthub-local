import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

// CI gate for the deferred-step contract (review hardening #1/#2): the validator
// must accept a complete operator proof and REJECT every failure mode, so
// "GPU needed" can never smuggle in an incomplete or dishonest proof.
const mod = await import(pathToFileURL(path.resolve("scripts/verify-operator-proof-contract.mjs")).href);
const { validateOperatorProof, OPERATOR_PROOF_TEMPLATE } = mod;
const clone = () => JSON.parse(JSON.stringify(OPERATOR_PROOF_TEMPLATE));

test("operator-proof: the complete template validates", () => {
  const { ok, errors } = validateOperatorProof(OPERATOR_PROOF_TEMPLATE);
  assert.ok(ok, `template should validate: ${errors.join("; ")}`);
});

test("operator-proof fixture — missing required field is rejected", () => {
  const p = clone(); delete p.artifact.sha256;
  const { ok, errors } = validateOperatorProof(p);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /artifact\.sha256/.test(e)), errors.join("; "));
});

test("operator-proof fixture — base-model demotion is rejected (served == base)", () => {
  const p = clone(); p.firstInvocation.servedModel = "gemma3"; p.firstInvocation.notBaseModel = true;
  const { ok, errors } = validateOperatorProof(p);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /servedModel must NOT equal baseModel/.test(e)), errors.join("; "));
});

test("operator-proof fixture — non-200 invocation is rejected", () => {
  const p = clone(); p.firstInvocation.httpStatus = 503;
  const { ok, errors } = validateOperatorProof(p);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /httpStatus must be 200/.test(e)), errors.join("; "));
});

test("operator-proof fixture — quant output larger than source is rejected", () => {
  const p = clone(); p.artifact.quantOutputBytes = p.artifact.quantSourceBytes + 1;
  const { ok, errors } = validateOperatorProof(p);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /quantOutputBytes must be < quantSourceBytes/.test(e)), errors.join("; "));
});

test("operator-proof fixture — missing checkpoint/resume data is rejected", () => {
  const p = clone(); delete p.fineTune.checkpointPath; delete p.fineTune.resumeFromCheckpoint;
  const { ok, errors } = validateOperatorProof(p);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /fineTune\.checkpointPath/.test(e)), errors.join("; "));
  assert.ok(errors.some((e) => /fineTune\.resumeFromCheckpoint/.test(e)), errors.join("; "));
});

test("operator-proof fixture — expected != served (mismatch, not the tuned tag) is rejected", () => {
  const p = clone(); p.firstInvocation.servedModel = "some-other-model";
  const { ok, errors } = validateOperatorProof(p);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /servedModel must equal expectedTag/.test(e)), errors.join("; "));
});

test("operator-proof fixture — served-tag proof present distinguishes complete from interrupted", () => {
  // An interrupted run with no artifact sha / no served response cannot pass:
  // several required fields blank at once → many errors, never ok.
  const p = clone(); p.artifact.sha256 = ""; p.firstInvocation.responseBody = ""; p.proof.outputHash = "";
  const { ok, errors } = validateOperatorProof(p);
  assert.equal(ok, false);
  assert.ok(errors.length >= 3, errors.join("; "));
});
