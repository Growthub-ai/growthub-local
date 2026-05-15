#!/usr/bin/env node
/**
 * helpers/dispatch-background-agent.mjs — Background Dispatch Primitive
 *
 * Permanent background-dispatch entrypoint for the Growthub distillation
 * pipeline. A "background dispatch" turns a high-level intent (e.g. "build
 * the served agent service") into a concrete set of governed writes:
 *   - a seeded-config inside this kit (parallel to alignment-loop)
 *   - a scaffolded target repo on disk (mirrors AWaC primitives, but as a
 *     deployable microservice)
 *   - the @growthub/agent-sdk stub package
 *   - the wiring that lets the existing distillation pipeline push fresh
 *     GGUFs into the served service without changing primitives
 *
 * No new primitive types are introduced: every output is either a seeded
 * config row, a Data Model object, a frozen kit asset, or a normal file on
 * disk inside the dispatched repo. PATCHes flow through /api/workspace
 * exactly like every other helper (harvest, grade, export).
 *
 * Tasks (extensible registry):
 *   --task "build-served-agent-service"
 *       Scaffold the persistent microservice + SDK that serves the latest
 *       growthub-local-expert GGUF via an OpenAI-compatible endpoint.
 *
 * Usage:
 *   node helpers/dispatch-background-agent.mjs \
 *     --task "build-served-agent-service" \
 *     [--out <path>]                  # default: ${GROWTHUB_AGENT_SERVICE_HOME:-./growthub-agent-service}
 *     [--service-name growthub-agent-service]
 *     [--port 8787]
 *     [--model-id growthub-local-expert]
 *     [--server-runtime ollama]       # ollama | vllm
 *     [--gguf-url <url>]              # optional remote URL for pull-latest-gguf
 *     [--repo-url <git-url>]          # optional remote to record in service-registry
 *     [--workspace http://localhost:3000]   # optional, only used if --register-service is passed
 *     [--register-service]            # PATCH service-registry rows in live workspace
 *     [--force]                       # overwrite existing files at --out
 *     [--dry-run]                     # print planned writes; do not touch disk
 *
 * Run-after-build (suggested):
 *   cd <out>
 *   npm install
 *   npm run dev               # boots Express on :8787 backed by ollama/vllm
 *   curl -sX POST localhost:8787/v1/chat/completions -d '{"model":"growthub-local-expert","messages":[...]}'
 *
 * Trace handoff:
 *   This helper does not append to .growthub-fork/trace.jsonl directly —
 *   the caller (the operator agent dispatching it) is responsible for
 *   adding a row to training-traces with qualityScore once a critic-grader
 *   pass scores the output. That keeps the distillation flywheel intact.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = path.resolve(HERE, "..");

function parseArgs(argv) {
  const a = {
    task: "",
    out: "",
    serviceName: "growthub-agent-service",
    port: 8787,
    modelId: "growthub-local-expert",
    serverRuntime: "ollama",
    ggufUrl: "",
    repoUrl: "https://github.com/growthub-ai/growthub-agent-service",
    workspace: "http://localhost:3000",
    registerService: false,
    force: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    const next = () => String(argv[++i] || "").trim();
    if (t === "--task") a.task = next();
    else if (t === "--out") a.out = next();
    else if (t === "--service-name") a.serviceName = next();
    else if (t === "--port") a.port = Number(next()) || 8787;
    else if (t === "--model-id") a.modelId = next();
    else if (t === "--server-runtime") a.serverRuntime = next();
    else if (t === "--gguf-url") a.ggufUrl = next();
    else if (t === "--repo-url") a.repoUrl = next();
    else if (t === "--workspace") a.workspace = next().replace(/\/+$/, "");
    else if (t === "--register-service") a.registerService = true;
    else if (t === "--force") a.force = true;
    else if (t === "--dry-run") a.dryRun = true;
    else if (t === "--help" || t === "-h") {
      process.stdout.write(
        "Usage: dispatch-background-agent.mjs --task <task> [--out path] [--service-name N] [--port P] [--model-id ID] [--server-runtime ollama|vllm] [--gguf-url URL] [--repo-url URL] [--workspace URL] [--register-service] [--force] [--dry-run]\n",
      );
      process.exit(0);
    }
  }
  if (!a.task) {
    process.stderr.write("error: --task is required (e.g. --task \"build-served-agent-service\")\n");
    process.exit(2);
  }
  if (!a.out) {
    a.out = process.env.GROWTHUB_AGENT_SERVICE_HOME || path.resolve(process.cwd(), a.serviceName);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const outRoot = path.resolve(args.out);

// ---------- planned-writes ledger ----------
/** @type {Array<{ relPath: string; bytes: number; action: "created" | "skipped" | "overwritten" }>} */
const writes = [];

