#!/usr/bin/env node
/**
 * helpers/upload-graded-traces.mjs — Distillation Pipeline V1, Phase 2.5
 *
 * Reads graded pairs JSONL (Phase 2 output) and appends rows whose
 * qualityScore >= --min-score into the live workspace's `training-traces`
 * dataModel object via PATCH /api/workspace.
 *
 * - Append-only. Existing rows are preserved.
 * - Marks every uploaded row with `exported: "false"` so the export script
 *   can pick them up later.
 * - Truncates `agentOutput` to keep the workspace config file lean.
 *
 * Usage:
 *   node helpers/upload-graded-traces.mjs \
 *     --in        ./antonio/distillation/graded-batch-001.jsonl \
 *     --workspace http://localhost:3000 \
 *     --traces-object training-traces \
 *     --min-score 4 \
 *     --max-output-chars 4000
 */

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const a = {
    in: "",
    workspace: "http://localhost:3000",
    tracesObject: "training-traces",
    minScore: 4,
    maxOutputChars: 4000,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    const next = () => String(argv[++i] || "").trim();
    if (t === "--in") a.in = next();
    else if (t === "--workspace") a.workspace = next().replace(/\/+$/, "");
    else if (t === "--traces-object") a.tracesObject = next();
    else if (t === "--min-score") a.minScore = Number(next()) || 4;
    else if (t === "--max-output-chars") a.maxOutputChars = Number(next()) || 4000;
    else if (t === "--help" || t === "-h") {
      process.stdout.write(
        "Usage: upload-graded-traces.mjs --in <graded.jsonl> [--workspace URL] [--traces-object id] [--min-score N] [--max-output-chars N]\n",
      );
      process.exit(0);
    }
  }
  if (!a.in) {
    process.stderr.write("error: --in is required\n");
    process.exit(2);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const inAbs = path.resolve(args.in);
if (!fs.existsSync(inAbs)) {
  process.stderr.write(`error: input not found: ${inAbs}\n`);
  process.exit(2);
}

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

const lines = fs.readFileSync(inAbs, "utf8").split("\n").filter(Boolean);
const candidates = [];
for (const ln of lines) {
  try {
    const j = JSON.parse(ln);
    if (Number(j.qualityScore) >= args.minScore) candidates.push(j);
  } catch {
    /* skip */
  }
}

if (candidates.length === 0) {
  process.stdout.write(JSON.stringify({ ok: true, uploaded: 0, reason: "no rows >= --min-score" }) + "\n");
  process.exit(0);
}

const objects = await getObjects();
const tracesIdx = objects.findIndex((o) => o.id === args.tracesObject);
if (tracesIdx < 0) {
  process.stderr.write(`error: object ${args.tracesObject} not found in workspace\n`);
  process.exit(3);
}
const tracesObj = objects[tracesIdx];
const newRows = candidates.map((p) => ({
  sessionDate: p.gradedAt || new Date().toISOString(),
  inputPrompt: String(p.inputPrompt || "").slice(0, args.maxOutputChars),
  agentOutput: String(p.agentOutput || "").slice(0, args.maxOutputChars),
  qualityScore: String(p.qualityScore),
  reason: String(p.qualityReason || ""),
  exported: "false",
}));

const nextObjects = objects.map((o, i) =>
  i !== tracesIdx ? o : { ...o, rows: [...(o.rows || []), ...newRows] },
);
await patchObjects(nextObjects);

const after = await getObjects();
const finalCount = after.find((o) => o.id === args.tracesObject)?.rows?.length || 0;
process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      candidates: candidates.length,
      uploaded: newRows.length,
      tracesTotalRows: finalCount,
      sourceFile: path.basename(inAbs),
    },
    null,
    2,
  ) + "\n",
);
