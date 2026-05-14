#!/usr/bin/env node
/**
 * helpers/grade-raw-pairs.mjs — Distillation Pipeline V1, Phase 2
 *
 * Grades pairs from `raw-pairs.jsonl` (Phase 1 output) by routing each one
 * through the live `critic-grader` sandbox row (local-intelligence /
 * gemma3:4b). The script never bypasses the workspace API: it PATCHes the
 * critic row's `command`, calls `POST /api/workspace/sandbox-run`, then
 * parses the strict-JSON `{score, reason}` envelope the grader returns.
 *
 * Quality boost: pairs whose `mergedToMain === true` (Phase 1 ground-truth
 * signal that the work was squash-merged on `main`) get a floor of 4.
 *
 * Output: newline-delimited JSON with the original pair fields plus
 *   - `qualityScore`     1-5 (string for downstream parity with training-traces)
 *   - `qualityReason`    one-sentence rationale from the grader
 *   - `criticRunMs`      latency
 *   - `criticRunId`      run id for traceability
 *   - `gradedAt`         ISO timestamp
 *   - `boostedByMerge`   true if mergedToMain forced the floor
 *
 * Streams to disk after each pair so partial progress survives a kill.
 *
 * Usage:
 *   node helpers/grade-raw-pairs.mjs \
 *     --in        ./antonio/distillation/raw-pairs.jsonl \
 *     --out       ./antonio/distillation/graded-batch-001.jsonl \
 *     --workspace http://localhost:3000 \
 *     --grader-row critic-grader \
 *     --sandbox-object sandboxes-alignment-loop \
 *     --limit 20 \
 *     --offset 0 \
 *     --max-input-chars 6000     # cap pair text to keep grader prompts safe
 */

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const a = {
    in: "",
    out: "",
    workspace: "http://localhost:3000",
    graderRow: "critic-grader",
    sandboxObject: "sandboxes-alignment-loop",
    limit: 20,
    offset: 0,
    maxInputChars: 6000,
    mergedOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    const next = () => String(argv[++i] || "").trim();
    if (t === "--in") a.in = next();
    else if (t === "--out") a.out = next();
    else if (t === "--workspace") a.workspace = next().replace(/\/+$/, "");
    else if (t === "--grader-row") a.graderRow = next();
    else if (t === "--sandbox-object") a.sandboxObject = next();
    else if (t === "--limit") a.limit = Number(next()) || 20;
    else if (t === "--offset") a.offset = Number(next()) || 0;
    else if (t === "--max-input-chars") a.maxInputChars = Number(next()) || 6000;
    else if (t === "--merged-only") a.mergedOnly = true;
    else if (t === "--help" || t === "-h") {
      process.stdout.write(
        "Usage: grade-raw-pairs.mjs --in <raw-pairs.jsonl> --out <graded.jsonl> [--workspace URL] [--grader-row name] [--sandbox-object id] [--limit N] [--offset N] [--max-input-chars N] [--merged-only]\n",
      );
      process.exit(0);
    }
  }
  if (!a.in || !a.out) {
    process.stderr.write("error: --in and --out are required\n");
    process.exit(2);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));

async function getWorkspaceObjects() {
  const r = await fetch(`${args.workspace}/api/workspace`, { cache: "no-store" });
  if (!r.ok) throw new Error(`GET /api/workspace ${r.status}`);
  const j = await r.json();
  return j.workspaceConfig.dataModel.objects;
}

async function patchObjects(objects) {
  const r = await fetch(`${args.workspace}/api/workspace`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataModel: { objects } }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`PATCH /api/workspace ${r.status}: ${t.slice(0, 300)}`);
  }
}

