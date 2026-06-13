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
});
