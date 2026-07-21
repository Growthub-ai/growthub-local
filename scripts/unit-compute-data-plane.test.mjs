import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const moduleUrl = pathToFileURL(path.join(app, "lib/compute-data-plane.js")).href;
const ledgerUrl = pathToFileURL(path.join(app, "lib/training-ledger.js")).href;
const {
  issueComputeDatasetAccess,
  materializeComputeDataset,
  openComputeDatasetDelivery,
  verifyComputeDatasetDelivery,
  verifyComputeDatasetToken,
} = await import(moduleUrl);
const { TRACES_OBJECT_ID } = await import(ledgerUrl);

const WORK_SPEC_HASH = "a".repeat(64);
const RUN_ID = "trainrun-data-plane";
const EXPORT_ID = "export-data-plane-1";
const NOW = Date.parse("2026-07-21T12:00:00.000Z");

function workspace({ recordCount = 2, tags = true, rows = null } = {}) {
  const traces = rows || [
    { inputPrompt: "first governed prompt", agentOutput: "first governed answer", redactionStatus: "clear", lastExportId: tags ? EXPORT_ID : "", exportOrdinal: 0 },
    { inputPrompt: "second governed prompt", agentOutput: "second governed answer", redactionStatus: "clear", lastExportId: tags ? EXPORT_ID : "", exportOrdinal: 1 },
  ];
  return {
    dataModel: {
      objects: [
        { id: "model-training-run", objectType: "model-training-run", rows: [{ trainingRunId: RUN_ID, modelTrainingRowId: "workspace-local", datasetExportId: EXPORT_ID }] },
        { id: "model-training", objectType: "model-training", rows: [{ Name: "workspace-local-v1", lastExportId: EXPORT_ID, lastExportSummary: JSON.stringify({ recordCount, path: "dataset.jsonl" }) }] },
        { id: TRACES_OBJECT_ID, objectType: TRACES_OBJECT_ID, rows: traces },
      ],
    },
  };
}

async function consume(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function withEnv(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "growthub-compute-data-"));
  const env = {
    GROWTHUB_COMPUTE_DATA_ROOT: tmp,
    GROWTHUB_COMPUTE_PUBLIC_BASE_URL: "http://127.0.0.1:3777",
    GROWTHUB_COMPUTE_AUTHORITY_KEY: "data-plane-test-authority-key",
    GROWTHUB_COMPUTE_DATA_TOKEN_TTL_SECONDS: "300",
    NODE_ENV: "test",
  };
  try { return await fn({ tmp, env }); }
  finally { await fs.rm(tmp, { recursive: true, force: true }); }
}

