#!/usr/bin/env node
/**
 * Distillation export lane — reads `growthub.source-records.json`, selects sandbox receipts
 * produced by the `local-intelligence` adapter, and writes JSONL training pairs without adding
 * any new governed Data Model object type.
 *
 * Usage (from repo root or any directory containing the sidecar):
 *   node /path/to/repo/scripts/export-distillation-jsonl.mjs --in ./growthub.source-records.json --out ./distillation.jsonl
 *   node scripts/export-distillation-jsonl.mjs   # defaults: ./growthub.source-records.json → ./growthub-distillation.jsonl
 */

import fs from "node:fs";
import path from "node:path";

function readArgs(argv) {
  const out = { inPath: "", outPath: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--in" && argv[i + 1]) {
      out.inPath = argv[i + 1];
      i += 1;
    } else if (a === "--out" && argv[i + 1]) {
      out.outPath = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function isLocalIntelligenceReceipt(rec) {
  if (!rec || typeof rec !== "object") return false;
  if (String(rec.adapter || "").trim() === "local-intelligence") return true;
  const out = String(rec.stdout || "");
  return out.includes("growthub-local-model-sandbox-v1") || out.includes('"adapter":"local-intelligence"');
}

function trainingPairFromReceipt(rec) {
  const instructions = String(rec.instructions || "").trim();
  const command = String(rec.command || "").trim();
  const prompt = [instructions && `Instructions:\n${instructions}`, command && `Prompt:\n${command}`]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const completion = String(rec.stdout || "").trim();
  return {
    prompt: prompt || "(empty sandbox prompt)",
    completion,
    metadata: {
      runId: rec.runId || null,
      ranAt: rec.ranAt || null,
      adapter: rec.adapter || null,
      modelId: rec.modelId ?? rec.localModel ?? null,
      durationMs: typeof rec.durationMs === "number" ? rec.durationMs : null,
      exitCode: rec.exitCode ?? null
    }
  };
}

function main() {
  const { inPath, outPath } = readArgs(process.argv);
  const cwd = process.cwd();
  const resolvedIn = inPath ? path.resolve(inPath) : path.join(cwd, "growthub.source-records.json");
  const resolvedOut = outPath ? path.resolve(outPath) : path.join(cwd, "growthub-distillation.jsonl");

  if (!fs.existsSync(resolvedIn)) {
    console.error(`export-distillation-jsonl: missing input file ${resolvedIn}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(resolvedIn, "utf8");
  let all;
  try {
    all = JSON.parse(raw);
  } catch (e) {
    console.error(`export-distillation-jsonl: invalid JSON in ${resolvedIn}: ${e.message}`);
    process.exit(1);
  }

  const lines = [];
  for (const [sourceId, bucket] of Object.entries(all)) {
    if (!bucket || typeof bucket !== "object") continue;
    const records = Array.isArray(bucket.records) ? bucket.records : [];
    for (const rec of records) {
      if (!isLocalIntelligenceReceipt(rec)) continue;
      const pair = trainingPairFromReceipt(rec);
      if (!pair.completion) continue;
      lines.push(JSON.stringify(pair));
    }
  }

  fs.writeFileSync(resolvedOut, `${lines.join("\n")}${lines.length ? "\n" : ""}`, "utf8");
  console.log(
    JSON.stringify({ input: resolvedIn, output: resolvedOut, lineCount: lines.length }, null, 2)
  );
}

main();
