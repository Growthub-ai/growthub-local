#!/usr/bin/env node
/**
 * helpers/scaffold-agent-service.mjs — Served Agent Microservice Scaffold
 *
 * One-time scaffolding helper (idempotent with --check). Creates two directories
 * in the governed workspace:
 *
 *   agent-service/        Express server (OpenAI-compatible + /workspace/query)
 *   sdk/                  @growthub/agent-sdk stub (npm-publishable)
 *
 * The agent-api-server and sdk-dev-client sandbox rows invoke these artifacts.
 * Re-running after `push-gguf-to-agent-service.mjs` does NOT overwrite the server
 * or SDK — only models/ and Modelfile are managed by the push helper.
 *
 * Usage:
 *   node helpers/scaffold-agent-service.mjs                  # create if absent
 *   node helpers/scaffold-agent-service.mjs --check          # verify then exit 0/1
 *   node helpers/scaffold-agent-service.mjs --force          # overwrite existing files
 *   node helpers/scaffold-agent-service.mjs --out ./my-ws    # custom workspace root
 */

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const a = { check: false, force: false, out: "." };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    const next = () => String(argv[++i] || "").trim();
    if (t === "--check") a.check = true;
    else if (t === "--force") a.force = true;
    else if (t === "--out") a.out = next();
    else if (t === "--help" || t === "-h") {
      process.stdout.write(
        "Usage: scaffold-agent-service.mjs [--check] [--force] [--out <workspace-root>]\n",
      );
      process.exit(0);
    }
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const wsRoot = path.resolve(args.out);

