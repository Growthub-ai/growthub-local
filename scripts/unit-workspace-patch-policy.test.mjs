#!/usr/bin/env node
/**
 * Adversarial unit tests for the workspace PATCH mutation policy
 * (cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-patch-policy.js).
 *
 * The policy is dependency-free, so this suite imports the shipped module
 * directly — no app boot required. The e2e companion
 * (scripts/e2e-workspace-patch-policy-probe.mjs) proves the same gates over
 * real HTTP including the preflight and publish routes.
 *
 * Run: node --test scripts/unit-workspace-patch-policy.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policyModule = path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-patch-policy.js",
);

const {
  WORKSPACE_PATCH_LIMITS,
  evaluateWorkspacePatchPolicy,
} = await import(policyModule);

function codes(result) {
  return result.violations.map((v) => v.code);
}

function sandboxConfig(rowOverrides = {}, objectOverrides = {}) {
  return {
    dataModel: {
      objects: [
        {
          id: "sbx",
          label: "Sandboxes",
          objectType: "sandbox-environment",
          columns: ["Name"],
          rows: [
            {
              Name: "wf",
              lifecycleStatus: "draft",
              version: "1",
              orchestrationConfig: "",
              ...rowOverrides,
            },
          ],
          ...objectOverrides,
        },
      ],
    },
  };
}

function patchRows(rows) {
  return {
    dataModel: {
      objects: [
        { id: "sbx", label: "Sandboxes", objectType: "sandbox-environment", columns: ["Name"], rows },
      ],
    },
  };
}

// ── valid traffic must pass ────────────────────────────────────────────────

test("valid normal dataModel patch succeeds", () => {
  const result = evaluateWorkspacePatchPolicy({}, {
    dataModel: { objects: [{ id: "people", label: "People", rows: [{ Name: "a" }] }] },
  });
  assert.equal(result.ok, true, JSON.stringify(result.violations));
});

test("sandbox row creation with draft lifecycle and initial version succeeds", () => {
  const result = evaluateWorkspacePatchPolicy({}, patchRows([
    { Name: "wf", lifecycleStatus: "draft", version: "1", runtime: "bash", command: "echo hi" },
  ]));
  assert.equal(result.ok, true, JSON.stringify(result.violations));
});

test("draft workflow field save succeeds", () => {
  const current = sandboxConfig();
  const result = evaluateWorkspacePatchPolicy(current, patchRows([
    {
      Name: "wf",
      lifecycleStatus: "draft",
      version: "1",
      orchestrationConfig: "",
      orchestrationDraftConfig: JSON.stringify({ version: 1, provider: "x", nodes: [], edges: [] }),
      orchestrationDraftStatus: "untested",
      orchestrationDraftTestPassed: false,
      orchestrationDraftTestedConfig: "",
    },
  ]));
  assert.equal(result.ok, true, JSON.stringify(result.violations));
});

test("echoing persisted live fields byte-identically succeeds", () => {
  const live = JSON.stringify({ version: 1, provider: "x", nodes: [{ id: "n1", type: "core-action", config: {} }], edges: [] });
  const current = sandboxConfig({
    lifecycleStatus: "live",
    version: "3",
    orchestrationConfig: live,
    orchestrationPublishedAt: "2026-01-01T00:00:00.000Z",
    orchestrationDeltas: [{ at: "2026-01-01T00:00:00.000Z", version: "3" }],
  });
  const echoed = JSON.parse(JSON.stringify(current.dataModel.objects[0].rows[0]));
  echoed.status = "connected"; // unrelated stamped field may change
  const result = evaluateWorkspacePatchPolicy(current, patchRows([echoed]));
  assert.equal(result.ok, true, JSON.stringify(result.violations));
});

test("pausing a live row back to draft succeeds (only the live transition is publish-owned)", () => {
  const current = sandboxConfig({ lifecycleStatus: "live", version: "2" });
  const echoed = { ...current.dataModel.objects[0].rows[0], lifecycleStatus: "draft" };
  const result = evaluateWorkspacePatchPolicy(current, patchRows([echoed]));
  assert.equal(result.ok, true, JSON.stringify(result.violations));
});

// ── adversarial traffic must fail ──────────────────────────────────────────

test("unknown top-level patch field fails", () => {
  const result = evaluateWorkspacePatchPolicy({}, { branding: { name: "x" } });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("unknown_field"));
});

test("full workspace config body fails with the dedicated reason", () => {
  const result = evaluateWorkspacePatchPolicy({}, {
    id: "ws", name: "Workspace", branding: {}, capabilities: {}, integrations: [],
    dashboards: [], widgetTypes: [], canvas: {}, dataModel: { objects: [] },
  });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("full_config_body"));
});

test("workspaceSourceRecords through PATCH fails with the dedicated reason", () => {
  const result = evaluateWorkspacePatchPolicy({}, { workspaceSourceRecords: {} });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("source_records_through_patch"));
});

test("direct live orchestrationConfig change on an existing row fails", () => {
  const current = sandboxConfig({ orchestrationConfig: "" });
  const result = evaluateWorkspacePatchPolicy(current, patchRows([
    {
      Name: "wf",
      lifecycleStatus: "draft",
      version: "1",
      orchestrationConfig: JSON.stringify({ version: 1, provider: "x", nodes: [], edges: [] }),
    },
  ]));
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("live_workflow_field"));
});

test("creating a row born with a live graph fails", () => {
  const result = evaluateWorkspacePatchPolicy({}, patchRows([
    { Name: "wf", orchestrationGraph: JSON.stringify({ version: 1, provider: "x", nodes: [], edges: [] }) },
  ]));
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("live_workflow_field"));
});

test("direct version bump fails", () => {
  const current = sandboxConfig({ version: "1" });
  const result = evaluateWorkspacePatchPolicy(current, patchRows([
    { Name: "wf", lifecycleStatus: "draft", version: "2", orchestrationConfig: "" },
  ]));
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("live_workflow_field"));
});

test("direct lifecycleStatus transition to live fails", () => {
  const current = sandboxConfig({ lifecycleStatus: "draft" });
  const result = evaluateWorkspacePatchPolicy(current, patchRows([
    { Name: "wf", lifecycleStatus: "live", version: "1", orchestrationConfig: "" },
  ]));
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("live_publish_via_patch"));
});

test("direct orchestrationDeltas append fails", () => {
  const current = sandboxConfig({ orchestrationDeltas: [] });
  const result = evaluateWorkspacePatchPolicy(current, patchRows([
    { Name: "wf", lifecycleStatus: "draft", version: "1", orchestrationConfig: "", orchestrationDeltas: [{ at: "now" }] },
  ]));
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("live_workflow_field"));
});

test("credential-shaped field on a sandbox row fails", () => {
  const result = evaluateWorkspacePatchPolicy({}, patchRows([
    { Name: "wf", apiKey: "sk-123" },
  ]));
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("credential_field"));
});

test("oversized patch body fails", () => {
  const result = evaluateWorkspacePatchPolicy({}, {
    dataModel: { objects: [{ id: "big", label: "Big", rows: [], blob: "x".repeat(WORKSPACE_PATCH_LIMITS.maxPatchBytes) }] },
  });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("oversized_patch"));
});

test("oversized single row fails", () => {
  const result = evaluateWorkspacePatchPolicy({}, patchRows([
    { Name: "wf", payload: "x".repeat(WORKSPACE_PATCH_LIMITS.maxRowBytes + 1) },
  ]));
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("oversized_row"));
});

test("row-count ceiling per object fails", () => {
  const rows = Array.from({ length: WORKSPACE_PATCH_LIMITS.maxRowsPerObject + 1 }, (_, i) => ({ Name: `r${i}` }));
  const result = evaluateWorkspacePatchPolicy({}, patchRows(rows));
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("oversized_object"));
});

test("oversized orchestration node config in a draft fails", () => {
  const draft = JSON.stringify({
    version: 1,
    provider: "x",
    nodes: [{ id: "n1", type: "core-action", config: { blob: "x".repeat(WORKSPACE_PATCH_LIMITS.maxNodeConfigBytes + 1) } }],
    edges: [],
  });
  const result = evaluateWorkspacePatchPolicy({}, patchRows([
    { Name: "wf", orchestrationDraftConfig: draft },
  ]));
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("oversized_node_config"));
});

test("history blob smuggled into a row fails", () => {
  const result = evaluateWorkspacePatchPolicy({}, {
    dataModel: { objects: [{ id: "people", label: "People", rows: [{ Name: "a", records: [{ run: 1 }] }] }] },
  });
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("history_smuggling"));
});

test("non-object body fails", () => {
  const result = evaluateWorkspacePatchPolicy({}, [1, 2]);
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("invalid_body"));
});

// ── training evidence is server-owned ──────────────────────────────────────

const SEALED_COMPUTE = JSON.stringify({
  schema: "growthub-compute-evidence-v1",
  capacityProfileId: "single-gpu-finetune",
  providerRegistryId: "fake-remote",
  idempotencyKeyHash: "a".repeat(64),
  authority: { schema: "growthub-compute-authority-v1", authorityHash: "b".repeat(64), keyId: "env-abc", seal: "c".repeat(64) },
  decision: { schema: "growthub-compute-decision-v1", selectedProviderId: "fake-remote" },
  allocation: { allocationId: "alloc-1", status: "running", releaseConfirmed: false },
  events: [{ type: "compute-allocated", at: "t", source: "provider" }],
  checkpoints: [{ checkpointId: "ck-1", locator: "vol://ck", sha256: "d".repeat(64) }],
});

function trainingRunConfig(rowOverrides = {}) {
  return {
    dataModel: {
      objects: [
        {
          id: "model-training-run",
          objectType: "model-training-run",
          columns: ["trainingRunId"],
          rows: [
            {
              trainingRunId: "trainrun_1",
              modelTrainingRowId: "workspace-local",
              status: "running",
              computeRequest: JSON.stringify({ schema: "growthub-compute-request-v1", policy: { mode: "cloud" } }),
              ...rowOverrides,
            },
          ],
        },
      ],
    },
  };
}

function patchTrainingRows(rows) {
  return {
    dataModel: {
      objects: [
        { id: "model-training-run", objectType: "model-training-run", columns: ["trainingRunId"], rows },
      ],
    },
  };
}

test("creating a run row born with populated compute evidence fails", () => {
  const result = evaluateWorkspacePatchPolicy({}, patchTrainingRows([
    { trainingRunId: "trainrun_new", status: "running", compute: SEALED_COMPUTE },
  ]));
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes("training_evidence_field"));
});

test("forging, altering, or erasing the compute journal on an existing run row fails", () => {
  const current = trainingRunConfig({ compute: SEALED_COMPUTE });
  const forged = JSON.parse(SEALED_COMPUTE);
  forged.allocation.allocationId = "alloc-forged";
  const altered = evaluateWorkspacePatchPolicy(current, patchTrainingRows([
    { trainingRunId: "trainrun_1", status: "running", compute: JSON.stringify(forged) },
  ]));
  assert.equal(altered.ok, false);
  assert.ok(codes(altered).includes("training_evidence_field"));

  const erased = evaluateWorkspacePatchPolicy(current, patchTrainingRows([
    { trainingRunId: "trainrun_1", status: "running", compute: "" },
  ]));
  assert.equal(erased.ok, false, "wiping durable evidence is also refused");
  assert.ok(codes(erased).includes("training_evidence_field"));

  const created = evaluateWorkspacePatchPolicy(trainingRunConfig({}), patchTrainingRows([
    { trainingRunId: "trainrun_1", status: "running", compute: SEALED_COMPUTE },
  ]));
  assert.equal(created.ok, false, "populating evidence on an evidence-free row is refused");
  assert.ok(codes(created).includes("training_evidence_field"));
});

test("echoing the persisted compute journal byte-identically succeeds, and computeRequest stays freely PATCHable", () => {
  const current = trainingRunConfig({ compute: SEALED_COMPUTE });
  const result = evaluateWorkspacePatchPolicy(current, patchTrainingRows([
    {
      trainingRunId: "trainrun_1",
      status: "running",
      compute: SEALED_COMPUTE, // echo
      computeRequest: JSON.stringify({ schema: "growthub-compute-request-v1", policy: { mode: "automatic" }, outputModelTag: "tuned-v2" }),
      progress: { stageId: "fine-tuning", pct: 40 },
    },
  ]));
  assert.equal(result.ok, true, JSON.stringify(result.violations));
});

test("on a provider-compute row, PATCH cannot mint imported/completed status or rewrite artifact identity", () => {
  const current = trainingRunConfig({ compute: SEALED_COMPUTE, artifactSha256: "e".repeat(64) });
  const minted = evaluateWorkspacePatchPolicy(current, patchTrainingRows([
    { trainingRunId: "trainrun_1", status: "imported", compute: SEALED_COMPUTE, artifactSha256: "e".repeat(64) },
  ]));
  assert.equal(minted.ok, false);
  assert.ok(codes(minted).includes("training_evidence_field"));

  const rewritten = evaluateWorkspacePatchPolicy(current, patchTrainingRows([
    { trainingRunId: "trainrun_1", status: "running", compute: SEALED_COMPUTE, artifactSha256: "f".repeat(64) },
  ]));
  assert.equal(rewritten.ok, false);
  assert.ok(codes(rewritten).includes("training_evidence_field"));

  // Honest failure reporting stays possible for the client.
  const failed = evaluateWorkspacePatchPolicy(current, patchTrainingRows([
    { trainingRunId: "trainrun_1", status: "failed", compute: SEALED_COMPUTE, artifactSha256: "e".repeat(64), blockedReason: "operator abort" },
  ]));
  assert.equal(failed.ok, true, JSON.stringify(failed.violations));
});

test("the LOCAL runner lane is preserved: a run row without compute evidence may stamp imported + artifact identity", () => {
  const current = trainingRunConfig({});
  const result = evaluateWorkspacePatchPolicy(current, patchTrainingRows([
    {
      trainingRunId: "trainrun_1",
      status: "imported",
      completedAt: "2026-07-21T00:00:00.000Z",
      artifactType: "gguf",
      artifactPath: "/models/tuned.gguf",
      artifactSha256: "a".repeat(64),
      artifactArtifactBytes: 4096,
      computeRequest: JSON.stringify({ schema: "growthub-compute-request-v1", policy: { mode: "cloud" } }),
    },
  ]));
  assert.equal(result.ok, true, JSON.stringify(result.violations));
});

test("an automatic-policy run that resolved to the LOCAL machine keeps the local runner lane writable", () => {
  // The journal carries a decision block whose selected provider is the
  // local machine (fallthrough) — the run finishes through the local
  // runner's governed PATCH, so its success stamp must remain allowed.
  const localDecision = JSON.stringify({
    schema: "growthub-compute-evidence-v1",
    capacityProfileId: "cpu-local-finetune",
    decision: { schema: "growthub-compute-decision-v1", selectedProviderId: "local-machine" },
    authority: { schema: "growthub-compute-authority-v1", authorityHash: "b".repeat(64), keyId: "env-abc", seal: "c".repeat(64) },
    events: [],
  });
  const current = trainingRunConfig({ compute: localDecision });
  const result = evaluateWorkspacePatchPolicy(current, patchTrainingRows([
    {
      trainingRunId: "trainrun_1",
      status: "imported",
      compute: localDecision, // echo
      artifactType: "gguf",
      artifactPath: "/models/tuned.gguf",
      artifactSha256: "a".repeat(64),
    },
  ]));
  assert.equal(result.ok, true, JSON.stringify(result.violations));
});

test("benchmarkWins/promotion is a derived verdict — PATCH may echo it but never write it", () => {
  const wins = { total: 6, wins: 6, winRatePct: 100, promoted: true };
  const forged = evaluateWorkspacePatchPolicy(trainingRunConfig({}), patchTrainingRows([
    { trainingRunId: "trainrun_1", status: "running", distillation: JSON.stringify({ teacherModel: "t", benchmarkWins: wins }) },
  ]));
  assert.equal(forged.ok, false);
  assert.ok(codes(forged).includes("training_evidence_field"));

  const current = trainingRunConfig({ distillation: JSON.stringify({ teacherModel: "t", benchmarkWins: wins }) });
  const echoed = evaluateWorkspacePatchPolicy(current, patchTrainingRows([
    { trainingRunId: "trainrun_1", status: "running", distillation: JSON.stringify({ teacherModel: "t", benchmarkWins: wins }) },
  ]));
  assert.equal(echoed.ok, true, JSON.stringify(echoed.violations));
});

// ── repair guidance ────────────────────────────────────────────────────────

test("repairPlanForViolations maps every violation code to a governed alternative", async () => {
  const { repairPlanForViolations } = await import(policyModule);
  const live = repairPlanForViolations([{ code: "live_workflow_field", path: "x", message: "m" }]);
  assert.equal(live.length, 1);
  assert.ok(live[0].includes("orchestrationDraftConfig") && live[0].includes("workflow/publish"));
  const multi = repairPlanForViolations([
    { code: "credential_field", path: "a", message: "m" },
    { code: "history_smuggling", path: "b", message: "m" },
    { code: "credential_field", path: "c", message: "m" }, // dedupe
    { code: "not_a_real_code", path: "d", message: "m" },  // tolerated
  ]);
  assert.equal(multi.length, 2);
  assert.ok(multi[0].includes("authRef"));
  assert.ok(multi[1].includes("source-records"));
  const training = repairPlanForViolations([{ code: "training_evidence_field", path: "x", message: "m" }]);
  assert.equal(training.length, 1);
  assert.ok(training[0].includes("computeRequest") && training[0].includes("sandbox-run"));
});
