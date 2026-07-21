import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleUrl = pathToFileURL(path.join(
  root,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-outbound-policy.js",
)).href;

const {
  assertComputeUrlAllowed,
  fetchComputeJson,
  isPrivateOrReservedAddress,
  verifyComputeArtifactMaterialization,
} = await import(moduleUrl);

const resolveMap = (entries) => async (hostname) => {
  const value = entries[hostname];
  if (!value) throw new Error(`unmapped host ${hostname}`);
  return (Array.isArray(value) ? value : [value]).map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
};

const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const workSpec = (overrides = {}) => ({
  workSpecHash: "a".repeat(64),
  output: { expectedKinds: ["gguf"], artifactPath: "artifacts/model", ...(overrides.output || {}) },
  ...overrides,
});

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await fn(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("private and reserved address classifier covers metadata, loopback, RFC1918, docs, IPv6 local", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.2", "198.51.100.7", "203.0.113.9", "::1", "fc00::1", "fe80::1", "2001:db8::1"]) {
    assert.equal(isPrivateOrReservedAddress(address), true, address);
  }
  assert.equal(isPrivateOrReservedAddress("8.8.8.8"), false);
  assert.equal(isPrivateOrReservedAddress("2606:4700:4700::1111"), false);
});

test("URL policy rejects credentials, unsupported schemes, private DNS, and allows only explicit private hostnames", async () => {
  await assert.rejects(() => assertComputeUrlAllowed("https://user:pass@example.com/x", { resolveHostname: resolveMap({ "example.com": "8.8.8.8" }) }), /embed credentials/);
  await assert.rejects(() => assertComputeUrlAllowed("ftp://example.com/x", { resolveHostname: resolveMap({ "example.com": "8.8.8.8" }) }), /HTTP or HTTPS/);
  await assert.rejects(() => assertComputeUrlAllowed("http://metadata.test/x", { resolveHostname: resolveMap({ "metadata.test": "169.254.169.254" }) }), /private, loopback/);
  const allowed = await assertComputeUrlAllowed("http://provider.local/x", { privateHostAllowlist: ["provider.local"], resolveHostname: resolveMap({ "provider.local": "127.0.0.1" }) });
  assert.equal(allowed.selected.address, "127.0.0.1");
});

test("provider JSON fetch pins validated DNS, rejects cross-origin and mutating redirects", async () => {
  await withServer((req, res) => {
    if (req.url === "/ok") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === "/private-redirect") {
      res.writeHead(302, { location: `http://metadata.test:${res.socket.localPort}/ok` });
      res.end();
      return;
    }
    if (req.url === "/post-redirect") {
      res.writeHead(307, { location: "/ok" });
      res.end();
      return;
    }
    res.writeHead(404); res.end();
  }, async (port) => {
    const resolver = resolveMap({ "public.test": "127.0.0.1", "metadata.test": "169.254.169.254" });
    const options = { privateHostAllowlist: ["public.test"], resolveHostname: resolver };
    assert.deepEqual(await fetchComputeJson(`http://public.test:${port}/ok`, {}, options), { ok: true });
    await assert.rejects(() => fetchComputeJson(`http://public.test:${port}/private-redirect`, {}, options), /cross-origin redirect refused/);
    await assert.rejects(() => fetchComputeJson(`http://public.test:${port}/post-redirect`, { method: "POST", body: "{}" }, options), /redirects are refused for mutating/);
  });
});

test("provider JSON fetch enforces declared and streamed response ceilings", async () => {
  await withServer((req, res) => {
    if (req.url === "/declared") {
      res.writeHead(200, { "content-type": "application/json", "content-length": "1000" });
      res.end("{}");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ blob: "x".repeat(500) }));
  }, async (port) => {
    const options = { privateHostAllowlist: ["public.test"], resolveHostname: resolveMap({ "public.test": "127.0.0.1" }), maxBytes: 100 };
    await assert.rejects(() => fetchComputeJson(`http://public.test:${port}/declared`, {}, options), /declares 1000 bytes/);
    await assert.rejects(() => fetchComputeJson(`http://public.test:${port}/streamed`, {}, options), /exceeds 100 bytes/);
  });
});