async function runGraderSandbox() {
  const r = await fetch(`${args.workspace}/api/workspace/sandbox-run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objectId: args.sandboxObject, name: args.graderRow }),
  });
  return r.json();
}

function setRowCommand(objects, rowName, command) {
  return objects.map((obj) => {
    if (obj.id !== args.sandboxObject) return obj;
    return {
      ...obj,
      rows: (obj.rows || []).map((row) => (row.Name === rowName ? { ...row, command } : row)),
    };
  });
}

function parseScoreFromGraderEnvelope(stdout) {
  if (!stdout) return null;
  try {
    const env = JSON.parse(stdout);
    if (env?.result?.json && typeof env.result.json.score === "number") {
      return { score: env.result.json.score, reason: String(env.result.json.reason || "") };
    }
    if (typeof env?.rawText === "string") {
      const outer = JSON.parse(env.rawText);
      const content = outer?.choices?.[0]?.message?.content;
      if (typeof content === "string") {
        const inner = JSON.parse(content);
        if (typeof inner?.score === "number") {
          return { score: inner.score, reason: String(inner.reason || "") };
        }
      }
    }
  } catch {
    // fall through
  }
  return null;
}

function buildGraderPrompt(pair, maxChars) {
  const promptHead = pair.inputPrompt.slice(0, Math.floor(maxChars / 3));
  const outputHead = pair.agentOutput.slice(0, maxChars - promptHead.length - 800);
  const lines = [
    "You are critic-grader for AWaC V2. Score this user→assistant pair from a Cursor session on the growthub-local repo.",
    "Criteria:",
    "  1) Clear understanding of the user request",
    "  2) Used appropriate tools / primitives",
    "  3) Respects AWaC V2 invariants (PATCH allowlist, no secret leaks, no protected-boundary edits)",
    "  4) Output is correct and actionable",
    "  5) Production-quality (would survive code review on this repo)",
    "Return ONLY strict JSON: {\"score\": <1-5 integer>, \"reason\": \"one short sentence\"}.",
    "",
    "USER PROMPT (truncated):",
    promptHead,
    "",
    "ASSISTANT RESPONSE (truncated):",
    outputHead,
  ];
  return lines.join("\n");
}

// ---------- read pairs ----------
const inAbs = path.resolve(args.in);
const outAbs = path.resolve(args.out);
fs.mkdirSync(path.dirname(outAbs), { recursive: true });

const allLines = fs.readFileSync(inAbs, "utf8").split("\n").filter(Boolean);
let pool = allLines;
if (args.mergedOnly) {
  pool = allLines.filter((ln) => {
    try {
      return JSON.parse(ln).mergedToMain === true;
    } catch {
      return false;
    }
  });
}
const slice = pool.slice(args.offset, args.offset + args.limit);

process.stdout.write(
  `[grade] in=${path.basename(inAbs)} totalLines=${allLines.length} pool=${pool.length}${args.mergedOnly ? " (mergedOnly)" : ""} offset=${args.offset} batch=${slice.length} -> ${path.basename(outAbs)}\n`,
);

const outStream = fs.createWriteStream(outAbs, { encoding: "utf8" });
const summary = {
  graded: 0,
  parseFailures: 0,
  scoreCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 0: 0 },
  boostedByMerge: 0,
  scoreSum: 0,
  startedAt: new Date().toISOString(),
};

for (let i = 0; i < slice.length; i += 1) {
  let pair;
  try {
    pair = JSON.parse(slice[i]);
  } catch {
    process.stderr.write(`[grade] skip line ${i}: not JSON\n`);
    continue;
  }

  const command = buildGraderPrompt(pair, args.maxInputChars);
  let parsedScore = null;
  let runMs = 0;
  let runId = "";
  let boosted = false;

  try {
    const objects = await getWorkspaceObjects();
    await patchObjects(setRowCommand(objects, args.graderRow, command));
    const startedAt = Date.now();
    const run = await runGraderSandbox();
    runMs = Date.now() - startedAt;
    runId = run?.runId || "";
    parsedScore = parseScoreFromGraderEnvelope(run?.response?.stdout);
  } catch (e) {
    process.stderr.write(`[grade] pair ${i + args.offset} sandbox-run error: ${e.message}\n`);
  }

  if (!parsedScore) {
    summary.parseFailures += 1;
    parsedScore = { score: 0, reason: "grader did not return parseable JSON" };
  }

  // Apply mergedToMain floor=4 boost
  if (pair.mergedToMain === true && parsedScore.score < 4) {
    boosted = true;
    summary.boostedByMerge += 1;
    parsedScore = { score: 4, reason: `[boosted by squash-merge to main; original: ${parsedScore.score} - ${parsedScore.reason}]` };
  }

  summary.graded += 1;
  summary.scoreCounts[parsedScore.score] = (summary.scoreCounts[parsedScore.score] || 0) + 1;
  summary.scoreSum += parsedScore.score;

  const out = {
    ...pair,
    qualityScore: String(parsedScore.score),
    qualityReason: parsedScore.reason,
    criticRunMs: runMs,
    criticRunId: runId,
    boostedByMerge: boosted,
    gradedAt: new Date().toISOString(),
  };
  outStream.write(`${JSON.stringify(out)}\n`);

  process.stdout.write(
    `[grade] ${i + 1}/${slice.length} session=${pair.sessionId.slice(0, 8)} pair=${pair.pairIndex} score=${out.qualityScore}${boosted ? "*" : ""} ms=${runMs}\n`,
  );
}

await new Promise((r) => outStream.end(r));

const avg = summary.graded ? (summary.scoreSum / summary.graded).toFixed(2) : "0.00";
const highCount = (summary.scoreCounts[4] || 0) + (summary.scoreCounts[5] || 0);
const finishedAt = new Date().toISOString();

process.stdout.write(
  "\n" +
    JSON.stringify(
      {
        ok: true,
        out: outAbs,
        startedAt: summary.startedAt,
        finishedAt,
        graded: summary.graded,
        parseFailures: summary.parseFailures,
        boostedByMerge: summary.boostedByMerge,
        averageScore: Number(avg),
        scoreCounts: summary.scoreCounts,
        highQualityCount: highCount,
        highQualityRatio: summary.graded ? Number((highCount / summary.graded).toFixed(3)) : 0,
      },
      null,
      2,
    ) +
    "\n",
);
