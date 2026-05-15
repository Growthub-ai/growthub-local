#!/usr/bin/env node
/**
 * helpers/publish-served-agent-model.mjs — Distillation Pipeline V1, Phase 4
 *
 * Copies a promoted growthub-local-expert GGUF into the generated served-agent
 * workspace and, optionally, into a standalone agent-service repo. Each
 * destination receives a growthub-agent-model.json manifest with byte size and
 * SHA-256 metadata so deployment systems can treat the model as a frozen asset.
 *
 * Usage:
 *   node helpers/publish-served-agent-model.mjs \
 *     --model ./distillation/growthub-local-expert-v1.gguf \
 *     --workspace-model-dir ./apps/agent-service/models \
 *     --service-repo "${GROWTHUB_AGENT_SERVICE_HOME:-$HOME/growthub-agent-service}"
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    model: "",
    workspaceModelDir: "./apps/agent-service/models",
    serviceRepo: "",
    serviceModelDir: "models",
    filename: "",
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = () => String(argv[++i] || "").trim();
    if (token === "--model") args.model = next();
    else if (token === "--workspace-model-dir") args.workspaceModelDir = next();
    else if (token === "--service-repo") args.serviceRepo = next();
    else if (token === "--service-model-dir") args.serviceModelDir = next();
    else if (token === "--filename") args.filename = next();
    else if (token === "--dry-run") args.dryRun = true;
    else if (token === "--help" || token === "-h") {
      process.stdout.write(
        [
          "Usage: publish-served-agent-model.mjs --model <model.gguf>",
          "  [--workspace-model-dir ./apps/agent-service/models]",
          "  [--service-repo <path>]",
          "  [--service-model-dir models]",
          "  [--filename <name.gguf>]",
          "  [--dry-run]"
        ].join("\n") + "\n"
      );
      process.exit(0);
    }
  }

  if (!args.model) {
    process.stderr.write("error: --model is required\n");
    process.exit(2);
  }
  return args;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function destination(label, dir, filename) {
  const absDir = path.resolve(dir);
  return {
    label,
    dir: absDir,
    modelPath: path.join(absDir, filename),
    manifestPath: path.join(absDir, "growthub-agent-model.json")
  };
}

const args = parseArgs(process.argv.slice(2));
const modelPath = path.resolve(args.model);
if (!fs.existsSync(modelPath)) {
  process.stderr.write(`error: model not found: ${modelPath}\n`);
  process.exit(2);
}
if (path.extname(modelPath).toLowerCase() !== ".gguf") {
  process.stderr.write(`error: model must be a .gguf file: ${modelPath}\n`);
  process.exit(2);
}

const filename = args.filename || path.basename(modelPath);
if (path.extname(filename).toLowerCase() !== ".gguf") {
  process.stderr.write(`error: --filename must end in .gguf: ${filename}\n`);
  process.exit(2);
}

const stat = fs.statSync(modelPath);
const sha256 = await sha256File(modelPath);
const destinations = [
  destination("workspace", args.workspaceModelDir, filename)
];
if (args.serviceRepo) {
  destinations.push(
    destination("service-repo", path.join(path.resolve(args.serviceRepo), args.serviceModelDir), filename)
  );
}

const manifest = {
  kind: "growthub-served-agent-model-manifest-v1",
  modelSlug: "growthub-local-expert",
  modelFile: filename,
  sourceModel: modelPath,
  sha256,
  bytes: stat.size,
  publishedAt: new Date().toISOString(),
  destinations: destinations.map((d) => ({ label: d.label, modelPath: d.modelPath }))
};

if (!args.dryRun) {
  for (const d of destinations) {
    fs.mkdirSync(d.dir, { recursive: true });
    fs.copyFileSync(modelPath, d.modelPath);
    fs.writeFileSync(d.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
}

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      dryRun: args.dryRun,
      model: modelPath,
      filename,
      sha256,
      bytes: stat.size,
      destinations
    },
    null,
    2
  ) + "\n"
);