test("HTTP artifact verification streams bytes, revalidates redirects, binds kind/work-spec/hash/size", async () => {
  const bytes = Buffer.from("governed artifact bytes");
  await withServer((req, res) => {
    if (req.url === "/artifact") {
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": String(bytes.length) });
      res.end(bytes);
      return;
    }
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/artifact" }); res.end(); return;
    }
    if (req.url === "/private-redirect") {
      res.writeHead(302, { location: `http://metadata.test:${res.socket.localPort}/artifact` }); res.end(); return;
    }
    res.writeHead(404); res.end();
  }, async (port) => {
    const options = { privateHostAllowlist: ["artifact.test"], resolveHostname: resolveMap({ "artifact.test": "127.0.0.1", "metadata.test": "169.254.169.254" }), maxBytes: 1024 };
    const artifact = { kind: "gguf", locator: `http://artifact.test:${port}/redirect`, sha256: sha(bytes), sizeBytes: bytes.length, workSpecHash: "a".repeat(64) };
    const verified = await verifyComputeArtifactMaterialization(artifact, workSpec(), options);
    assert.equal(verified.verifiedSha256, sha(bytes));
    assert.equal(verified.verificationKind, "streamed-http-sha256");
    await assert.rejects(() => verifyComputeArtifactMaterialization({ ...artifact, kind: "adapter" }, workSpec(), options), /not allowed/);
    await assert.rejects(() => verifyComputeArtifactMaterialization({ ...artifact, workSpecHash: "b".repeat(64) }, workSpec(), options), /lineage mismatch/);
    await assert.rejects(() => verifyComputeArtifactMaterialization({ ...artifact, sha256: "0".repeat(64) }, workSpec(), options), /does not match/);
    await assert.rejects(() => verifyComputeArtifactMaterialization({ ...artifact, sizeBytes: bytes.length + 1 }, workSpec(), options), /size .* does not match/);
    await assert.rejects(() => verifyComputeArtifactMaterialization({ ...artifact, locator: `http://artifact.test:${port}/private-redirect` }, workSpec(), options), /private, loopback/);
  });
});

test("HTTP artifact verifier stops oversized streams before hashing them as trusted", async () => {
  await withServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.write(Buffer.alloc(80));
    res.end(Buffer.alloc(80));
  }, async (port) => {
    const artifact = { kind: "gguf", locator: `http://artifact.test:${port}/large`, sha256: "0".repeat(64), workSpecHash: "a".repeat(64) };
    await assert.rejects(() => verifyComputeArtifactMaterialization(artifact, workSpec(), { privateHostAllowlist: ["artifact.test"], resolveHostname: resolveMap({ "artifact.test": "127.0.0.1" }), maxBytes: 100 }), /exceeds 100 bytes/);
  });
});

test("local artifact verification permits regular files only inside governed root and expected output path", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "gh-compute-outbound-"));
  try {
    const root = path.join(tmp, "artifacts");
    const expected = path.join(root, "model");
    await fsp.mkdir(expected, { recursive: true });
    const file = path.join(expected, "model.gguf");
    const bytes = Buffer.from("local governed artifact");
    await fsp.writeFile(file, bytes);
    const spec = workSpec({ output: { expectedKinds: ["gguf"], artifactPath: expected } });
    const artifact = { kind: "gguf", locator: file, sha256: sha(bytes), sizeBytes: bytes.length, workSpecHash: "a".repeat(64) };
    const verified = await verifyComputeArtifactMaterialization(artifact, spec, { artifactRoot: root, maxBytes: 1024 });
    assert.equal(verified.verificationKind, "streamed-file-sha256");

    const outside = path.join(tmp, "outside.gguf");
    await fsp.writeFile(outside, bytes);
    await assert.rejects(() => verifyComputeArtifactMaterialization({ ...artifact, locator: outside }, spec, { artifactRoot: root, maxBytes: 1024 }), /escapes/);
    await assert.rejects(() => verifyComputeArtifactMaterialization({ ...artifact, locator: `${expected}/../model/model.gguf` }, spec, { artifactRoot: root, maxBytes: 1024 }), /parent traversal/);

    const symlink = path.join(expected, "link.gguf");
    await fsp.symlink(outside, symlink);
    await assert.rejects(() => verifyComputeArtifactMaterialization({ ...artifact, locator: symlink }, spec, { artifactRoot: root, maxBytes: 1024 }), /escapes|symbolic link/);
    await assert.rejects(() => verifyComputeArtifactMaterialization({ ...artifact, locator: expected }, spec, { artifactRoot: root, maxBytes: 1024 }), /regular file/);
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});