function writeFile(relPath, contents, { isJson = false } = {}) {
  const abs = path.join(outRoot, relPath);
  const body = isJson ? `${JSON.stringify(contents, null, 2)}\n` : contents;
  const exists = fs.existsSync(abs);
  if (exists && !args.force) {
    writes.push({ relPath, bytes: Buffer.byteLength(body, "utf8"), action: "skipped" });
    return;
  }
  if (!args.dryRun) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, "utf8");
  }
  writes.push({ relPath, bytes: Buffer.byteLength(body, "utf8"), action: exists ? "overwritten" : "created" });
}

function relToKit(absInsideKit) {
  return path.relative(KIT_ROOT, absInsideKit);
}

// ---------- task: build-served-agent-service ----------
function planServedAgentRepoFiles({ serviceName, port, modelId, serverRuntime, ggufUrl, repoUrl }) {
  const pkgJson = {
    name: serviceName,
    version: "0.1.0",
    private: true,
    description:
      "Persistent Growthub Agent microservice — serves the distilled growthub-local-expert GGUF behind an OpenAI-compatible /v1/chat/completions endpoint and a governed /workspace/query lane. Scaffolded by helpers/dispatch-background-agent.mjs.",
    type: "module",
    engines: { node: ">=20" },
    scripts: {
      dev: `node src/server.mjs`,
      start: `node src/server.mjs`,
      healthcheck: `node scripts/healthcheck.mjs --base http://127.0.0.1:${port}`,
      "pull-latest-gguf": `node scripts/pull-latest-gguf.mjs`,
    },
    dependencies: {
      express: "^4.21.0",
    },
    workspaces: ["packages/agent-sdk"],
  };

  const envExample = [
    `# growthub-agent-service — environment template`,
    ``,
    `# Where the server binds.`,
    `PORT=${port}`,
    `HOST=127.0.0.1`,
    ``,
    `# Upstream model server. Defaults assume Ollama on the loopback.`,
    `# Switch SERVER_RUNTIME=vllm to swap to a vLLM OpenAI-compatible upstream.`,
    `SERVER_RUNTIME=${serverRuntime}`,
    `OLLAMA_BASE_URL=http://127.0.0.1:11434`,
    `VLLM_BASE_URL=http://127.0.0.1:8000`,
    ``,
    `# Distilled model identifier as it appears to the upstream runtime.`,
    `MODEL_ID=${modelId}`,
    ``,
    `# Optional shared-secret for /v1/chat/completions and /workspace/query.`,
    `# When unset, the server runs open on the loopback (do not bind to 0.0.0.0).`,
    `GROWTHUB_AGENT_SERVICE_API_KEY=`,
    ``,
    `# Optional remote URL for the GGUF (used by scripts/pull-latest-gguf.mjs).`,
    `GROWTHUB_GGUF_URL=${ggufUrl || ""}`,
    ``,
  ].join("\n");

  const gitignore = [
    `node_modules/`,
    `.env`,
    `.env.local`,
    `dist/`,
    `models/`,
    `*.gguf`,
    `.DS_Store`,
    ``,
  ].join("\n");

  const growthubConfig = {
    id: "served-agent-fork-default",
    name: serviceName,
    description:
      "Served-agent governed fork. Mirrors the served-agent seeded config from growthub-custom-workspace-starter-v1. The dataModel object service-registry tracks the live deployment; the sandboxes-served-agent object exposes this microservice as a remote-intelligence sandbox row.",
    provenance: {
      createdBy: "helpers/dispatch-background-agent.mjs",
      mirrors: "growthub-custom-workspace-starter-v1",
      seededConfig: "served-agent",
      modelId,
      serverRuntime,
      repoUrl,
    },
    branding: {
      name: "Growthub Agent Service",
      logoUrl: "",
      accent: "#3f68ff",
    },
    capabilities: ["agent-service", "openai-compatible", "workspace-query"],
    dataModel: {
      objects: [],
    },
  };

  const readme = [
    `# ${serviceName}`,
    ``,
    `Persistent Growthub Agent microservice. Loads the distilled \`${modelId}\` GGUF`,
    `behind an OpenAI-compatible \`/v1/chat/completions\` endpoint and a governed`,
    `\`/workspace/query\` lane. Scaffolded by \`helpers/dispatch-background-agent.mjs\``,
    `from the [growthub-custom-workspace-starter-v1](https://github.com/growthub-ai/growthub-local)`,
    `worker kit using the \`served-agent\` seeded config.`,
    ``,
    `## Architecture`,
    ``,
    `\`\`\``,
    `client ──▶ POST /v1/chat/completions        (OpenAI shape)`,
    `             └─▶ openai-shim ──▶ ${serverRuntime} ──▶ ${modelId} GGUF`,
    `client ──▶ POST /workspace/query            (governed shape: { task, schema, refs })`,
    `             └─▶ governed-prompt ──▶ same upstream`,
    `\`\`\``,
    ``,
    `Two upstream runtimes are supported out of the box:`,
    ``,
    `- **ollama** (default for local dev) — pulls \`${modelId}\` into Ollama and proxies via \`/api/chat\`.`,
    `- **vllm** — proxies the request 1:1 against vLLM's OpenAI-compatible \`/v1/chat/completions\`.`,
    ``,
    `Flip with \`SERVER_RUNTIME=vllm\`. No code changes required.`,
    ``,
    `## Quickstart`,
    ``,
    `\`\`\`bash`,
    `cp .env.example .env`,
    `npm install`,
    `npm run dev`,
    ``,
    `# in another shell — sanity check`,
    `curl -sX POST http://127.0.0.1:${port}/v1/chat/completions \\`,
    `  -H 'content-type: application/json' \\`,
    `  -d '{"model":"${modelId}","messages":[{"role":"user","content":"hello"}]}'`,
    `\`\`\``,
    ``,
    `## SDK`,
    ``,
    `The thin \`@growthub/agent-sdk\` package ships under \`packages/agent-sdk\`. One`,
    `function call hides the OpenAI shape and the optional API key.`,
    ``,
    `\`\`\`js`,
    `import { createAgent } from "@growthub/agent-sdk";`,
    ``,
    `const agent = createAgent({ baseUrl: "http://127.0.0.1:${port}" });`,
    `const out = await agent.query("build a dashboard for client X");`,
    `\`\`\``,
    ``,
    `## Distillation handoff`,
    ``,
    `The existing harvest → grade → upload → export pipeline keeps running against`,
    `the local alignment-loop sandboxes. When a new \`${modelId}-vN.gguf\` lands:`,
    ``,
    `1. \`scripts/pull-latest-gguf.mjs\` resolves the latest asset (env: \`GROWTHUB_GGUF_URL\`).`,
    `2. \`ollama create ${modelId} -f Modelfile\` (or vLLM model-load) reloads it.`,
    `3. The \`service-registry\` Data Model row gets its \`ggufVersion\` PATCHed —`,
    `   either by a maintainer through the workspace UI or by re-running this`,
    `   helper with \`--register-service\`.`,
    ``,
    `## Governance`,
    ``,
    `This repo is an AWaC fork: the \`growthub.config.json\` here mirrors what the`,
    `seeded config produces. Do not introduce new primitive types; PATCH the`,
    `existing Data Model objects through \`/api/workspace\` exactly like every`,
    `other governed helper.`,
    ``,
  ].join("\n");

  const serverMjs = `// src/server.mjs — Express server. OpenAI-compatible chat + governed workspace lane.
import express from "express";
import { handleChatCompletions } from "./routes/chat-completions.mjs";
import { handleWorkspaceQuery } from "./routes/workspace-query.mjs";
import { getConfig } from "./config.mjs";

const cfg = getConfig();
const app = express();
app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  if (!cfg.apiKey) return next();
  const got = req.header("authorization") || "";
  const want = \`Bearer \${cfg.apiKey}\`;
  if (got === want) return next();
  res.status(401).json({ error: { message: "missing or invalid bearer token", type: "auth_error" } });
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, modelId: cfg.modelId, runtime: cfg.runtime, upstream: cfg.upstreamBaseUrl });
});

app.get("/v1/models", (_req, res) => {
  res.json({
    object: "list",
    data: [{ id: cfg.modelId, object: "model", owned_by: "growthub", created: Math.floor(Date.now() / 1000) }],
  });
});

app.post("/v1/chat/completions", handleChatCompletions);
app.post("/workspace/query", handleWorkspaceQuery);

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error("[growthub-agent-service]", err);
  res.status(500).json({ error: { message: err?.message || "internal error", type: "internal_error" } });
});

app.listen(cfg.port, cfg.host, () => {
  // eslint-disable-next-line no-console
  console.log(\`[growthub-agent-service] listening on http://\${cfg.host}:\${cfg.port} (\${cfg.runtime} → \${cfg.upstreamBaseUrl})\`);
});
`;

  const configMjs = `// src/config.mjs — single source of truth for runtime config.
export function getConfig() {
  const runtime = (process.env.SERVER_RUNTIME || "${serverRuntime}").toLowerCase();
  const upstream = runtime === "vllm"
    ? (process.env.VLLM_BASE_URL || "http://127.0.0.1:8000").replace(/\\/+$/, "")
    : (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\\/+$/, "");
  return {
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT || ${port}),
    runtime,
    upstreamBaseUrl: upstream,
    modelId: process.env.MODEL_ID || "${modelId}",
    apiKey: process.env.GROWTHUB_AGENT_SERVICE_API_KEY || "",
  };
}
`;

  const chatRoute = `// src/routes/chat-completions.mjs — OpenAI-compatible passthrough.
import { getConfig } from "../config.mjs";
import { proxyChat } from "../lib/upstream-client.mjs";

export async function handleChatCompletions(req, res) {
  const cfg = getConfig();
  const body = req.body || {};
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: { message: "messages[] is required", type: "invalid_request" } });
  }
  const upstream = await proxyChat({
    cfg,
    model: body.model || cfg.modelId,
    messages: body.messages,
    temperature: body.temperature,
    maxTokens: body.max_tokens,
    stream: false,
  });
  res.json(upstream);
}
`;

  const workspaceRoute = `// src/routes/workspace-query.mjs — governed lane.
//
// Accepts { task, schema?, refs?, context? } and rewrites it into a single
// system+user pair before hitting the same upstream as /v1/chat/completions.
// The system prompt is the AWaC V2 contract — schema-native, low-entropy,
// directly executable. Refuse and explain when the request crosses the PATCH
// allowlist or governed primitive boundary.
import { getConfig } from "../config.mjs";
import { proxyChat } from "../lib/upstream-client.mjs";

const GOVERNED_SYSTEM = [
  "You are growthub-agent-service. Honor the AWaC V2 contract:",
  "- AGENTS.md is the source of truth for agent behavior.",
  "- Every write flows through /api/workspace PATCH; never bypass the schema.",
  "- Do not invent new primitive types. Existing primitives: Sandboxes, Data Model objects, helpers, skills, seeded configs.",
  "- Return schema-native output. When the user asks for a change, return the smallest PATCH body that satisfies it.",
].join("\\n");

export async function handleWorkspaceQuery(req, res) {
  const cfg = getConfig();
  const { task, schema, refs, context } = req.body || {};
  if (typeof task !== "string" || !task.trim()) {
    return res.status(400).json({ error: { message: "task is required", type: "invalid_request" } });
  }
  const userParts = [task.trim()];
  if (schema) userParts.push(\`\\nTARGET SCHEMA:\\n\${JSON.stringify(schema, null, 2)}\`);
  if (refs && Array.isArray(refs) && refs.length) userParts.push(\`\\nREFERENCES:\\n\${refs.map((r) => \`- \${r}\`).join("\\n")}\`);
  if (context) userParts.push(\`\\nCONTEXT:\\n\${typeof context === "string" ? context : JSON.stringify(context, null, 2)}\`);

  const completion = await proxyChat({
    cfg,
    model: cfg.modelId,
    messages: [
      { role: "system", content: GOVERNED_SYSTEM },
      { role: "user", content: userParts.join("\\n") },
    ],
    temperature: 0.2,
    stream: false,
  });

  const text = completion?.choices?.[0]?.message?.content || "";
  res.json({
    ok: true,
    modelId: cfg.modelId,
    runtime: cfg.runtime,
    answer: text,
    raw: completion,
  });
}
`;

  const upstreamClient = `// src/lib/upstream-client.mjs — ollama | vllm router. No SDK deps.
//
// Both upstreams speak OpenAI-compatible /v1/chat/completions in modern
// releases (Ollama 0.4+, vLLM 0.5+), so we route to the same shape. We keep
// this client intentionally tiny: no streaming, no tool calls — those land
// in v0.2 of the service. The distillation pipeline's first job is to make
// the single-turn /workspace/query reliable.

const OLLAMA_PATH = "/v1/chat/completions";
const VLLM_PATH = "/v1/chat/completions";

export async function proxyChat({ cfg, model, messages, temperature, maxTokens, stream }) {
  const target = cfg.runtime === "vllm"
    ? \`\${cfg.upstreamBaseUrl}\${VLLM_PATH}\`
    : \`\${cfg.upstreamBaseUrl}\${OLLAMA_PATH}\`;
  const body = {
    model,
    messages,
    stream: !!stream,
  };
  if (typeof temperature === "number") body.temperature = temperature;
  if (typeof maxTokens === "number") body.max_tokens = maxTokens;

  const r = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    const err = new Error(\`upstream \${cfg.runtime} \${r.status}: \${txt.slice(0, 400)}\`);
    err.statusCode = r.status;
    throw err;
  }
  return r.json();
}
`;

  const sdkPkgJson = {
    name: "@growthub/agent-sdk",
    version: "0.1.0",
    description:
      "Thin client for growthub-agent-service. Hides the OpenAI-compatible shape behind agent.query(task) and agent.chat(messages).",
    type: "module",
    main: "src/index.mjs",
    exports: {
      ".": "./src/index.mjs",
    },
    files: ["src", "README.md"],
    engines: { node: ">=20" },
    sideEffects: false,
  };

  const sdkIndex = `// packages/agent-sdk/src/index.mjs
// One-line client for growthub-agent-service.
//
// Usage:
//   import { createAgent } from "@growthub/agent-sdk";
//   const agent = createAgent({ baseUrl: "http://127.0.0.1:${port}", apiKey: process.env.GROWTHUB_AGENT_SERVICE_API_KEY });
//   const out = await agent.query("build a dashboard for client X");

export function createAgent({ baseUrl, apiKey } = {}) {
  if (!baseUrl || typeof baseUrl !== "string") {
    throw new Error("createAgent: baseUrl is required");
  }
  const base = baseUrl.replace(/\\/+$/, "");
  const headers = { "content-type": "application/json" };
  if (apiKey) headers.authorization = \`Bearer \${apiKey}\`;

  async function post(pathname, body) {
    const r = await fetch(\`\${base}\${pathname}\`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      const err = new Error(\`growthub-agent-service \${pathname} \${r.status}: \${txt.slice(0, 400)}\`);
      err.statusCode = r.status;
      throw err;
    }
    return r.json();
  }

  async function chat(messages, opts = {}) {
    return post("/v1/chat/completions", {
      model: opts.model || "${modelId}",
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    });
  }

  async function query(task, opts = {}) {
    return post("/workspace/query", {
      task,
      schema: opts.schema,
      refs: opts.refs,
      context: opts.context,
    });
  }

  async function health() {
    const r = await fetch(\`\${base}/healthz\`, { headers });
    if (!r.ok) throw new Error(\`healthz \${r.status}\`);
    return r.json();
  }

  return { chat, query, health, baseUrl: base };
}
`;

  const sdkReadme = [
    `# @growthub/agent-sdk`,
    ``,
    `Thin client for [growthub-agent-service](../..). One function call hides the`,
    `OpenAI-compatible shape and the optional API key.`,
    ``,
    `\`\`\`js`,
    `import { createAgent } from "@growthub/agent-sdk";`,
    ``,
    `const agent = createAgent({`,
    `  baseUrl: process.env.GROWTHUB_AGENT_SERVICE_URL || "http://127.0.0.1:${port}",`,
    `  apiKey: process.env.GROWTHUB_AGENT_SERVICE_API_KEY,`,
    `});`,
    ``,
    `await agent.health();`,
    `await agent.query("build a dashboard for client X");`,
    `await agent.chat([{ role: "user", content: "summarize the AWaC contract" }]);`,
    `\`\`\``,
    ``,
    `The SDK is intentionally dependency-free. v0.1 covers single-turn requests;`,
    `streaming and tool-calls land once the distillation pipeline has reliable`,
    `traces for those shapes.`,
    ``,
  ].join("\n");

  const pullLatestGguf = `#!/usr/bin/env node
// scripts/pull-latest-gguf.mjs — resolves the latest growthub-local-expert GGUF.
//
// Stub. The distillation pipeline produces a versioned GGUF (e.g.
// growthub-local-expert-v3.gguf). When you publish that asset somewhere
// reachable (HF, R2, GitHub Releases, etc.) and set GROWTHUB_GGUF_URL, this
// helper downloads it into ./models/ and tells Ollama to reload it.
//
// Usage:
//   node scripts/pull-latest-gguf.mjs --runtime ollama --model-id ${modelId}
//
// This script is intentionally minimal — the real "distillation pipeline ↔
// served service" wiring stays inside the worker kit (helpers/) and the
// existing harvest → grade → export loop. The served repo is only the
// serving layer.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
}

const runtime = getArg("--runtime", process.env.SERVER_RUNTIME || "${serverRuntime}");
const modelId = getArg("--model-id", process.env.MODEL_ID || "${modelId}");
const ggufUrl = getArg("--gguf-url", process.env.GROWTHUB_GGUF_URL || "");
const dest = path.resolve("./models", \`\${modelId}.gguf\`);

if (!ggufUrl) {
  process.stderr.write("info: GROWTHUB_GGUF_URL is not set — nothing to pull.\\n");
  process.exit(0);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
process.stdout.write(\`Fetching \${ggufUrl} → \${dest}\\n\`);
const r = spawnSync("curl", ["-fL", "--output", dest, ggufUrl], { stdio: "inherit" });
if (r.status !== 0) {
  process.stderr.write("error: curl failed\\n");
  process.exit(1);
}

if (runtime === "ollama") {
  const modelfile = path.resolve("./models/Modelfile");
  fs.writeFileSync(modelfile, \`FROM \${dest}\\n\`, "utf8");
  const c = spawnSync("ollama", ["create", modelId, "-f", modelfile], { stdio: "inherit" });
  if (c.status !== 0) {
    process.stderr.write("error: ollama create failed\\n");
    process.exit(1);
  }
}

process.stdout.write(JSON.stringify({ ok: true, modelId, runtime, dest }, null, 2) + "\\n");
`;

  const healthcheck = `#!/usr/bin/env node
// scripts/healthcheck.mjs — small wrapper so npm run healthcheck stays terse.
const args = process.argv.slice(2);
const i = args.indexOf("--base");
const base = (i >= 0 ? args[i + 1] : "http://127.0.0.1:${port}").replace(/\\/+$/, "");
const r = await fetch(\`\${base}/healthz\`).catch((e) => ({ ok: false, _err: e }));
if (!r || !r.ok) {
  process.stderr.write(JSON.stringify({ ok: false, base, error: r?._err?.message || \`status \${r?.status}\` }) + "\\n");
  process.exit(1);
}
process.stdout.write(JSON.stringify({ ok: true, base, body: await r.json() }, null, 2) + "\\n");
`;

  const dockerfile = `# growthub-agent-service — single-stage Node image.
# The upstream model server (Ollama or vLLM) is intentionally NOT bundled
# into this image. Run it side-by-side via docker-compose or your own host.
FROM node:20-slim
WORKDIR /app
COPY package.json ./
COPY packages/agent-sdk/package.json packages/agent-sdk/package.json
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE ${port}
CMD ["node", "src/server.mjs"]
`;

  const composeYaml = `# docker-compose.yml — dev convenience. Pairs the service with Ollama.
services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama:/root/.ollama
  agent-service:
    build: .
    environment:
      - SERVER_RUNTIME=${serverRuntime}
      - OLLAMA_BASE_URL=http://ollama:11434
      - MODEL_ID=${modelId}
      - PORT=${port}
      - HOST=0.0.0.0
    ports:
      - "${port}:${port}"
    depends_on:
      - ollama
volumes:
  ollama:
`;

  const ghWorkflow = `# .github/workflows/publish-gguf.yml — release stub.
#
# Wires the distillation pipeline to this serving repo: when a new
# growthub-local-expert GGUF is built and released elsewhere (HF, R2, etc.),
# fire this workflow with the asset URL. It will update service-registry's
# ggufVersion + ggufUrl through the helper.
name: publish-gguf
on:
  workflow_dispatch:
    inputs:
      gguf_url:
        description: "URL of the new GGUF asset"
        required: true
      gguf_version:
        description: "Version label (e.g. v3)"
        required: true
jobs:
  record-release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: echo "GROWTHUB_GGUF_URL=\${{ inputs.gguf_url }}" >> $GITHUB_ENV
      - run: echo "GROWTHUB_GGUF_VERSION=\${{ inputs.gguf_version }}" >> $GITHUB_ENV
      - run: node scripts/pull-latest-gguf.mjs --gguf-url "\${{ inputs.gguf_url }}"
`;

  return {
    pkgJson,
    envExample,
    gitignore,
    growthubConfig,
    readme,
    serverMjs,
    configMjs,
    chatRoute,
    workspaceRoute,
    upstreamClient,
    sdkPkgJson,
    sdkIndex,
    sdkReadme,
    pullLatestGguf,
    healthcheck,
    dockerfile,
    composeYaml,
    ghWorkflow,
  };
}

