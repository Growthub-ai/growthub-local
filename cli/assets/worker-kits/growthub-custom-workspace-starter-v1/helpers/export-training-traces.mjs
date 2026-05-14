#!/usr/bin/env node
/**
 * helpers/export-training-traces.mjs — Distillation Pipeline V1, Phase 3
 *
 * Reads `training-traces.rows` from the live workspace, filters rows where
 * qualityScore >= --min-score AND exported == "false", emits an Unsloth-ready
 * JSONL of {instruction, input, output} on disk, then PATCHes the same rows
 * with exported = "true" so they are not re-exported on the next run.
 *
 * Output format (one JSON object per line):
 *   {"instruction": "<system + task>", "input": "<user prompt>", "output": "<agent output>"}
 *
 * Usage:
 *   node helpers/export-training-traces.mjs \
 *     --workspace http://localhost:3000 \
 *     --traces-object training-traces \
 *     --min-score 4 \
 *     --out ./antonio/distillation/unsloth-batch-001.jsonl \
 *     --instruction "You are growthub-local-expert. Respect AWaC V2 invariants and the PATCH allowlist." \
 *     [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const a = {
    workspace: "http://localhost:3000",
    tracesObject: "training-traces",
    minScore: 4,
    out: "",
    instruction: "You are growthub-local-expert. Respect AWaC V2 invariants and the PATCH allowlist.",
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    const next = () => String(argv[++i] || "").trim();
    if (t === "--workspace") a.workspace = next().replace(/\/+$/, "");
    else if (t === "--traces-object") a.tracesObject = next();
    else if (t === "--min-score") a.minScore = Number(next()) || 4;
    else if (t === "--out") a.out = next();
    else if (t === "--instruction") a.instruction = next();
    else if (t === "--dry-run") a.dryRun = true;
    else if (t === "--help" || t === "-h") {
      process.stdout.write(
        "Usage: export-training-traces.mjs [--workspace URL] [--traces-object id] [--min-score N] --out <path> [--instruction TEXT] [--dry-run]\n",
      );
      process.exit(0);
    }
  }
  if (!a.out) {
    process.stderr.write("error: --out is required\n");
    process.exit(2);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const outAbs = path.resolve(args.out);
fs.mkdirSync(path.dirname(outAbs), { recursive: true });

async function getObjects() {
  const r = await fetch(`${args.workspace}/api/workspace`, { cache: "no-store" });
  if (!r.ok) throw new Error(`GET /api/workspace ${r.status}`);
  return (await r.json()).workspaceConfig.dataModel.objects;
}
async function patchObjects(objects) {
  const r = await fetch(`${args.workspace}/api/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataModel: { objects } }),
  });
  if (!r.ok) throw new Error(`PATCH ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

const objects = await getObjects();
const tracesIdx = objects.findIndex((o) => o.id === args.tracesObject);
if (tracesIdx < 0) {
  process.stderr.write(`error: object ${args.tracesObject} not found in workspace\n`);
  process.exit(3);
}
const tracesObj = objects[tracesIdx];
const allRows = Array.isArray(tracesObj.rows) ? tracesObj.rows : [];

const eligible = allRows
  .map((row, idx) => ({ row, idx }))
  .filter(({ row }) =>
    Number(row.qualityScore) >= args.minScore &&
    String(row.exported || "false").toLowerCase() !== "true" &&
    String(row.inputPrompt || "").trim() &&
    String(row.agentOutput || "").trim(),
  );

if (eligible.length === 0) {
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        out: outAbs,
        eligible: 0,
        exported: 0,
        totalRows: allRows.length,
        reason: "no rows match score >= min-score AND exported == false",
      },
      null,
      2,
    ) + "\n",
  );
  process.exit(0);
}

const outStream = fs.createWriteStream(outAbs, { encoding: "utf8" });
for (const { row } of eligible) {
  const sample = {
    instruction: args.instruction,
    input: String(row.inputPrompt),
    output: String(row.agentOutput),
  };
  outStream.write(`${JSON.stringify(sample)}\n`);
}
await new Promise((r) => outStream.end(r));

if (!args.dryRun) {
  const eligibleIdx = new Set(eligible.map((e) => e.idx));
  const updatedRows = allRows.map((row, i) => (eligibleIdx.has(i) ? { ...row, exported: "true" } : row));
  const nextObjects = objects.map((o, i) => (i !== tracesIdx ? o : { ...o, rows: updatedRows }));
  await patchObjects(nextObjects);
}

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      out: outAbs,
      totalRows: allRows.length,
      eligible: eligible.length,
      exported: args.dryRun ? 0 : eligible.length,
      dryRun: args.dryRun,
      format: "unsloth-jsonl-v1 ({instruction, input, output})",
    },
    null,
    2,
  ) + "\n",
);
