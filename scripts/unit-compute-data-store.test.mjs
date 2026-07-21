import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleUrl = pathToFileURL(path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-data-store.js",
)).href;
const { resolveComputeDataStore } = await import(moduleUrl);

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function consume(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("local store is atomic and content addressed", async () => {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "compute-store-"));
  try {
    const store = resolveComputeDataStore({ env: { NODE_ENV: "test", GROWTHUB_COMPUTE_DATA_ROOT: dataRoot } });
    assert.equal(store.kind, "filesystem");
    const bytes = Buffer.from('{"x":1}\n');
    const digest = sha(bytes);
    assert.equal((await store.putDataset({ corpusSha256: digest, bytes })).created, true);
    assert.equal((await store.putDataset({ corpusSha256: digest, bytes })).created, false);
    const opened = await store.openDataset({ corpusSha256: digest, sizeBytes: bytes.length });
    assert.deepEqual(await consume(opened.stream), bytes);
    const receipt = Buffer.from('{"ok":true}\n');
    await store.putDeliveryReceipt({ tokenId: "token-1", bytes: receipt });
    assert.deepEqual(await store.getDeliveryReceipt({ tokenId: "token-1" }), receipt);
  } finally {
    await fs.rm(dataRoot, { recursive: true, force: true });
  }
});

test("ephemeral production refuses filesystem storage", () => {
  assert.throws(
    () => resolveComputeDataStore({ env: { NODE_ENV: "production", VERCEL: "1" } }),
    (error) => error?.code === "durable-compute-data-store-required",
  );
});

function fakeSupabase() {
  const objects = new Map();
  const secret = "service-role-secret";
  const objectKey = (url) => {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const authenticated = parts.includes("authenticated");
    const start = parts.indexOf("object") + 1 + (authenticated ? 1 : 0);
    return decodeURIComponent(parts.slice(start + 1).join("/"));
  };
  const fetchImpl = async (url, init = {}) => {
    assert.equal(String(init.headers?.authorization || "").includes(secret), true);
    const key = objectKey(url);
    if (init.method === "POST") {
      if (objects.has(key)) return new Response(JSON.stringify({ error: "Duplicate" }), { status: 409, headers: { "content-type": "application/json" } });
      objects.set(key, Buffer.from(init.body));
      return new Response(JSON.stringify({ Key: key }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (!objects.has(key)) return new Response("missing", { status: 404 });
    const bytes = objects.get(key);
    return new Response(bytes, { status: 200, headers: { "content-length": String(bytes.length) } });
  };
  return { fetchImpl, objects, secret };
}

test("Supabase Storage backend is durable, immutable, and secret-free", async () => {
  const fake = fakeSupabase();
  const env = {
    NODE_ENV: "production",
    VERCEL: "1",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: fake.secret,
    GROWTHUB_COMPUTE_STORAGE_BUCKET: "growthub-compute",
  };
  const store = resolveComputeDataStore({ env, fetchImpl: fake.fetchImpl });
  assert.equal(store.kind, "supabase-storage");
  assert.equal(store.durable, true);
  assert.equal(JSON.stringify(store).includes(fake.secret), false);
  const bytes = Buffer.from("remote dataset\n");
  const digest = sha(bytes);
  assert.equal((await store.putDataset({ corpusSha256: digest, bytes })).created, true);
  assert.equal((await store.putDataset({ corpusSha256: digest, bytes })).created, false);
  const opened = await store.openDataset({ corpusSha256: digest, sizeBytes: bytes.length });
  assert.deepEqual(await consume(opened.stream), bytes);
  const receipt = Buffer.from('{"delivered":true}\n');
  await store.putDeliveryReceipt({ tokenId: "token-2", bytes: receipt });
  assert.deepEqual(await store.getDeliveryReceipt({ tokenId: "token-2" }), receipt);
});

test("Supabase backend refuses insecure production URL and invalid digest", async () => {
  const fake = fakeSupabase();
  assert.throws(
    () => resolveComputeDataStore({ env: { NODE_ENV: "production", VERCEL: "1", SUPABASE_URL: "http://example.com", SUPABASE_SERVICE_ROLE_KEY: fake.secret }, fetchImpl: fake.fetchImpl }),
    (error) => error?.code === "compute-data-store-invalid",
  );
  const store = resolveComputeDataStore({ env: { NODE_ENV: "test", SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: fake.secret }, fetchImpl: fake.fetchImpl });
  await assert.rejects(
    () => store.putDataset({ corpusSha256: "0".repeat(64), bytes: Buffer.from("wrong") }),
    (error) => error?.code === "compute-data-digest-mismatch",
  );
});
