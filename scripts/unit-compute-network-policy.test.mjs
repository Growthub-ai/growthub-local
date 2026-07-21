import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");
const moduleUrl = pathToFileURL(path.join(app, "lib/compute-network-policy.js")).href;
const {
  authorizeComputeUrl,
  createGovernedComputeFetchJson,
  privateOrReservedAddress,
  verifyGovernedComputeArtifact,
} = await import(moduleUrl);

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => server.close(resolve));
const privateEnv = {
  GROWTHUB_COMPUTE_NETWORK_ALLOWLIST: "127.0.0.1",
  GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST: "127.0.0.1",
};
const workSpec = (output = {}) => ({
  workSpecHash: "a".repeat(64),
  output: { expectedKinds: ["gguf"], ...output },
});

function artifact({ locator, sha256, sizeBytes = 0, kind = "gguf", workSpecHash = "a".repeat(64) }) {
  return { locator, sha256, sizeBytes, kind, workSpecHash };
}

test("private/reserved classifier covers loopback, cloud metadata, RFC1918, documentation, ULA and public", () => {
  for (const address of ["127.0.0.1", "169.254.169.254", "100.100.100.200", "10.1.2.3", "198.51.100.7", "203.0.113.9", "fc00::1", "2001:db8::1"]) {
    assert.equal(privateOrReservedAddress(address), true, address);
  }
  assert.equal(privateOrReservedAddress("8.8.8.8"), false);
});

test("URL authorization rejects credentials, unsupported schemes, metadata, unallowlisted and private resolution", async () => {
  await assert.rejects(() => authorizeComputeUrl("ftp://example.com/x"), /HTTP\(S\)/);
  await assert.rejects(() => authorizeComputeUrl("https://u:p@example.com/x", { resolveHostname: async () => [{ address: "8.8.8.8", family: 4 }] }), /credentials/);
  await assert.rejects(() => authorizeComputeUrl("http://169.254.169.254/latest", { env: privateEnv }), /forbidden/);
  await assert.rejects(() => authorizeComputeUrl("http://100.100.100.200/latest", { env: { GROWTHUB_COMPUTE_NETWORK_ALLOWLIST: "100.100.100.200", GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST: "100.100.100.200" } }), /forbidden/);
  await assert.rejects(() => authorizeComputeUrl("https://example.com/x", { resolveHostname: async () => [{ address: "8.8.8.8", family: 4 }] }), /operator allowlist/);
  await assert.rejects(() => authorizeComputeUrl("https://allowed.example/x", { env: { GROWTHUB_COMPUTE_NETWORK_ALLOWLIST: "allowed.example" }, resolveHostname: async () => [{ address: "10.0.0.1", family: 4 }] }), /private/);
  const approved = await authorizeComputeUrl("https://allowed.example/x", { env: { GROWTHUB_COMPUTE_NETWORK_ALLOWLIST: "allowed.example", GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST: "allowed.example" }, resolveHostname: async () => [{ address: "10.0.0.1", family: 4 }] });
  assert.equal(approved.address, "10.0.0.1");
});

test("DNS answers cannot launder metadata or mixed public/private rebinding targets", async () => {
  const env = {
    GROWTHUB_COMPUTE_NETWORK_ALLOWLIST: "allowed.example",
    GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST: "allowed.example",
  };
  await assert.rejects(
    () => authorizeComputeUrl("https://allowed.example/x", { env, resolveHostname: async () => [{ address: "100.100.100.200", family: 4 }] }),
    /metadata-service/,
  );
  await assert.rejects(
    () => authorizeComputeUrl("https://allowed.example/x", {
      env,
      resolveHostname: async () => [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }],
    }),
    /mixed public\/private/,
  );
});

test("governed JSON fetch pins an approved address, refuses redirects and bounds responses", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/ok") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ ok: true })); return; }
    if (req.url === "/redirect") { res.statusCode = 302; res.setHeader("location", "http://169.254.169.254/latest"); res.end(); return; }
    if (req.url === "/large") { res.end("x".repeat(2048)); return; }
    res.statusCode = 404; res.end();
  });
  const port = await listen(server);
  try {
    const fetchJson = createGovernedComputeFetchJson({ env: privateEnv, maxResponseBytes: 1024 });
    assert.deepEqual(await fetchJson(`http://127.0.0.1:${port}/ok`), { ok: true });
    await assert.rejects(() => fetchJson(`http://127.0.0.1:${port}/redirect`), /redirects are refused/);
    await assert.rejects(() => fetchJson(`http://127.0.0.1:${port}/large`), /exceeds 1024 bytes/);
  } finally {
    await close(server);
  }
});

test("artifact verification streams approved HTTP bytes and binds hash, size, kind and work-spec lineage", async () => {
  const bytes = Buffer.from("governed artifact bytes\n");
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const server = http.createServer((_req, res) => res.end(bytes));
  const port = await listen(server);
  try {
    const locator = `http://127.0.0.1:${port}/artifact`;
    const spec = workSpec();
    const verified = await verifyGovernedComputeArtifact({ artifact: artifact({ locator, sha256, sizeBytes: bytes.length }), workSpec: spec, env: privateEnv });
    assert.equal(verified.verifiedSha256, sha256);
    assert.equal(verified.verificationKind, "governed-http-stream");
    await assert.rejects(() => verifyGovernedComputeArtifact({ artifact: artifact({ locator, sha256: "0".repeat(64), sizeBytes: bytes.length }), workSpec: spec, env: privateEnv }), /does not match/);
    await assert.rejects(() => verifyGovernedComputeArtifact({ artifact: artifact({ locator, sha256, sizeBytes: bytes.length + 1 }), workSpec: spec, env: privateEnv }), /size does not match/);
    await assert.rejects(() => verifyGovernedComputeArtifact({ artifact: artifact({ locator, sha256, sizeBytes: bytes.length, workSpecHash: "b".repeat(64) }), workSpec: spec, env: privateEnv }), /lineage mismatch/);
    await assert.rejects(() => verifyGovernedComputeArtifact({ artifact: artifact({ locator, sha256, kind: "unexpected" }), workSpec: spec, env: privateEnv }), /not allowed by the work spec/);
  } finally {
    await close(server);
  }
});