async function runBuildServedAgentService() {
  const files = planServedAgentRepoFiles({
    serviceName: args.serviceName,
    port: args.port,
    modelId: args.modelId,
    serverRuntime: args.serverRuntime,
    ggufUrl: args.ggufUrl,
    repoUrl: args.repoUrl,
  });

  writeFile("package.json", files.pkgJson, { isJson: true });
  writeFile(".env.example", files.envExample);
  writeFile(".gitignore", files.gitignore);
  writeFile("growthub.config.json", files.growthubConfig, { isJson: true });
  writeFile("README.md", files.readme);

  writeFile("src/server.mjs", files.serverMjs);
  writeFile("src/config.mjs", files.configMjs);
  writeFile("src/routes/chat-completions.mjs", files.chatRoute);
  writeFile("src/routes/workspace-query.mjs", files.workspaceRoute);
  writeFile("src/lib/upstream-client.mjs", files.upstreamClient);

  writeFile("packages/agent-sdk/package.json", files.sdkPkgJson, { isJson: true });
  writeFile("packages/agent-sdk/src/index.mjs", files.sdkIndex);
  writeFile("packages/agent-sdk/README.md", files.sdkReadme);

  writeFile("scripts/pull-latest-gguf.mjs", files.pullLatestGguf);
  writeFile("scripts/healthcheck.mjs", files.healthcheck);

  writeFile("Dockerfile", files.dockerfile);
  writeFile("docker-compose.yml", files.composeYaml);
  writeFile(".github/workflows/publish-gguf.yml", files.ghWorkflow);

  const seededConfigRelPath = relToKit(
    path.join(KIT_ROOT, "templates", "seeded-configs", "served-agent.config.json"),
  );
  const seededConfigExists = fs.existsSync(
    path.join(KIT_ROOT, "templates", "seeded-configs", "served-agent.config.json"),
  );

  let registered = null;
  if (args.registerService) {
    registered = await registerServiceWithLiveWorkspace().catch((e) => ({ ok: false, error: e.message }));
  }

  return { writes, seededConfig: { path: seededConfigRelPath, present: seededConfigExists }, registered };
}

