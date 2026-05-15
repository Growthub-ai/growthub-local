#!/usr/bin/env node
/**
 * helpers/push-gguf-to-agent-service.mjs — Distillation Pipeline V1, Phase 4
 *
 * Bridges the distillation loop to the persistent served-agent microservice.
 * After `export-training-traces.mjs` produces a new GGUF via Unsloth, this
 * helper:
 *
 *   1. Copies the GGUF to `<service-path>/models/` with a versioned filename.
 *   2. Writes/updates `<service-path>/models/manifest.json` (version index).
 *   3. Writes/updates `<service-path>/Modelfile` pointing at the new GGUF.
 *   4. Optionally runs `ollama create <model-name> -f <service-path>/Modelfile`
 *      to hot-reload the model in a running Ollama instance.
 *
 * The resulting `agent-service/` tree is what `agent-api-server` sandbox loads.
 * Run this after every Unsloth distillation cycle — it is the Phase 3 → Phase 4
 * handoff in the full flywheel.
 *
 * Usage:
 *   node helpers/push-gguf-to-agent-service.mjs \
 *     --gguf      ./models/growthub-local-expert-latest.gguf \
 *     --service-path ./agent-service \
 *     --model-name   growthub-local-expert \
 *     [--version     v3]          # auto-derived from timestamp when omitted
 *     [--ollama-host http://127.0.0.1:11434]
 *     [--skip-ollama-create]      # skip `ollama create` even if Ollama is up
 *     [--dry-run]                 # plan without writing files
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// ---------- arg parsing ----------
function parseArgs(argv) {
  const a = {
    gguf: "",
    servicePath: "./agent-service",
    modelName: "growthub-local-expert",
    version: "",
    ollamaHost: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
    skipOllamaCreate: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    const next = () => String(argv[++i] || "").trim();
    if (t === "--gguf") a.gguf = next();
    else if (t === "--service-path") a.servicePath = next();
    else if (t === "--model-name") a.modelName = next();
    else if (t === "--version") a.version = next();
    else if (t === "--ollama-host") a.ollamaHost = next();
    else if (t === "--skip-ollama-create") a.skipOllamaCreate = true;
    else if (t === "--dry-run") a.dryRun = true;
    else if (t === "--help" || t === "-h") {
      process.stdout.write(
        "Usage: push-gguf-to-agent-service.mjs --gguf <path> [--service-path <path>] [--model-name <name>] [--version <tag>] [--ollama-host <url>] [--skip-ollama-create] [--dry-run]\n",
      );
      process.exit(0);
    }
  }
  if (!a.gguf) {
    process.stderr.write("error: --gguf is required\n");
    process.exit(2);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const ggufSrc = path.resolve(args.gguf);
const serviceRoot = path.resolve(args.servicePath);
const modelsDir = path.join(serviceRoot, "models");
const modelfileOut = path.join(serviceRoot, "Modelfile");
const manifestOut = path.join(modelsDir, "manifest.json");

// ---------- validate source ----------
if (!fs.existsSync(ggufSrc)) {
  process.stderr.write(`error: GGUF not found: ${ggufSrc}\n`);
  process.exit(2);
}

const stat = fs.statSync(ggufSrc);
const ggufBytes = stat.size;

// ---------- derive version tag ----------
const versionTag = args.version.trim() ||
  `v${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`;

const destFilename = `${args.modelName}-${versionTag}.gguf`;
const destLatestFilename = `${args.modelName}-latest.gguf`;
const destPath = path.join(modelsDir, destFilename);
const destLatestPath = path.join(modelsDir, destLatestFilename);

// ---------- plan summary ----------
process.stdout.write(
  JSON.stringify(
    {
      phase: "push-gguf-to-agent-service",
      dryRun: args.dryRun,
      src: ggufSrc,
      ggufBytes,
      serviceRoot,
      destVersioned: destPath,
      destLatest: destLatestPath,
      modelfile: modelfileOut,
      manifest: manifestOut,
      modelName: args.modelName,
      version: versionTag,
      ollamaHost: args.ollamaHost,
      skipOllamaCreate: args.skipOllamaCreate,
    },
    null,
    2,
  ) + "\n",
);

if (args.dryRun) {
  process.stdout.write("[dry-run] no files written\n");
  process.exit(0);
}

// ---------- write files ----------
fs.mkdirSync(modelsDir, { recursive: true });

// 1. Copy versioned GGUF
fs.copyFileSync(ggufSrc, destPath);
process.stdout.write(`[push] copied GGUF → ${destPath}\n`);

// 2. Overwrite the stable "-latest" symlink target (plain copy so cross-OS safe)
fs.copyFileSync(ggufSrc, destLatestPath);
process.stdout.write(`[push] updated latest → ${destLatestPath}\n`);

// 3. Write/update manifest.json
let manifest = { modelName: args.modelName, versions: [] };
if (fs.existsSync(manifestOut)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestOut, "utf8"));
    if (!Array.isArray(manifest.versions)) manifest.versions = [];
  } catch {
    // start fresh on corrupt manifest
    manifest = { modelName: args.modelName, versions: [] };
  }
}
manifest.modelName = args.modelName;
manifest.latest = versionTag;
manifest.updatedAt = new Date().toISOString();
manifest.versions = [
  {
    version: versionTag,
    filename: destFilename,
    bytes: ggufBytes,
    pushedAt: new Date().toISOString(),
    srcGguf: ggufSrc,
  },
  // keep up to 10 prior version entries
  ...manifest.versions.filter((v) => v.version !== versionTag).slice(0, 9),
];
fs.writeFileSync(manifestOut, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`[push] manifest updated → ${manifestOut}\n`);

// 4. Write Modelfile (Ollama format, FROM uses absolute path so `ollama create` works anywhere)
const modelfileContent = [
  `# Growthub Agent Service — Ollama Modelfile`,
  `# Auto-generated by push-gguf-to-agent-service.mjs on ${new Date().toISOString()}`,
  `# Re-run the helper after each Unsloth distillation cycle to hot-reload.`,
  ``,
  `FROM ${destLatestPath}`,
  ``,
  `PARAMETER temperature 0.2`,
  `PARAMETER top_p 0.9`,
  `PARAMETER repeat_penalty 1.1`,
  `PARAMETER num_ctx 4096`,
  ``,
  `SYSTEM """`,
  `You are ${args.modelName}, the Growthub governed workspace expert.`,
  `You have been distilled from high-signal Cursor agent traces on the growthub-local`,
  `repository and fine-tuned on AWaC V2 invariants, PATCH allowlist boundaries, and`,
  `governed Data Model primitives.`,
  ``,
  `Rules:`,
  `1. Always anchor answers to AGENTS.md contract order.`,
  `2. For any task, map required primitives first, then provide the safest executable path.`,
  `3. Block any request that violates a PATCH allowlist invariant or protected boundary.`,
  `4. Return responses in the format the caller expects (plain prose, JSON, or shell).`,
  `"""`,
].join("\n");

fs.writeFileSync(modelfileOut, `${modelfileContent}\n`, "utf8");
process.stdout.write(`[push] Modelfile updated → ${modelfileOut}\n`);

// ---------- optional: ollama create ----------
if (!args.skipOllamaCreate) {
  process.stdout.write(`[push] attempting ollama create ${args.modelName} ...\n`);
  const r = spawnSync(
    "ollama",
    ["create", args.modelName, "-f", modelfileOut],
    { encoding: "utf8", timeout: 300_000 },
  );
  if (r.status === 0) {
    process.stdout.write(`[push] ollama create succeeded\n`);
    if (r.stdout) process.stdout.write(r.stdout);
  } else {
    process.stderr.write(
      `warn: ollama create failed (exit ${r.status}) — model not hot-reloaded.\n` +
        "      Restart the agent-api-server sandbox manually after Ollama is running.\n",
    );
    if (r.stderr) process.stderr.write(r.stderr);
  }
} else {
  process.stdout.write("[push] --skip-ollama-create: skipping `ollama create`\n");
}

// ---------- result ----------
process.stdout.write(
  "\n" +
    JSON.stringify(
      {
        ok: true,
        modelName: args.modelName,
        version: versionTag,
        destVersioned: destPath,
        destLatest: destLatestPath,
        manifest: manifestOut,
        modelfile: modelfileOut,
        ggufBytes,
        ollamaCreateSkipped: args.skipOllamaCreate,
      },
      null,
      2,
    ) +
    "\n",
);
