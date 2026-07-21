#!/usr/bin/env node
/** Final invariants after the surgical data-plane applicator runs. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (rel, value) => fs.writeFileSync(path.join(root, rel), value);

const executionPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-execution.js";
let execution = read(executionPath);
const providerLoop = execution.indexOf("  for (const provider of observableProviders) {");
const caps = execution.indexOf("    const caps = await safeCall", providerLoop);
if (providerLoop < 0 || caps < 0) throw new Error("provider observation loop not found");
const quoteSlice = execution.slice(providerLoop, caps);
if (quoteSlice.includes("      datasetAccess,\n")) {
  const cleaned = quoteSlice.replace("      datasetAccess,\n", "");
  execution = `${execution.slice(0, providerLoop)}${cleaned}${execution.slice(caps)}`;
}
write(executionPath, execution);

const dataPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-data-plane.js";
let data = read(dataPath);
const functionStart = data.indexOf("async function writeDeliveryReceipt(payload, env = process.env) {");
const functionEnd = data.indexOf("\n\n/** Resolve a token to a bounded file", functionStart);
if (functionStart < 0 || functionEnd < 0) throw new Error("delivery receipt writer not found");
const replacement = `async function writeDeliveryReceipt(payload, env = process.env) {
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
  const receiptPath = deliveryPathForToken(immutable.tokenId, env);
  const sameIdentity = (existing) => existing
    && stableStringify(Object.fromEntries(Object.keys(immutable).map((field) => [field, existing[field]]))) === stableStringify(immutable);
  try {
    const existing = JSON.parse(await fs.readFile(receiptPath, "utf8"));
    if (sameIdentity(existing)) return existing;
    throw new Error("dataset delivery receipt identity collision");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      if (/dataset delivery receipt identity collision/.test(str(error?.message))) throw error;
      if (!/Unexpected token|JSON/.test(str(error?.message))) throw error;
    }
  }
  const body = { ...immutable, deliveredAt: new Date().toISOString() };
  const record = { ...body, signature: deliverySignature(body, key) };
  try {
    await atomicWrite(receiptPath, Buffer.from(\`${'${JSON.stringify(record, null, 2)}'}\\n\`, "utf8"));
    return record;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = JSON.parse(await fs.readFile(receiptPath, "utf8"));
    if (!sameIdentity(existing)) throw new Error("dataset delivery receipt identity collision");
    return existing;
  }
}`;
data = `${data.slice(0, functionStart)}${replacement}${data.slice(functionEnd)}`;
write(dataPath, data);

console.log("[data-plane] finalized: candidate probes cannot see grants; repeated valid delivery is idempotent");
