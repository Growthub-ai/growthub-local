#!/usr/bin/env node
/**
 * Wire compute-data-plane.js to the deployment-aware durable data store.
 *
 * Runs after apply-compute-data-plane + finalize-compute-data-plane. Idempotent:
 * either the original filesystem form is replaced once or the durable marker
 * proves the production wiring already exists.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-data-plane.js";
const file = path.join(root, dataPath);
let source = fs.readFileSync(file, "utf8");

function replaceOnce(input, before, after, label) {
  const index = input.indexOf(before);
  if (index < 0) throw new Error(`[durable-data-store] missing anchor: ${label}`);
  if (input.indexOf(before, index + before.length) >= 0) throw new Error(`[durable-data-store] ambiguous anchor: ${label}`);
  return input.slice(0, index) + after + input.slice(index + before.length);
}

function replaceFunction(input, functionPrefix, nextMarker, replacement, label) {
  const start = input.indexOf(functionPrefix);
  if (start < 0) throw new Error(`[durable-data-store] missing function: ${label}`);
  const end = input.indexOf(nextMarker, start);
  if (end < 0) throw new Error(`[durable-data-store] missing end marker: ${label}`);
  return input.slice(0, start) + replacement + input.slice(end);
}

if (!source.includes('from "./compute-data-store.js"')) {
  source = source
    .replace('import { createReadStream } from "node:fs";\n', "")
    .replace('import { promises as fs } from "node:fs";\n', "")
    .replace('import path from "node:path";\n', "");
  source = replaceOnce(
    source,
    'import { Readable } from "node:stream";\n',
    'import { Readable } from "node:stream";\nimport { resolveComputeDataStore } from "./compute-data-store.js";\n',
    "data-store import",
  );
}

if (source.includes("function dataRoot(env = process.env) {")) {
  source = replaceFunction(
    source,
    "function dataRoot(env = process.env) {",
    "function exactlyOne",
    `function resolveDataStore({ env = process.env, fetchImpl = globalThis.fetch, dataStore = null } = {}) {
  return dataStore || resolveComputeDataStore({ env, fetchImpl });
}

`,
    "filesystem helper block",
  );
}

const materializeStart = source.indexOf("export async function materializeComputeDataset({");
const materializeEnd = source.indexOf("\n}\n\nfunction resolveRootSigningKey", materializeStart);
if (materializeStart < 0 || materializeEnd < 0) throw new Error("[durable-data-store] materializer bounds not found");
let materialize = source.slice(materializeStart, materializeEnd + 2);
if (!materialize.includes("dataStore = null")) {
  materialize = replaceOnce(
    materialize,
    `  request = null,
  env = process.env,
} = {}) {`,
    `  request = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  dataStore = null,
} = {}) {`,
    "materializer parameters",
  );
}
if (materialize.includes("const filePath = datasetPathForSha")) {
  const storageStart = materialize.indexOf("  const filePath = datasetPathForSha");
  const storageEnd = materialize.indexOf("  const manifestBody = {", storageStart);
  if (storageEnd < 0) throw new Error("[durable-data-store] materializer storage block end not found");
  const storage = `  let store;
  try {
    store = resolveDataStore({ env, fetchImpl, dataStore });
    await store.putDataset({ corpusSha256, bytes });
  } catch (error) {
    return failure(
      str(error?.code) || "dataset-stage-failed",
      \`failed to stage governed dataset bytes: \${str(error?.message || error)}\`,
    );
  }
`;
  materialize = materialize.slice(0, storageStart) + storage + materialize.slice(storageEnd);
  materialize = materialize.replace(
    `    binding: "materialized-bytes",
  };`,
    `    binding: "materialized-bytes",
    storageKind: str(store?.kind),
    durableStorage: store?.durable === true,
  };`,
  );
  materialize = materialize.replace(
    `    manifest: { ...manifestBody, manifestHash: sha256(stableStringify(manifestBody)) },
    filePath,
`,
    `    manifest: { ...manifestBody, manifestHash: sha256(stableStringify(manifestBody)) },
    storage: { kind: str(store?.kind), durable: store?.durable === true },
`,
  );
}
source = source.slice(0, materializeStart) + materialize + source.slice(materializeEnd + 2);

const writerReplacement = `async function writeDeliveryReceipt(payload, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  dataStore = null,
} = {}) {
  const key = resolveRootSigningKey(env);
  if (!key) throw new Error("dataset signing key is unavailable");
  const immutable = {
    schema: COMPUTE_DATA_DELIVERY_SCHEMA,
    tokenId: str(payload.tokenId),
    trainingRunId: str(payload.trainingRunId),
    workSpecHash: str(payload.workSpecHash),
    exportId: str(payload.exportId),
    manifestHash: str(payload.manifestHash),
    corpusSha256: str(payload.corpusSha256),
    sizeBytes: Number(payload.sizeBytes) || 0,
    recordCount: Number(payload.recordCount) || 0,
  };
  const sameIdentity = (existing) => existing
    && stableStringify(Object.fromEntries(Object.keys(immutable).map((field) => [field, existing[field]]))) === stableStringify(immutable);
  const store = resolveDataStore({ env, fetchImpl, dataStore });
  try {
    const existingBytes = await store.getDeliveryReceipt({ tokenId: immutable.tokenId });
    const existing = JSON.parse(existingBytes.toString("utf8"));
    if (sameIdentity(existing)) return existing;
    throw new Error("dataset delivery receipt identity collision");
  } catch (error) {
    if (error?.code !== "dataset-delivery-missing") {
      if (/dataset delivery receipt identity collision/.test(str(error?.message))) throw error;
      if (!/Unexpected token|JSON/.test(str(error?.message))) throw error;
    }
  }
  const body = { ...immutable, deliveredAt: new Date().toISOString() };
  const record = { ...body, signature: deliverySignature(body, key) };
  const bytes = Buffer.from(\`\${JSON.stringify(record, null, 2)}\\n\`, "utf8");
  try {
    await store.putDeliveryReceipt({ tokenId: immutable.tokenId, bytes });
    return record;
  } catch (error) {
    if (error?.code !== "compute-data-storage-collision") throw error;
    const existing = JSON.parse((await store.getDeliveryReceipt({ tokenId: immutable.tokenId })).toString("utf8"));
    if (!sameIdentity(existing)) throw new Error("dataset delivery receipt identity collision");
    return existing;
  }
}

`;
if (source.includes("async function writeDeliveryReceipt(payload, env = process.env) {")) {
  source = replaceFunction(
    source,
    "async function writeDeliveryReceipt(payload, env = process.env) {",
    "/** Resolve a token to a bounded file",
    writerReplacement,
    "delivery receipt writer",
  );
} else if (!source.includes("const store = resolveDataStore({ env, fetchImpl, dataStore });")) {
  throw new Error("[durable-data-store] delivery writer is neither filesystem nor durable form");
}

const deliveryStart = source.indexOf("export async function openComputeDatasetDelivery(");
const deliveryEnd = source.indexOf("\n}\n\n/** Prove this exact run/work-spec corpus", deliveryStart);
if (deliveryStart < 0 || deliveryEnd < 0) throw new Error("[durable-data-store] delivery function bounds not found");
let delivery = source.slice(deliveryStart, deliveryEnd + 2);
if (!delivery.includes("dataStore = null")) {
  delivery = delivery.replace(
    `export async function openComputeDatasetDelivery(token, { env = process.env, now = () => Date.now() } = {}) {`,
    `export async function openComputeDatasetDelivery(token, {
  env = process.env,
  now = () => Date.now(),
  fetchImpl = globalThis.fetch,
  dataStore = null,
} = {}) {`,
  );
}
if (delivery.includes("const filePath = datasetPathForSha")) {
  const openStart = delivery.indexOf("  const filePath = datasetPathForSha");
  const openEnd = delivery.indexOf("  let completed = false;", openStart);
  if (openEnd < 0) throw new Error("[durable-data-store] dataset open block end not found");
  const openBlock = `  let store;
  let opened;
  try {
    store = resolveDataStore({ env, fetchImpl, dataStore });
    opened = await store.openDataset({
      corpusSha256: payload.corpusSha256,
      sizeBytes: payload.sizeBytes,
    });
  } catch (error) {
    return failure(str(error?.code) || "dataset-file-missing", str(error?.message || "content-addressed dataset object is unavailable"));
  }
  const source = opened.stream;
`;
  delivery = delivery.slice(0, openStart) + openBlock + delivery.slice(openEnd);
}
delivery = delivery.replace(
  "    await writeDeliveryReceipt(payload, env);",
  "    await writeDeliveryReceipt(payload, { env, fetchImpl, dataStore: store });",
);
source = source.slice(0, deliveryStart) + delivery + source.slice(deliveryEnd + 2);

const verifyStart = source.indexOf("export async function verifyComputeDatasetDelivery({");
if (verifyStart < 0) throw new Error("[durable-data-store] verify function not found");
let verify = source.slice(verifyStart);
if (!verify.includes("dataStore = null")) {
  verify = verify.replace(
    `export async function verifyComputeDatasetDelivery({ evidence = null, workSpec = null, env = process.env } = {}) {`,
    `export async function verifyComputeDatasetDelivery({
  evidence = null,
  workSpec = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  dataStore = null,
} = {}) {`,
  );
}
const readPattern = /  let receipt;\n  try \{ receipt = JSON\.parse\(await fs\.readFile\(deliveryPathForToken\(tokenId, env\), "utf8"\)\); \} catch \{\n    return failure\("dataset-delivery-missing", "no completed dataset delivery receipt exists for this run"\);\n  \}/;
if (readPattern.test(verify)) {
  verify = verify.replace(
    readPattern,
    `  let receipt;
  try {
    const store = resolveDataStore({ env, fetchImpl, dataStore });
    receipt = JSON.parse((await store.getDeliveryReceipt({ tokenId })).toString("utf8"));
  } catch (error) {
    return failure(str(error?.code) || "dataset-delivery-missing", str(error?.message || "no completed dataset delivery receipt exists for this run"));
  }`,
  );
}
source = source.slice(0, verifyStart) + verify;

if (!source.includes('from "./compute-data-store.js"')) {
  throw new Error("[durable-data-store] durable store import missing after wiring");
}
if (source.includes("datasetPathForSha(") || source.includes("deliveryPathForToken(") || source.includes("await fs.readFile(")) {
  throw new Error("[durable-data-store] direct filesystem persistence remains in compute-data-plane");
}

fs.writeFileSync(file, source);
console.log("[durable-data-store] compute data plane now uses Supabase Storage in configured production deployments and refuses ephemeral production persistence");