// ---------- file map ----------
// Each entry: [relPath, content]
const SERVER_FILES = [
  [
    "agent-service/package.json",
    JSON.stringify(
      {
        name: "growthub-agent-service",
        version: "0.1.0",
        description: "Growthub Agent Service — OpenAI-compatible Express server fronting a distilled local expert GGUF via Ollama.",
        main: "server.js",
        scripts: {
          start: "node server.js",
          dev: "node --watch server.js",
        },
        dependencies: {
          express: "^4.18.2",
          cors: "^2.8.5",
        },
        engines: { node: ">=20" },
        license: "MIT",
      },
      null,
      2,
    ) + "\n",
  ],
  [
    "agent-service/server.js",
    `#!/usr/bin/env node
/**
 * agent-service/server.js
 *
 * Minimal Express server that wraps Ollama's /v1/chat/completions endpoint,
 * providing:
 *   - GET  /health                    — liveness probe
 *   - POST /v1/chat/completions       — OpenAI-compatible drop-in
 *   - POST /workspace/query           — governed AWaC-aware endpoint
 *
 * Environment variables (all optional):
 *   AGENT_SERVICE_PORT   Port to bind (default 8080)
 *   AGENT_MODEL_NAME     Ollama model name (default growthub-local-expert)
 *   OLLAMA_HOST          Ollama base URL (default http://127.0.0.1:11434)
 *
 * Start: node agent-service/server.js
 */

import express from "express";
import cors from "cors";

const PORT = Number(process.env.AGENT_SERVICE_PORT || 8080);
const MODEL = process.env.AGENT_MODEL_NAME || "growthub-local-expert";
const OLLAMA = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\\/+$/, "");

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

// Liveness probe
app.get("/health", (_req, res) => {
  res.json({ ok: true, model: MODEL, ollamaHost: OLLAMA, ts: new Date().toISOString() });
});

// OpenAI-compatible passthrough — agent frameworks that target OpenAI can point
// their baseURL at this server and get the distilled model instead.
app.post("/v1/chat/completions", async (req, res) => {
  const body = {
    ...req.body,
    model: req.body.model || MODEL,
  };
  try {
    const upstream = await fetch(\`\${OLLAMA}/v1/chat/completions\`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    res.status(upstream.status);
    for (const [k, v] of upstream.headers) {
      if (["content-type", "transfer-encoding"].includes(k.toLowerCase())) res.setHeader(k, v);
    }
    if (req.body.stream) {
      upstream.body.pipeTo(
        new WritableStream({ write: (chunk) => res.write(chunk), close: () => res.end() }),
      );
    } else {
      const json = await upstream.json();
      res.json(json);
    }
  } catch (e) {
    res.status(502).json({ error: { message: e.message, type: "upstream_error" } });
  }
});

// Governed endpoint: accepts a plain-text query and wraps it in the model's
// system prompt before forwarding to Ollama. Returns { answer, model, ms }.
app.post("/workspace/query", async (req, res) => {
  const query = String(req.body?.query || req.body?.message || "").trim();
  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }
  const started = Date.now();
  try {
    const upstream = await fetch(\`\${OLLAMA}/v1/chat/completions\`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        messages: [{ role: "user", content: query }],
      }),
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(502).json({ error: \`ollama \${upstream.status}: \${text.slice(0, 300)}\` });
    }
    const json = await upstream.json();
    const answer = json?.choices?.[0]?.message?.content || "";
    res.json({ answer, model: MODEL, ms: Date.now() - started });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(
    JSON.stringify({ ok: true, listening: \`http://127.0.0.1:\${PORT}\`, model: MODEL, ollama: OLLAMA }) + "\\n",
  );
});
`,
  ],
  [
    "agent-service/.env.example",
    `# agent-service/.env.example
# Copy to .env and fill in values before running node server.js

AGENT_SERVICE_PORT=8080
AGENT_MODEL_NAME=growthub-local-expert
OLLAMA_HOST=http://127.0.0.1:11434
`,
  ],
  [
    "agent-service/Dockerfile",
    `# agent-service/Dockerfile
# Builds the Growthub Agent Service image.
# Requires a running Ollama sidecar with the GGUF model loaded.
#
# Build: docker build -t growthub-agent-service .
# Run:   docker run -e OLLAMA_HOST=http://host.docker.internal:11434 -p 8080:8080 growthub-agent-service

FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY server.js .
ENV AGENT_SERVICE_PORT=8080
ENV AGENT_MODEL_NAME=growthub-local-expert
ENV OLLAMA_HOST=http://host.docker.internal:11434
EXPOSE 8080
CMD ["node", "server.js"]
`,
  ],
  [
    "agent-service/README.md",
    `# Growthub Agent Service

Minimal OpenAI-compatible Express server fronting a distilled local expert GGUF via Ollama.

## Quickstart

\`\`\`bash
# 1. Install dependencies
cd agent-service && npm install

# 2. Ensure Ollama is running and the model is loaded
#    (run the gguf-push-worker sandbox or push manually)

# 3. Start the server
node server.js

# 4. Verify
curl http://localhost:8080/health
\`\`\`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Liveness probe |
| POST | /v1/chat/completions | OpenAI-compatible passthrough |
| POST | /workspace/query | Governed AWaC-aware endpoint |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| AGENT_SERVICE_PORT | 8080 | Port to bind |
| AGENT_MODEL_NAME | growthub-local-expert | Ollama model name |
| OLLAMA_HOST | http://127.0.0.1:11434 | Ollama base URL |

## Model Updates

Run \`node helpers/push-gguf-to-agent-service.mjs\` after each Unsloth distillation
cycle to hot-reload the model without restarting the server.
`,
  ],
];

