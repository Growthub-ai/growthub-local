/**
 * Focused llama.cpp b10068 adapter/process-pool tests.
 * Run with: node --test scripts/unit-llama-cpp-adapter.test.mjs
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulePath = path.join(
  repoRoot,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/inference/llama-cpp.js",
);
const {
  LlamaCppAdapterError,
  LlamaCppProcessPool,
  buildCompositeLlamaAlias,
  buildLlamaCppRequestBody,
  buildLlamaServerArgv,
  hashPromptPrefix,
  mapLoraRefToRequest,
  selectPhasePool,
  verifyLlamaCppArtifacts,
} = await import(pathToFileURL(modulePath).href);

const digest = (value) => createHash("sha256").update(value).digest("hex");

function fakeFilesystem(entries) {
  const files = new Map(Object.entries(entries).map(([filePath, value]) => [filePath, Buffer.from(value)]));
  const directories = new Set([path.parse([...files.keys()][0] || "/").root || "/"]);
  for (const filePath of files.keys()) {
    let directory = path.dirname(filePath);
    while (directory && !directories.has(directory)) {
      directories.add(directory);
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  return {
    realpathImpl: async (filePath) => {
      if (!files.has(filePath) && !directories.has(filePath)) throw new Error(`ENOENT: ${filePath}`);
      return filePath;
    },
    statImpl: async (filePath) => {
      if (files.has(filePath)) return { isFile: () => true };
      if (directories.has(filePath)) return { isFile: () => false };
      throw new Error(`ENOENT: ${filePath}`);
    },
    createReadStreamImpl: (filePath) => {
      if (!files.has(filePath)) throw new Error(`ENOENT: ${filePath}`);
      return Readable.from([files.get(filePath)]);
    },
  };
}

class FakeChild extends EventEmitter {
  constructor(pid) {
    super();
    this.pid = pid;
    this.killSignals = [];
  }

  kill(signal) {
    this.killSignals.push(signal);
    this.emit("exit", 0, signal);
    return true;
  }
}

function poolFixture({ files, maxInstances = 4, completionResponse, poolOptions = {} } = {}) {
  const fs = fakeFilesystem(files);
  const spawns = [];
  const fetches = [];
  const children = [];
  let nextPid = 4100;
  let nextPort = 19100;
  let clock = 1_000;
  const pool = new LlamaCppProcessPool({
    maxInstances,
    spawnImpl: (binary, argv, options) => {
      const child = new FakeChild(nextPid++);
      children.push(child);
      spawns.push({ binary, argv, options, child });
      return child;
    },
    fetchImpl: async (url, init) => {
      fetches.push({ url: String(url), init });
      if (String(url).endsWith("/health")) return { ok: true, status: 200 };
      return completionResponse || { ok: true, status: 200 };
    },
    allocatePortImpl: async ({ host }) => {
      assert.equal(host, "127.0.0.1");
      return nextPort++;
    },
    nowImpl: () => ++clock,
    sleepImpl: async () => {},
    shutdownGraceMs: 0,
    ...fs,
    ...poolOptions,
  });
  return { pool, spawns, fetches, children };
}

function model(filePath, bytes) {
  return { path: filePath, sha256: digest(bytes) };
}

function lora(ref, filePath, bytes, scale = 1) {
  return { ref, path: filePath, sha256: digest(bytes), defaultScale: scale };
}

test("safe argv is a shell-free b10068 flag vector with repeated preloaded LoRAs", () => {
  const argv = buildLlamaServerArgv({
    modelPath: "/models/base model $(not-a-shell).gguf",
    alias: "growthub-prefill-deadbeef",
    port: 19001,
    cacheTypeK: "q8_0",
    serverConfig: {
      threads: 8,
      ctxSize: 8192,
      batchSize: 1024,
      ubatchSize: 256,
      gpuLayers: 48,
    },
    allowedAdapters: [
      { path: "/adapters/support.gguf", defaultScale: 1 },
      { path: "/adapters/finance.gguf", defaultScale: 0.5 },
    ],
  });

  assert.deepEqual(argv, [
    "--model", "/models/base model $(not-a-shell).gguf",
    "--alias", "growthub-prefill-deadbeef",
    "--host", "127.0.0.1",
    "--port", "19001",
    "--cache-prompt",
    "--cache-type-k", "q8_0",
    "--threads", "8",
    "--ctx-size", "8192",
    "--batch-size", "1024",
    "--ubatch-size", "256",
    "--n-gpu-layers", "48",
    "--lora", "/adapters/support.gguf",
    "--lora-scaled", "/adapters/finance.gguf:0.5",
    "--lora-init-without-apply",
  ]);
  assert.throws(
    () => buildLlamaServerArgv({ modelPath: "/m.gguf", alias: "m", port: 1, host: "0.0.0.0" }),
    (error) => error instanceof LlamaCppAdapterError && error.code === "NON_LOOPBACK_ENDPOINT",
  );
  assert.throws(
    () => buildLlamaServerArgv({ modelPath: "/m.gguf", alias: "m", port: 1, cacheTypeK: "made-up" }),
    (error) => error.code === "INVALID_CACHE_TYPE_K",
  );
  assert.throws(
    () => buildLlamaServerArgv({
      modelPath: "/m.gguf",
      alias: "m",
      port: 1,
      allowedAdapters: [{ path: "C:\\adapter.gguf", defaultScale: 0.5 }],
    }),
    (error) => error.code === "AMBIGUOUS_LORA_PATH",
  );
  assert.throws(
    () => buildLlamaServerArgv({
      modelPath: "/m.gguf",
      alias: "m",
      port: 1,
      serverConfig: { extraArgs: "--jinja; rm -rf /" },
    }),
    (error) => error.code === "INVALID_SERVER_CONFIG",
  );
  assert.throws(
    () => buildLlamaServerArgv({
      modelPath: "/m.gguf",
      alias: "m",
      port: 1,
      serverConfig: { batchSize: 32, ubatchSize: 64 },
    }),
    (error) => error.code === "INVALID_SERVER_CONFIG",
  );
  assert.throws(
    () => buildLlamaServerArgv({
      modelPath: "/m.gguf",
      alias: "m",
      port: 1,
      serverConfig: { threads: "8" },
    }),
    (error) => error.code === "INVALID_SERVER_CONFIG",
  );
  assert.throws(
    () => buildLlamaServerArgv({ modelPath: "/m.gguf", alias: "unsafe alias", port: 1 }),
    (error) => error.code === "INVALID_ALIAS",
  );
});

test("actual base and adapter bytes are SHA-256 verified before ids are assigned", async () => {
  const fs = fakeFilesystem({
    "/models/base.gguf": "base-bytes",
    "/adapters/zeta.gguf": "zeta-bytes",
    "/adapters/alpha.gguf": "alpha-bytes",
  });
  const verified = await verifyLlamaCppArtifacts({
    model: model("/models/base.gguf", "base-bytes"),
    allowedAdapters: [
      lora("zeta", "/adapters/zeta.gguf", "zeta-bytes"),
      lora("alpha", "/adapters/alpha.gguf", "alpha-bytes", 0.25),
    ],
  }, fs);

  assert.equal(verified.model.sha256, digest("base-bytes"));
  assert.deepEqual(
    verified.adapters.map((adapter) => [adapter.ref, adapter.adapterId, adapter.defaultScale]),
    [["alpha", 0, 0.25], ["zeta", 1, 1]],
  );

  await assert.rejects(
    verifyLlamaCppArtifacts({
      model: { path: "/models/base.gguf", sha256: digest("wrong") },
      allowedAdapters: [],
    }, fs),
    (error) => error.code === "ARTIFACT_HASH_MISMATCH" && error.details.actualSha256 === digest("base-bytes"),
  );
});

test("artifacts must be regular files confined to optional operator roots", async () => {
  const fs = fakeFilesystem({
    "/models/base.gguf": "base-bytes",
    "/adapters/support.gguf": "adapter-bytes",
  });
  const verified = await verifyLlamaCppArtifacts({
    model: model("/models/base.gguf", "base-bytes"),
    allowedAdapters: [lora("support", "/adapters/support.gguf", "adapter-bytes")],
  }, {
    ...fs,
    allowedArtifactRoots: ["/models", "/adapters"],
  });
  assert.equal(verified.model.path, "/models/base.gguf");

  await assert.rejects(
    verifyLlamaCppArtifacts({
      model: model("/models/base.gguf", "base-bytes"),
      allowedAdapters: [lora("support", "/adapters/support.gguf", "adapter-bytes")],
    }, {
      ...fs,
      allowedArtifactRoots: ["/models"],
    }),
    (error) => error.code === "ARTIFACT_OUTSIDE_ALLOWED_ROOTS"
      && error.details.path === "/adapters/support.gguf",
  );

  await assert.rejects(
    verifyLlamaCppArtifacts({
      model: model("/models/base.gguf", "base-bytes"),
      allowedAdapters: [],
    }, {
      ...fs,
      statImpl: async () => ({ isFile: () => false }),
    }),
    (error) => error.code === "ARTIFACT_NOT_REGULAR_FILE",
  );

  const symlinkFs = fakeFilesystem({
    "/models/anchor.gguf": "anchor",
    "/outside/escaped.gguf": "escaped",
  });
  await assert.rejects(
    verifyLlamaCppArtifacts({
      model: model("/models/link.gguf", "escaped"),
      allowedAdapters: [],
    }, {
      ...symlinkFs,
      realpathImpl: async (filePath) => (
        filePath === "/models/link.gguf"
          ? "/outside/escaped.gguf"
          : symlinkFs.realpathImpl(filePath)
      ),
      allowedArtifactRoots: ["/models"],
    }),
    (error) => error.code === "ARTIFACT_OUTSIDE_ALLOWED_ROOTS"
      && error.details.path === "/outside/escaped.gguf",
  );
});

test("request mapping replaces untrusted numeric LoRA ids with the preloaded ref id", () => {
  const allowedAdapters = [
    { ref: "alpha", adapterId: 0, defaultScale: 0.25 },
    { ref: "zeta", adapterId: 1, defaultScale: 1 },
  ];
  assert.deepEqual(mapLoraRefToRequest("zeta", allowedAdapters, 0.75), [{ id: 1, scale: 0.75 }]);
  const body = buildLlamaCppRequestBody({
    body: {
      model: "caller-spoofed-model",
      messages: [{ role: "user", content: "hello" }],
      lora: [{ id: 999, scale: 99 }],
      lora_ref: "alpha",
      lora_scale: 0.6,
    },
    modelAlias: "verified-composite-alias",
    allowedAdapters,
  });
  assert.equal(body.model, "verified-composite-alias");
  assert.deepEqual(body.lora, [{ id: 0, scale: 0.6 }]);
  assert.equal("lora_ref" in body, false);
  assert.equal("lora_scale" in body, false);
  assert.throws(
    () => mapLoraRefToRequest("not-allowed", allowedAdapters),
    (error) => error.code === "LORA_NOT_ALLOWED",
  );
  assert.throws(
    () => mapLoraRefToRequest("alpha", allowedAdapters, 16.01),
    (error) => error.code === "INVALID_LORA_SCALE",
  );
  assert.throws(
    () => mapLoraRefToRequest("", allowedAdapters, 1),
    (error) => error.code === "LORA_SCALE_WITHOUT_ADAPTER",
  );
});

test("composite alias is phase-stable and changes with the adapter set", () => {
  const modelSha256 = digest("base");
  const adapters = [{ ref: "support", sha256: digest("support"), defaultScale: 1 }];
  const prefill = buildCompositeLlamaAlias({
    modelSha256,
    adapters,
    poolRole: "prefill_pool",
    aliasPrefix: "tenant-a",
  });
  const decode = buildCompositeLlamaAlias({
    modelSha256,
    adapters,
    poolRole: "decode_pool",
    aliasPrefix: "tenant-a",
  });
  assert.equal(prefill, decode);
  assert.notEqual(
    prefill,
    buildCompositeLlamaAlias({
      modelSha256,
      adapters: [{ ...adapters[0], sha256: digest("support-v2") }],
      poolRole: "prefill_pool",
      aliasPrefix: "tenant-a",
    }),
  );
  assert.notEqual(
    prefill,
    buildCompositeLlamaAlias({ modelSha256, adapters, poolRole: "prefill_pool", aliasPrefix: "tenant-b" }),
  );
});

test("phase routing is single-endpoint, threshold-exact, and fails closed for native PD", () => {
  assert.equal(selectPhasePool({ contextTokens: 2049 }), "prefill_pool");
  assert.equal(selectPhasePool({ contextTokens: 2049, stream: true }), "prefill_pool");
  assert.equal(selectPhasePool({ contextTokens: 2048, stream: true }), "decode_pool");
  assert.equal(selectPhasePool({ contextTokens: 2048, stream: false }), "unified_pool");
  assert.throws(
    () => selectPhasePool({ contextTokens: 4096, nativeDisaggregationRequired: true }),
    (error) => error.code === "NATIVE_PD_HANDOFF_UNAVAILABLE",
  );
});

test("pool ensures one long-lived verified process and returns gateway-ready evidence", async () => {
  const files = {
    "/models/base.gguf": "base-bytes",
    "/adapters/zeta.gguf": "zeta-bytes",
    "/adapters/alpha.gguf": "alpha-bytes",
  };
  const { pool, spawns, fetches, children } = poolFixture({ files });
  const spec = {
    model: model("/models/base.gguf", "base-bytes"),
    allowedAdapters: [
      lora("zeta", "/adapters/zeta.gguf", "zeta-bytes"),
      lora("alpha", "/adapters/alpha.gguf", "alpha-bytes", 0.25),
    ],
    loraRef: "zeta",
    contextTokens: 4096,
    cacheTypeK: "q4_0",
  };
  const first = await pool.ensure(spec);
  assert.equal(first.coldStart, true);
  assert.equal(first.poolRole, "prefill_pool");
  assert.equal(first.modelSha256, digest("base-bytes"));
  assert.equal(first.adapterSha256, digest("zeta-bytes"));
  assert.equal(first.adapterId, 1, "sorted preload order is the upstream request id");
  assert.equal(first.baseUrl, "http://127.0.0.1:19100");
  assert.equal(first.nativeStateHandoff, false);
  assert.equal(spawns.length, 1);
  assert.equal(spawns[0].binary, "llama-server");
  assert.equal(spawns[0].options.shell, false);
  assert.deepEqual(
    spawns[0].argv.filter((value) => value === "--lora" || value === "--lora-scaled"),
    ["--lora-scaled", "--lora"],
  );
  assert.equal(fetches[0].url, "http://127.0.0.1:19100/health");

  const reused = await pool.ensure(spec);
  assert.equal(reused.instanceId, first.instanceId);
  assert.equal(reused.coldStart, false);
  assert.equal(spawns.length, 1);

  const prefixHash = hashPromptPrefix({ systemPrompt: "stable system", contextPrefix: "tenant context" });
  const marked = pool.markPrefixWarm(first.instanceId, prefixHash, { loraRef: "zeta", loraScale: 1 });
  assert.equal(marked.warmPrefix, true);
  const selected = pool.select({
    configurationKey: first.configurationKey,
    loraRef: "zeta",
    loraScale: 1,
    poolRole: "prefill_pool",
    prefixHash,
  });
  assert.equal(selected.instanceId, first.instanceId);
  assert.equal(selected.warmPrefix, true);

  children[0].emit("exit", 9, null);
  assert.equal(pool.size, 0);
  assert.equal(pool.select({
    configurationKey: first.configurationKey,
    loraRef: "zeta",
    poolRole: "prefill_pool",
  }), null);
});

test("process reuse requires exact adapter, cache, alias, role, and argv identity", async () => {
  const files = {
    "/models/base.gguf": "base-bytes",
    "/adapters/support-v1.gguf": "support-v1",
    "/adapters/support-v2.gguf": "support-v2",
  };
  const { pool, spawns } = poolFixture({
    files,
    maxInstances: 8,
    poolOptions: {
      serverConfigByRole: {
        prefill: { threads: 12, ctxSize: 16384, batchSize: 2048, ubatchSize: 512, gpuLayers: 60 },
        decode: { threads: 6, ctxSize: 8192, batchSize: 512, ubatchSize: 128, gpuLayers: 40 },
      },
    },
  });
  const common = {
    model: model("/models/base.gguf", "base-bytes"),
    allowedAdapters: [lora("support", "/adapters/support-v1.gguf", "support-v1")],
    loraRef: "support",
    poolRole: "prefill_pool",
    cacheTypeK: "q4_0",
    aliasPrefix: "tenant-a",
  };
  const first = await pool.ensure(common);
  const reused = await pool.ensure(common);
  assert.equal(reused.instanceId, first.instanceId);
  assert.equal(spawns.length, 1);
  assert.equal(
    pool.select({ modelSha256: digest("base-bytes"), loraRef: "support", poolRole: "prefill_pool" }),
    null,
    "partial identity must fall through to exact ensure()",
  );
  assert.equal(pool.select({
    configurationKey: first.configurationKey,
    loraRef: "support",
    poolRole: "prefill_pool",
  }).instanceId, first.instanceId);

  const aliasChanged = await pool.ensure({ ...common, aliasPrefix: "tenant-b" });
  const cacheChanged = await pool.ensure({ ...common, cacheTypeK: "q8_0" });
  const adapterChanged = await pool.ensure({
    ...common,
    allowedAdapters: [lora("support", "/adapters/support-v2.gguf", "support-v2")],
  });
  const decode = await pool.ensure({ ...common, poolRole: "decode_pool" });
  const explicitAlias = await pool.ensure({ ...common, servedAlias: "workspace-student:v7" });
  assert.equal(new Set([
    first.configurationKey,
    aliasChanged.configurationKey,
    cacheChanged.configurationKey,
    adapterChanged.configurationKey,
    decode.configurationKey,
    explicitAlias.configurationKey,
  ]).size, 6);
  assert.equal(first.alias, decode.alias, "phase roles share the composite model alias");
  assert.equal(explicitAlias.alias, "workspace-student:v7", "governed training tag can be the exact served model id");
  assert.equal(spawns.length, 6);
  assert.deepEqual(
    spawns[0].argv.slice(spawns[0].argv.indexOf("--threads"), spawns[0].argv.indexOf("--lora")),
    [
      "--threads", "12",
      "--ctx-size", "16384",
      "--batch-size", "2048",
      "--ubatch-size", "512",
      "--n-gpu-layers", "60",
    ],
  );
  assert.equal(spawns[4].argv[spawns[4].argv.indexOf("--threads") + 1], "6");
  await pool.close();
});

test("hash mismatch fails before spawn and unknown LoRA cannot create an instance", async () => {
  const { pool, spawns } = poolFixture({ files: {
    "/models/base.gguf": "base-bytes",
    "/adapters/alpha.gguf": "alpha-bytes",
  } });
  await assert.rejects(
    pool.ensure({
      model: { path: "/models/base.gguf", sha256: digest("not-the-model") },
      allowedAdapters: [],
      poolRole: "unified_pool",
    }),
    (error) => error.code === "ARTIFACT_HASH_MISMATCH",
  );
  await assert.rejects(
    pool.ensure({
      model: model("/models/base.gguf", "base-bytes"),
      allowedAdapters: [lora("alpha", "/adapters/alpha.gguf", "alpha-bytes")],
      loraRef: "unknown",
      poolRole: "unified_pool",
    }),
    (error) => error.code === "LORA_NOT_ALLOWED",
  );
  assert.equal(spawns.length, 0);
});

test("dispatch remains loopback-only, holds an eviction lease, and marks prefix warm on release", async () => {
  const files = {
    "/models/a.gguf": "model-a",
    "/models/b.gguf": "model-b",
    "/adapters/a.gguf": "adapter-a",
  };
  const { pool, spawns, fetches } = poolFixture({ files, maxInstances: 1 });
  const first = await pool.ensure({
    model: model("/models/a.gguf", "model-a"),
    allowedAdapters: [lora("support", "/adapters/a.gguf", "adapter-a")],
    loraRef: "support",
    poolRole: "decode_pool",
  });
  const prefixHash = hashPromptPrefix({ systemPrompt: "same", contextPrefix: "prefix" });
  const dispatched = await pool.dispatch(first.instanceId, {
    body: { messages: [{ role: "user", content: "hello" }], stream: true },
    loraRef: "support",
    prefixHash,
  });
  const completionFetch = fetches.at(-1);
  assert.equal(completionFetch.url, "http://127.0.0.1:19100/v1/chat/completions");
  assert.equal(JSON.parse(completionFetch.init.body).lora[0].id, 0);
  assert.equal(pool.list()[0].activeRequests, 1);
  assert.equal(dispatched.instance.warmPrefix, false, "dispatch does not claim warmth before caller release");

  await assert.rejects(
    pool.ensure({
      model: model("/models/b.gguf", "model-b"),
      allowedAdapters: [],
      poolRole: "decode_pool",
    }),
    (error) => error.code === "LLAMA_POOL_CAPACITY",
  );
  dispatched.release({ warm: true });
  assert.equal(pool.list()[0].activeRequests, 0);
  assert.equal(pool.select({
    configurationKey: first.configurationKey,
    loraRef: "support",
    loraScale: 1,
    poolRole: "decode_pool",
    prefixHash,
  }).warmPrefix, true);

  const alternateScale = await pool.dispatch(first.instanceId, {
    body: { messages: [{ role: "user", content: "hello again" }], stream: true },
    loraRef: "support",
    loraScale: 0.5,
    prefixHash,
  });
  alternateScale.release({ warm: false });
  assert.equal(pool.select({
    configurationKey: first.configurationKey,
    loraRef: "support",
    loraScale: 1,
    poolRole: "decode_pool",
    prefixHash,
  }).warmPrefix, false, "an upstream LoRA-scale switch invalidates the prior prompt cache");
  assert.equal(pool.select({
    configurationKey: first.configurationKey,
    loraRef: "support",
    loraScale: 0.5,
    poolRole: "decode_pool",
    prefixHash,
  }).warmPrefix, false, "a different LoRA scale cannot inherit prefix warmth");
  const alternateScaleWarm = await pool.dispatch(first.instanceId, {
    body: { messages: [{ role: "user", content: "hello one more time" }], stream: true },
    loraRef: "support",
    loraScale: 0.5,
    prefixHash,
  });
  alternateScaleWarm.release({ warm: true });
  assert.equal(pool.select({
    configurationKey: first.configurationKey,
    loraRef: "support",
    loraScale: 0.5,
    poolRole: "decode_pool",
    prefixHash,
  }).warmPrefix, true);

  const olderSelection = await pool.dispatch(first.instanceId, {
    body: { messages: [{ role: "user", content: "older concurrent call" }] },
    loraRef: "support",
    loraScale: 1,
    prefixHash,
  });
  const newerSelection = await pool.dispatch(first.instanceId, {
    body: { messages: [{ role: "user", content: "newer concurrent call" }] },
    loraRef: "support",
    loraScale: 0.5,
    prefixHash,
  });
  olderSelection.release({ warm: true });
  assert.equal(pool.select({
    configurationKey: first.configurationKey,
    loraRef: "support",
    loraScale: 1,
    poolRole: "decode_pool",
    prefixHash,
  }).warmPrefix, false, "an out-of-order release cannot resurrect invalidated cache state");
  newerSelection.release({ warm: true });
  assert.equal(pool.select({
    configurationKey: first.configurationKey,
    loraRef: "support",
    loraScale: 0.5,
    poolRole: "decode_pool",
    prefixHash,
  }).warmPrefix, true);

  const second = await pool.ensure({
    model: model("/models/b.gguf", "model-b"),
    allowedAdapters: [],
    poolRole: "decode_pool",
  });
  assert.notEqual(second.instanceId, first.instanceId);
  assert.equal(spawns.length, 2);
  assert.equal(spawns[0].child.killSignals[0], "SIGTERM");
  await pool.close();
  assert.equal(pool.size, 0);
});

test("concurrent starts never exceed the configured process bound", async () => {
  const files = { "/models/a.gguf": "model-a", "/models/b.gguf": "model-b" };
  const { pool, spawns } = poolFixture({ files, maxInstances: 1 });
  const requests = await Promise.allSettled([
    pool.ensure({ model: model("/models/a.gguf", "model-a"), allowedAdapters: [], poolRole: "unified_pool" }),
    pool.ensure({ model: model("/models/b.gguf", "model-b"), allowedAdapters: [], poolRole: "unified_pool" }),
  ]);
  assert.equal(requests.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(requests.filter((result) => result.status === "rejected").length, 1);
  assert.equal(requests.find((result) => result.status === "rejected").reason.code, "LLAMA_POOL_CAPACITY");
  assert.equal(spawns.length, 1);
  assert.equal(pool.size, 1);
  await pool.close();
});