test("artifact verification refuses redirects, encoded responses and oversized bodies", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/redirect") { res.statusCode = 302; res.setHeader("location", "/artifact"); res.end(); return; }
    if (req.url === "/large") { res.end(Buffer.alloc(2048)); return; }
    if (req.url === "/encoded") { res.setHeader("content-encoding", "gzip"); res.end("not-really-gzip"); return; }
    res.end("x");
  });
  const port = await listen(server);
  try {
    const env = { ...privateEnv, GROWTHUB_COMPUTE_ARTIFACT_MAX_BYTES: "1024" };
    const spec = workSpec();
    await assert.rejects(() => verifyGovernedComputeArtifact({ artifact: artifact({ locator: `http://127.0.0.1:${port}/redirect`, sha256: "0".repeat(64) }), workSpec: spec, env }), /redirects are refused/);
    await assert.rejects(() => verifyGovernedComputeArtifact({ artifact: artifact({ locator: `http://127.0.0.1:${port}/large`, sha256: "0".repeat(64) }), workSpec: spec, env }), /exceeds 1024 bytes/);
    await assert.rejects(() => verifyGovernedComputeArtifact({ artifact: artifact({ locator: `http://127.0.0.1:${port}/encoded`, sha256: "0".repeat(64) }), workSpec: spec, env }), /content-encoding/);
  } finally {
    await close(server);
  }
});

test("local artifact verification enforces governed roots, expected output path, regular files, traversal and symlink escape", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "growthub-compute-network-"));
  const rootDir = path.join(tmp, "artifacts");
  const outside = path.join(tmp, "outside");
  fs.mkdirSync(rootDir, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  const expectedDir = path.join(rootDir, "run-1");
  fs.mkdirSync(expectedDir);
  const artifactPath = path.join(expectedDir, "model.gguf");
  const bytes = Buffer.from("local governed artifact\n");
  fs.writeFileSync(artifactPath, bytes);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const env = { GROWTHUB_COMPUTE_ARTIFACT_ROOTS: rootDir, GROWTHUB_COMPUTE_ARTIFACT_MAX_BYTES: "1024" };
  const spec = workSpec({ artifactPath: expectedDir });
  try {
    const verified = await verifyGovernedComputeArtifact({ artifact: artifact({ locator: artifactPath, sha256, sizeBytes: bytes.length }), workSpec: spec, env });
    assert.equal(verified.verifiedSha256, sha256);
    const outsidePath = path.join(outside, "model.gguf");
    fs.writeFileSync(outsidePath, bytes);
    await assert.rejects(() => verifyGovernedComputeArtifact({ artifact: artifact({ locator: outsidePath, sha256, sizeBytes: bytes.length }), workSpec: spec, env }), /outside/);
    await assert.rejects(() => verifyGovernedComputeArtifact({ artifact: artifact({ locator: `${expectedDir}/../run-1/model.gguf`, sha256, sizeBytes: bytes.length }), workSpec: spec, env }), /parent traversal/);
    const link = path.join(expectedDir, "link.gguf");
    fs.symlinkSync(outsidePath, link);
    await assert.rejects(() => verifyGovernedComputeArtifact({ artifact: artifact({ locator: link, sha256, sizeBytes: bytes.length }), workSpec: spec, env }), /symbolic link|escapes/);
    await assert.rejects(() => verifyGovernedComputeArtifact({ artifact: artifact({ locator: expectedDir, sha256, sizeBytes: bytes.length }), workSpec: spec, env }), /regular file/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("registered remote adapters replace caller transport with the canonical governed fetch", async () => {
  const registryUrl = pathToFileURL(path.join(app, "lib/adapters/compute/compute-adapter-registry.js")).href;
  const { registerComputeProviderAdapter, getComputeProviderAdapter } = await import(registryUrl);
  registerComputeProviderAdapter({
    id: "canonical-network-policy-test",
    locality: "remote",
    describeCapabilities: () => ({}),
    inspectCapacity: async (ctx) => ctx.fetchJson("http://127.0.0.1:9/private"),
    allocate: async () => ({}), execute: async () => [], status: async () => [],
    resume: async () => [], cancel: async () => [], release: async () => [],
  });
  const registered = getComputeProviderAdapter("canonical-network-policy-test");
  let attackerFetchCalls = 0;
  const previousPublic = process.env.GROWTHUB_COMPUTE_NETWORK_ALLOWLIST;
  const previousPrivate = process.env.GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST;
  delete process.env.GROWTHUB_COMPUTE_NETWORK_ALLOWLIST;
  delete process.env.GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST;
  try {
    await assert.rejects(
      () => registered.inspectCapacity({ fetchJson: async () => { attackerFetchCalls += 1; return { bypass: true }; } }),
      /operator allowlist/,
    );
    assert.equal(attackerFetchCalls, 0, "caller-injected transport never executes");
  } finally {
    if (previousPublic === undefined) delete process.env.GROWTHUB_COMPUTE_NETWORK_ALLOWLIST;
    else process.env.GROWTHUB_COMPUTE_NETWORK_ALLOWLIST = previousPublic;
    if (previousPrivate === undefined) delete process.env.GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST;
    else process.env.GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST = previousPrivate;
  }
});