test("server materializes deterministic export-tagged JSONL and issues no-secret evidence", async () => withEnv(async ({ env }) => {
  const first = await materializeComputeDataset({ workspaceConfig: workspace(), trainingRunId: RUN_ID, request: { datasetExportId: EXPORT_ID }, env });
  assert.equal(first.ok, true, first.reason);
  assert.equal(first.manifest.binding, "materialized-bytes");
  assert.equal(first.manifest.recordCount, 2);
  assert.match(first.manifest.corpusSha256, /^[a-f0-9]{64}$/);
  assert.match(first.manifest.manifestHash, /^[a-f0-9]{64}$/);

  const second = await materializeComputeDataset({ workspaceConfig: workspace(), trainingRunId: RUN_ID, request: { datasetExportId: EXPORT_ID }, env });
  assert.equal(second.ok, true);
  assert.equal(second.manifest.corpusSha256, first.manifest.corpusSha256, "same governed rows produce the same content identity");

  const grant = issueComputeDatasetAccess({ manifest: first.manifest, trainingRunId: RUN_ID, workSpecHash: WORK_SPEC_HASH, env, now: () => NOW });
  assert.equal(grant.ok, true, grant.reason);
  assert.match(grant.access.uri, /\/api\/workspace\/compute-data\//);
  assert.equal(grant.evidence.uri, undefined, "bearer URL never enters receipt evidence");
  assert.equal(JSON.stringify(grant.evidence).includes(grant.access.uri), false);
}));

test("signed delivery is bound to run, work spec and corpus, then receipt-verifiable", async () => withEnv(async ({ env }) => {
  const staged = await materializeComputeDataset({ workspaceConfig: workspace(), trainingRunId: RUN_ID, request: { datasetExportId: EXPORT_ID }, env });
  const grant = issueComputeDatasetAccess({ manifest: staged.manifest, trainingRunId: RUN_ID, workSpecHash: WORK_SPEC_HASH, env, now: () => NOW });
  const token = decodeURIComponent(new URL(grant.access.uri).pathname.split("/").pop());
  const verified = verifyComputeDatasetToken(token, { env, now: () => NOW + 1000 });
  assert.equal(verified.ok, true);
  assert.equal(verified.payload.workSpecHash, WORK_SPEC_HASH);

  const delivery = await openComputeDatasetDelivery(token, { env, now: () => NOW + 1000 });
  assert.equal(delivery.ok, true, delivery.reason);
  const bytes = await consume(delivery.stream);
  assert.equal(bytes.byteLength, staged.manifest.sizeBytes);
  assert.match(bytes.toString("utf8"), /first governed prompt/);

  const receipt = await verifyComputeDatasetDelivery({ evidence: grant.evidence, workSpec: { trainingRunId: RUN_ID, workSpecHash: WORK_SPEC_HASH, dataset: { exportId: EXPORT_ID, corpusSha256: staged.manifest.corpusSha256 } }, env });
  assert.equal(receipt.ok, true, receipt.reason);
  assert.equal(receipt.receipt.corpusSha256, staged.manifest.corpusSha256);

  // A legitimate provider retry may re-read the same still-valid grant. The
  // delivery receipt must remain idempotent rather than failing at stream end.
  const retry = await openComputeDatasetDelivery(token, { env, now: () => NOW + 2000 });
  assert.equal(retry.ok, true);
  await consume(retry.stream);
  assert.equal((await verifyComputeDatasetDelivery({ evidence: grant.evidence, workSpec: { trainingRunId: RUN_ID, workSpecHash: WORK_SPEC_HASH, dataset: { exportId: EXPORT_ID, corpusSha256: staged.manifest.corpusSha256 } }, env })).ok, true);
}));

test("tampered, expired and foreign-work-spec grants fail closed", async () => withEnv(async ({ env }) => {
  const staged = await materializeComputeDataset({ workspaceConfig: workspace(), trainingRunId: RUN_ID, request: { datasetExportId: EXPORT_ID }, env });
  const grant = issueComputeDatasetAccess({ manifest: staged.manifest, trainingRunId: RUN_ID, workSpecHash: WORK_SPEC_HASH, env, now: () => NOW });
  const token = decodeURIComponent(new URL(grant.access.uri).pathname.split("/").pop());
  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  assert.equal(verifyComputeDatasetToken(tampered, { env, now: () => NOW + 1 }).ok, false);
  assert.equal(verifyComputeDatasetToken(token, { env, now: () => NOW + 301_000 }).reasonCode, "dataset-token-expired");

  const delivery = await openComputeDatasetDelivery(token, { env, now: () => NOW + 1000 });
  await consume(delivery.stream);
  const foreign = await verifyComputeDatasetDelivery({ evidence: grant.evidence, workSpec: { trainingRunId: RUN_ID, workSpecHash: "b".repeat(64), dataset: { exportId: EXPORT_ID, corpusSha256: staged.manifest.corpusSha256 } }, env });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.reasonCode, "dataset-delivery-mismatch");
}));

test("missing export tags and record-count drift cannot produce remote authority bytes", async () => withEnv(async ({ env }) => {
  const missing = await materializeComputeDataset({ workspaceConfig: workspace({ tags: false }), trainingRunId: RUN_ID, request: { datasetExportId: EXPORT_ID }, env });
  assert.equal(missing.ok, false);
  assert.equal(missing.reasonCode, "dataset-bytes-unavailable");

  const drifted = await materializeComputeDataset({ workspaceConfig: workspace({ recordCount: 3 }), trainingRunId: RUN_ID, request: { datasetExportId: EXPORT_ID }, env });
  assert.equal(drifted.ok, false);
  assert.equal(drifted.reasonCode, "dataset-record-count-drift");
}));

test("production grants require an HTTPS public origin", async () => withEnv(async ({ env }) => {
  const staged = await materializeComputeDataset({ workspaceConfig: workspace(), trainingRunId: RUN_ID, request: { datasetExportId: EXPORT_ID }, env });
  const production = { ...env, NODE_ENV: "production", GROWTHUB_COMPUTE_PUBLIC_BASE_URL: "http://127.0.0.1:3777" };
  const grant = issueComputeDatasetAccess({ manifest: staged.manifest, trainingRunId: RUN_ID, workSpecHash: WORK_SPEC_HASH, env: production, now: () => NOW });
  assert.equal(grant.ok, false);
  assert.equal(grant.reasonCode, "dataset-public-base-url-missing");
}));