const SDK_FILES = [
  [
    "sdk/package.json",
    JSON.stringify(
      {
        name: "@growthub/agent-sdk",
        version: "0.1.0",
        description: "Thin SDK client for the Growthub Agent Service. Zero-dependency, Node 20+.",
        main: "index.js",
        exports: { ".": "./index.js" },
        scripts: { test: "node examples/query.js" },
        keywords: ["growthub", "agent", "sdk", "awac"],
        license: "MIT",
        engines: { node: ">=20" },
      },
      null,
      2,
    ) + "\n",
  ],
  [
    "sdk/index.js",
    `/**
 * @growthub/agent-sdk — v0.1.0
 *
 * Zero-dependency client for the Growthub Agent Service.
 * Targets the /workspace/query governed endpoint by default.
 * Can also be used as a thin OpenAI-compatible client.
 *
 * Usage:
 *   import { GrowthubAgent } from "@growthub/agent-sdk";
 *   const agent = new GrowthubAgent({ baseUrl: "http://localhost:8080" });
 *   const { answer } = await agent.query("What is the safest path to add a Data Model object?");
 */

export class GrowthubAgent {
  /**
   * @param {object}  opts
   * @param {string}  [opts.baseUrl]   Agent service base URL (default http://localhost:8080)
   * @param {string}  [opts.apiKey]    Optional Bearer token for auth-gated deployments
   * @param {number}  [opts.timeoutMs] Fetch timeout in ms (default 30000)
   */
  constructor(opts = {}) {
    this.baseUrl = (opts.baseUrl || process.env.AGENT_SERVICE_URL || "http://localhost:8080").replace(/\\/+$/, "");
    this.apiKey = opts.apiKey || process.env.AGENT_SERVICE_API_KEY || "";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  _headers() {
    const h = { "content-type": "application/json" };
    if (this.apiKey) h["authorization"] = \`Bearer \${this.apiKey}\`;
    return h;
  }

  /**
   * POST /workspace/query — governed AWaC-aware endpoint.
   * @param {string} query
   * @returns {Promise<{ answer: string, model: string, ms: number }>}
   */
  async query(query) {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const r = await fetch(\`\${this.baseUrl}/workspace/query\`, {
        method: "POST",
        headers: this._headers(),
        body: JSON.stringify({ query }),
        signal: ac.signal,
      });
      if (!r.ok) throw new Error(\`agent-service \${r.status}: \${(await r.text()).slice(0, 300)}\`);
      return await r.json();
    } finally {
      clearTimeout(tid);
    }
  }

  /**
   * POST /v1/chat/completions — OpenAI-compatible passthrough.
   * @param {object} body  OpenAI chat completions request body
   * @returns {Promise<object>} OpenAI chat completions response
   */
  async chat(body) {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const r = await fetch(\`\${this.baseUrl}/v1/chat/completions\`, {
        method: "POST",
        headers: this._headers(),
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!r.ok) throw new Error(\`agent-service \${r.status}: \${(await r.text()).slice(0, 300)}\`);
      return await r.json();
    } finally {
      clearTimeout(tid);
    }
  }

  /**
   * GET /health — liveness probe.
   * @returns {Promise<{ ok: boolean, model: string, ollamaHost: string, ts: string }>}
   */
  async health() {
    const r = await fetch(\`\${this.baseUrl}/health\`, { headers: this._headers() });
    if (!r.ok) throw new Error(\`health check failed: \${r.status}\`);
    return await r.json();
  }
}

// CommonJS interop for environments that do not use ESM
if (typeof module !== "undefined") {
  module.exports = { GrowthubAgent };
  module.exports.GrowthubAgent = GrowthubAgent;
}
`,
  ],
  [
    "sdk/examples/query.js",
    `#!/usr/bin/env node
/**
 * sdk/examples/query.js — smoke test for the sdk-dev-client sandbox.
 *
 * Sends one query to the running agent-api-server and prints the governed response.
 * Override the prompt via AGENT_SDK_QUERY env var or the first CLI argument.
 *
 * Usage:
 *   node sdk/examples/query.js
 *   AGENT_SDK_QUERY="What primitives govern a Data Model PATCH?" node sdk/examples/query.js
 */

import { GrowthubAgent } from "../index.js";

const query =
  process.argv[2] ||
  process.env.AGENT_SDK_QUERY ||
  "What is the safest path to add a new custom Data Model object in a governed AWaC workspace?";

const agent = new GrowthubAgent({
  baseUrl: process.env.AGENT_SERVICE_URL || \`http://localhost:\${process.env.AGENT_SERVICE_PORT || 8080}\`,
});

process.stdout.write(\`[sdk-query] querying: \${query.slice(0, 80)}...\n\`);

try {
  const { answer, model, ms } = await agent.query(query);
  process.stdout.write(
    JSON.stringify({ ok: true, model, ms, answerLength: answer.length, answer }, null, 2) + "\n",
  );
} catch (e) {
  process.stderr.write(\`[sdk-query] error: \${e.message}\n\`);
  process.exit(1);
}
`,
  ],
  [
    "sdk/README.md",
    `# @growthub/agent-sdk

Zero-dependency Node 20+ client for the Growthub Agent Service.

## Install (from local workspace)

\`\`\`bash
npm install ./sdk
# or from npm once published:
# npm install @growthub/agent-sdk
\`\`\`

## Usage

\`\`\`js
import { GrowthubAgent } from "@growthub/agent-sdk";

const agent = new GrowthubAgent({ baseUrl: "http://localhost:8080" });

// Governed AWaC-aware query
const { answer, model, ms } = await agent.query(
  "What is the safest path to add a new custom Data Model object?"
);
console.log(answer);

// OpenAI-compatible chat (drop-in for any OpenAI client)
const res = await agent.chat({
  messages: [{ role: "user", content: "Summarize AGENTS.md governance rules." }],
});
console.log(res.choices[0].message.content);
\`\`\`

## Constructor Options

| Option | Default | Description |
|--------|---------|-------------|
| baseUrl | http://localhost:8080 | Agent service URL |
| apiKey | — | Optional Bearer token |
| timeoutMs | 30000 | Fetch timeout |

## Environment Variables

| Variable | Description |
|----------|-------------|
| AGENT_SERVICE_URL | Overrides \`baseUrl\` |
| AGENT_SERVICE_API_KEY | Overrides \`apiKey\` |
| AGENT_SERVICE_PORT | Used by examples/ when AGENT_SERVICE_URL is not set |
`,
  ],
];

