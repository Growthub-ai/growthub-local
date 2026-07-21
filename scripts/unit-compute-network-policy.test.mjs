import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleUrl = pathToFileURL(path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-network-policy.js")).href;
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

test("private/reserved address classifier covers loopback, metadata, RFC1918, ULA and public", () => {
  assert.equal(privateOrReservedAddress("127.0.0.1"), true);
  assert.equal(privateOrReservedAddress("169.254.169.254"), true);
  assert.equal(privateOrReservedAddress("10.1.2.3"), true);
  assert.equal(privateOrReservedAddress("fc00::1"), true);
  assert.equal(privateOrReservedAddress("8.8.8.8"), false);
});

test("URL authorization rejects credentials, unsupported schemes, metadata, unallowlisted and private resolution", async () => {
  await assert.rejects(() => authorizeComputeUrl("ftp://example.com/x"), /HTTP\(S\)/);
  await assert.rejects(() => authorizeComputeUrl("https://u:p@example.com/x", { resolveHostname: async () => [{ address: "8.8.8.8", family: 4 }] }), /credentials/);
  await assert.rejects(() => authorizeComputeUrl("http://169.254.169.254/latest", { env: privateEnv }), /forbidden/);
  await assert.rejects(() => authorizeComputeUrl("https://example.com/x", { resolveHostname: async () => [{ address: "8.8.8.8", family: 4 }] }), /operator allowlist/);
  await assert.rejects(() => authorizeComputeUrl("https://allowed.example/x", { env: { GROWTHUB_COMPUTE_NETWORK_ALLOWLIST: "allowed.example" }, resolveHostname: async () => [{ address: "10.0.0.1", family: 4 }] }), /private/);
  const approved = await authorizeComputeUrl("https://allowed.example/x", { env: { GROWTHUB_COMPUTE_NETWORK_ALLOWLIST: "allowed.example", GROWTHUB_COMPUTE_PRIVATE_NETWORK_ALLOWLIST: "allowed.example" }, resolveHostname: async () => [{ address: "10.0.0.1", family: 4 }] });
  assert.equal(approved.address, "10.0.0.1");
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

test("artifact verification streams approved HTTP bytes and refuses a hash mismatch", async () => {
  const bytes = Buffer.from("governed artifact bytes\n");
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const server = http.createServer((_req, res) => res.end(bytes));
  const port = await listen(server);
  try {
    const verified = await verifyGovernedComputeArtifact({ artifact: { locator: `http://127.0.0.1:${port}/artifact`, sha256, sizeBytes: bytes.length, kind: "gguf" }, workSpec: { output: { expectedKinds: ["gguf"] } }, env: privateEnv });
    assert.equal(verified.verifiedSha256, sha256);
    assert.equal(verified.verificationKind, "governed-http-stream");
    await assert.rejects(() => verifyGovernedComputeArtifact({ artifact: { locator: `http://127.0.0.1:${port}/artifact`, sha256: "0".repeat(64), sizeBytes: bytes.length, kind: "gguf" }, workSpec: { output: { expectedKinds: ["gguf"] } }, env: privateEnv }), /does not match/);
  } finally {
    await close(server);
  }
});

test("local artifact verification enforces governed roots, expected output path, regular files and symlink escape", async () => {
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
  try {
    const verified = await verifyGovernedComputeArtifact({ artifact: { locator: artifactPath, sha256, sizeBytes: bytes.length, kind: "gguf" }, workSpec: { output: { artifactPath: expectedDir, expectedKinds: ["gguf"] } }, env });
    assert.equal(verified.verifiedSha256, sha256);
    const outsidePath = path.join(outside, "model.gguf");
    fs.writeFileSync(outsidePath, bytes);
    await assert.rejects(() => verifyGovernedComputeArtifact({ artifact: { locator: outsidePath, sha256, sizeBytes: bytes.length, kind: "gguf" }, workSpec: { output: { artifactPath: expectedDir, expectedKinds: ["gguf"] } }, env }), /outside/);
    const link = path.join(expectedDir, "link.gguf");
    fs.symlinkSync(outsidePath, link);
    await assert.rejects(() => verifyGovernedComputeArtifact({ artifact: { locator: link, sha256, sizeBytes: bytes.length, kind: "gguf" }, workSpec: { output: { artifactPath: expectedDir, expectedKinds: ["gguf"] } }, env }), /symbolic link|escapes/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