async function registerServiceWithLiveWorkspace() {
  const wsUrl = args.workspace;
  const r = await fetch(`${wsUrl}/api/workspace`, { cache: "no-store" });
  if (!r.ok) throw new Error(`GET /api/workspace ${r.status}`);
  const { workspaceConfig } = await r.json();
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  const idx = objects.findIndex((o) => o.id === "service-registry");
  if (idx < 0) {
    throw new Error(
      "service-registry object not found in live workspace; run `growthub starter init --seed-config served-agent` first",
    );
  }
  const row = {
    serviceId: args.serviceName,
    repoUrl: args.repoUrl,
    baseUrl: `http://127.0.0.1:${args.port}`,
    modelId: args.modelId,
    ggufVersion: "v0",
    ggufUrl: args.ggufUrl || "",
    serverRuntime: args.serverRuntime,
    deploymentTarget: "local",
    status: "scaffolded",
    lastHealthcheckAt: "",
    lastResponse: "",
  };
  const existingRows = Array.isArray(objects[idx].rows) ? objects[idx].rows : [];
  const rowIdx = existingRows.findIndex((r0) => r0.serviceId === args.serviceName);
  const nextRows =
    rowIdx < 0
      ? [...existingRows, row]
      : existingRows.map((r0, i) => (i === rowIdx ? { ...r0, ...row } : r0));
  const nextObjects = objects.map((o, i) => (i !== idx ? o : { ...o, rows: nextRows }));
  if (args.dryRun) return { ok: true, dryRun: true, planned: row };
  const p = await fetch(`${wsUrl}/api/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataModel: { objects: nextObjects } }),
  });
  if (!p.ok) throw new Error(`PATCH ${p.status}: ${(await p.text()).slice(0, 300)}`);
  return { ok: true, dryRun: false, registered: row };
}

// ---------- task registry / dispatch ----------
const TASKS = {
  "build-served-agent-service": runBuildServedAgentService,
};

const handler = TASKS[args.task];
if (!handler) {
  process.stderr.write(
    `error: unknown --task "${args.task}". Known tasks: ${Object.keys(TASKS).join(", ")}\n`,
  );
  process.exit(2);
}

const result = await handler();

const summary = {
  ok: true,
  task: args.task,
  out: outRoot,
  dryRun: args.dryRun,
  force: args.force,
  filesPlanned: writes.length,
  filesCreated: writes.filter((w) => w.action === "created").length,
  filesOverwritten: writes.filter((w) => w.action === "overwritten").length,
  filesSkipped: writes.filter((w) => w.action === "skipped").length,
  seededConfig: result.seededConfig,
  registered: result.registered,
  writes,
  nextSteps: [
    `cd ${outRoot}`,
    "npm install",
    "cp .env.example .env",
    "npm run dev",
    `curl -sX POST http://127.0.0.1:${args.port}/healthz`,
  ],
};
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