// ---------- check mode ----------
if (args.check) {
  const missing = [];
  for (const [rel] of [...SERVER_FILES, ...SDK_FILES]) {
    const full = path.join(wsRoot, rel);
    if (!fs.existsSync(full)) missing.push(rel);
  }
  if (missing.length === 0) {
    process.stdout.write(JSON.stringify({ ok: true, message: "agent-service and sdk scaffold present" }) + "\n");
    process.exit(0);
  } else {
    process.stdout.write(
      JSON.stringify({ ok: false, missing }, null, 2) + "\n",
    );
    process.stderr.write(
      `[scaffold] ${missing.length} file(s) missing — run scaffold-agent-service.mjs to create them\n`,
    );
    process.exit(1);
  }
}

// ---------- write files ----------
let written = 0;
let skipped = 0;

for (const [rel, content] of [...SERVER_FILES, ...SDK_FILES]) {
  const full = path.join(wsRoot, rel);
  if (fs.existsSync(full) && !args.force) {
    process.stdout.write(`[scaffold] skip (exists) ${rel}\n`);
    skipped += 1;
    continue;
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  process.stdout.write(`[scaffold] wrote ${rel}\n`);
  written += 1;
}

process.stdout.write(
  "\n" +
    JSON.stringify(
      {
        ok: true,
        written,
        skipped,
        note: skipped > 0 ? "Re-run with --force to overwrite existing files." : undefined,
        nextSteps: [
          "cd agent-service && npm install",
          "node helpers/push-gguf-to-agent-service.mjs --gguf <your-gguf>",
          "node agent-service/server.js",
          "node sdk/examples/query.js",
        ],
      },
      null,
      2,
    ) +
    "\n",
);
