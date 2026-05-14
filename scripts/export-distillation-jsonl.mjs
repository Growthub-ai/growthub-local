#!/usr/bin/env node
/**
 * Distillation export lane — reads `growthub.source-records.json`, selects sandbox
 * receipts where `adapter === "local-intelligence"`, and writes JSONL training
 * pairs (prompt / completion / metadata). Does not add governed object types.
 *
 * Usage (from a forked workspace app root, or pass an explicit path):
 *   node /path/to/repo/scripts/export-distillation-jsonl.mjs
 *   node scripts/export-distillation-jsonl.mjs --records ./growthub.source-records.json --out ./distillation.jsonl
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = { recordsPath: null, outPath: null };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--records" && argv[i + 1]) {
      out.recordsPath = path.resolve(argv[i + 1]);
      i += 1;
    } else if (a === "--out" && argv[i + 1]) {
      out.outPath = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return out;
}

function defaultRecordsPath() {
  const cwd = process.cwd();
  const here = path.join(cwd, "growthub.source-records.json");
  if (fs.existsSync(here)) return here;
  return path.join(repoRoot, "growthub.source-records.json");
}

function trainingLineFromRun(sourceId, record) {
  const instructions = typeof record.instructions === "string" ? record.instructions.trim() : "";
  const command = typeof record.command === "string" ? record.command.trim() : "";
  const prompt = [instructions, command].filter(Boolean).join("\n\n");
  const stdout = typeof record.stdout === "string" ? record.stdout.trim() : "";
  const modelId =
    (record.adapterMeta && typeof record.adapterMeta.model === "string" && record.adapterMeta.model.trim()) ||
    null;
  return {
    prompt,
    completion: stdout,
    metadata: {
      runId: record.runId ?? null,
      ranAt: record.ranAt ?? null,
      sourceId,
      modelId,
      durationMs: typeof record.durationMs === "number" ? record.durationMs : null,
      adapter: record.adapter ?? null
    }
  };
}

function main() {
  const args = parseArgs(process.argv);
  const recordsPath = args.recordsPath || defaultRecordsPath();
  if (!fs.existsSync(recordsPath)) {
    console.error(`export-distillation-jsonl: file not found: ${recordsPath}`);
    process.exit(1);
  }
  let all;
  try {
    all = JSON.parse(fs.readFileSync(recordsPath, "utf8"));
  } catch (e) {
    console.error(`export-distillation-jsonl: invalid JSON: ${e.message}`);
    process.exit(1);
  }
  if (!all || typeof all !== "object" || Array.isArray(all)) {
    console.error("export-distillation-jsonl: expected object keyed by sourceId");
    process.exit(1);
  }

  const lines = [];
  for (const [sourceId, bucket] of Object.entries(all)) {
    if (!bucket || typeof bucket !== "object") continue;
    const records = Array.isArray(bucket.records) ? bucket.records : [];
    for (const record of records) {
      if (String(record?.adapter || "").trim() !== "local-intelligence") continue;
      lines.push(JSON.stringify(trainingLineFromRun(sourceId, record)));
    }
  }

  const payload = `${lines.join("\n")}${lines.length ? "\n" : ""}`;
  if (args.outPath) {
    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, payload, "utf8");
    process.stdout.write(`wrote ${lines.length} records → ${args.outPath}\n`);
  } else {
    process.stdout.write(payload);
  }
}

main();
