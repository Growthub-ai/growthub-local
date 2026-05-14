#!/usr/bin/env node
/**
 * helpers/harvest-cursor-traces.mjs — Distillation Pipeline V1, Phase 1
 *
 * Reads Cursor agent transcript JSONL files (one folder per session, one
 * `<uuid>.jsonl` inside it), pairs each user query with the assistant turn(s)
 * that follow it, filters to pairs where the assistant actually executed work
 * (≥1 `tool_use` block), and emits a single newline-delimited JSON file ready
 * for Phase 2 (critic-grader scoring) and Phase 3 (Unsloth QLoRA export).
 *
 * Quality signals captured per pair (used by the grader, not graded here):
 *   - `executedWork`     true ⇔ assistant turn produced ≥1 tool_use
 *   - `toolUseCount`     how many tool calls were issued
 *   - `toolNames`        deduped list of tool names invoked
 *   - `branchesTouched`  branch names parsed out of git/gh shell commands
 *   - `mergedToMain`     true if any branch matches a squash-merged PR on main
 *   - `mergedPrNumbers`  PR numbers whose `headRefName` matched
 *
 * Squash-to-main is the highest-signal heuristic: it means the work was
 * accepted by the maintainer and shipped. The grader can boost those rows.
 *
 * Usage:
 *   node helpers/harvest-cursor-traces.mjs \
 *     --in   /Users/antonio/.cursor/projects/Users-antonio-growthub-local/agent-transcripts \
 *     --out  ./antonio/distillation/raw-pairs.jsonl \
 *     --repo /Users/antonio/growthub-local            # optional: enables gh PR enrichment
 *     --pr-limit 200                                  # optional: how many merged PRs to fetch
 *     --min-prompt-chars 12                           # optional: drop trivial prompts
 *
 * No network calls beyond `gh pr list` (only when --repo is provided).
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// ---------- arg parsing ----------
function parseArgs(argv) {
  const a = { in: "", out: "", repo: "", prLimit: 200, minPromptChars: 12 };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    const next = () => String(argv[++i] || "").trim();
    if (t === "--in") a.in = next();
    else if (t === "--out") a.out = next();
    else if (t === "--repo") a.repo = next();
    else if (t === "--pr-limit") a.prLimit = Number(next()) || 200;
    else if (t === "--min-prompt-chars") a.minPromptChars = Number(next()) || 0;
    else if (t === "--help" || t === "-h") {
      process.stdout.write(
        "Usage: harvest-cursor-traces.mjs --in <transcripts-dir> --out <raw-pairs.jsonl> [--repo <git-repo>] [--pr-limit N] [--min-prompt-chars N]\n",
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
const transcriptsDir = path.resolve(args.in);
const outPath = path.resolve(args.out);
const repoDir = args.repo ? path.resolve(args.repo) : "";

// ---------- gh squash-merge index ----------
/** Map<branchName, { number, mergeSha, mergedAt, title }> */
const mergedByBranch = new Map();
if (repoDir) {
  if (!fs.existsSync(path.join(repoDir, ".git"))) {
    process.stderr.write(`warn: --repo ${repoDir} has no .git dir; skipping gh enrichment\n`);
  } else {
    const r = spawnSync(
      "gh",
      [
        "pr",
        "list",
        "--state",
        "merged",
        "--limit",
        String(args.prLimit),
        "--json",
        "number,title,headRefName,mergeCommit,mergedAt",
      ],
      { cwd: repoDir, encoding: "utf8" },
    );
    if (r.status === 0) {
      try {
        const list = JSON.parse(r.stdout || "[]");
        for (const pr of list) {
          if (typeof pr.headRefName === "string" && pr.headRefName.trim()) {
            mergedByBranch.set(pr.headRefName.trim(), {
              number: pr.number,
              mergeSha: pr.mergeCommit?.oid || null,
              mergedAt: pr.mergedAt || null,
              title: pr.title || "",
            });
          }
        }
      } catch (e) {
        process.stderr.write(`warn: gh JSON parse failed: ${e.message}\n`);
      }
    } else {
      process.stderr.write(`warn: gh pr list failed (${r.status}); continuing without merge index\n`);
    }
  }
}

// ---------- transcript walker ----------
function listTranscriptFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    process.stderr.write(`error: transcripts dir not found: ${rootDir}\n`);
    process.exit(2);
  }
  const out = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const sessionDir = path.join(rootDir, entry.name);
    if (!entry.isDirectory()) continue;
    for (const child of fs.readdirSync(sessionDir, { withFileTypes: true })) {
      if (child.isFile() && child.name.endsWith(".jsonl")) {
        out.push({ sessionId: entry.name, file: path.join(sessionDir, child.name) });
      }
    }
  }
  return out.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
}

// ---------- helpers ----------
function flattenAssistantText(blocks) {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n\n")
    .trim();
}

function extractToolNames(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .filter((b) => b && b.type === "tool_use" && typeof b.name === "string")
    .map((b) => b.name);
}

function extractToolInputs(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .filter((b) => b && b.type === "tool_use")
    .map((b) => ({ name: b.name, input: b.input ?? {} }));
}

const BRANCH_FROM_GH_PR = /(?:gh\s+pr\s+(?:create|merge|view|checkout)[^\n]*?)(?:--head|head\s*[:=])\s+([\w./-]+)/g;
const BRANCH_FROM_GIT_PUSH = /git\s+push\s+(?:-u\s+)?(?:origin)\s+([\w./-]+)/g;
const BRANCH_FROM_GIT_CHECKOUT = /git\s+checkout\s+(?:-b\s+)?([\w./-]+)/g;
const BRANCH_FROM_BRANCH_FLAG = /(?:^|\s)(?:--branch|--head|--base)\s+([\w./-]+)/g;

function extractBranchesFromShell(toolUses) {
  const out = new Set();
  for (const tu of toolUses) {
    if (tu.name !== "Shell") continue;
    const cmd = String(tu.input?.command || "");
    if (!cmd) continue;
    for (const re of [BRANCH_FROM_GH_PR, BRANCH_FROM_GIT_PUSH, BRANCH_FROM_GIT_CHECKOUT, BRANCH_FROM_BRANCH_FLAG]) {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(cmd))) {
        const name = (m[1] || "").trim();
        if (name && name !== "main" && name !== "HEAD") out.add(name);
      }
    }
  }
  return [...out];
}

// ---------- main pairing pass ----------
const files = listTranscriptFiles(transcriptsDir);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const outStream = fs.createWriteStream(outPath, { encoding: "utf8" });

const stats = {
  sessions: 0,
  pairsConsidered: 0,
  pairsKept: 0,
  pairsDroppedNoTool: 0,
  pairsDroppedShortPrompt: 0,
  pairsMergedToMain: 0,
  toolNameTotals: {},
};

for (const { sessionId, file } of files) {
  stats.sessions += 1;
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);

  /** @type {Array<{role:string,content:any}>} */
  const turns = [];
  for (const ln of lines) {
    try {
      const j = JSON.parse(ln);
      if (j && typeof j.role === "string" && j.message?.content) {
        turns.push({ role: j.role, content: j.message.content });
      }
    } catch {
      // skip malformed line
    }
  }

  let pairIndex = 0;
  for (let i = 0; i < turns.length; i += 1) {
    if (turns[i].role !== "user") continue;
    const userBlocks = Array.isArray(turns[i].content) ? turns[i].content : [];
    const userText = userBlocks
      .filter((b) => b && b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n\n")
      .trim();
    if (!userText) continue;

    // Collect every consecutive assistant turn until the next user turn.
    const assistantBlocks = [];
    let j = i + 1;
    while (j < turns.length && turns[j].role !== "user") {
      const c = turns[j].content;
      if (Array.isArray(c)) assistantBlocks.push(...c);
      j += 1;
    }
    if (assistantBlocks.length === 0) continue;

    stats.pairsConsidered += 1;

    if (userText.length < args.minPromptChars) {
      stats.pairsDroppedShortPrompt += 1;
      continue;
    }

    const toolUses = extractToolInputs(assistantBlocks);
    if (toolUses.length === 0) {
      stats.pairsDroppedNoTool += 1;
      continue;
    }

    const assistantText = flattenAssistantText(assistantBlocks);
    const toolNames = [...new Set(extractToolNames(assistantBlocks))];
    for (const n of toolNames) stats.toolNameTotals[n] = (stats.toolNameTotals[n] || 0) + 1;

    const branchesTouched = extractBranchesFromShell(toolUses);
    const mergedPrNumbers = [];
    for (const b of branchesTouched) {
      const hit = mergedByBranch.get(b);
      if (hit) mergedPrNumbers.push(hit.number);
    }
    const mergedToMain = mergedPrNumbers.length > 0;
    if (mergedToMain) stats.pairsMergedToMain += 1;

    const row = {
      sessionId,
      pairIndex,
      inputPrompt: userText,
      agentOutput: assistantText,
      executedWork: true,
      toolUseCount: toolUses.length,
      toolNames,
      branchesTouched,
      mergedToMain,
      mergedPrNumbers,
    };
    outStream.write(`${JSON.stringify(row)}\n`);
    stats.pairsKept += 1;
    pairIndex += 1;
  }
}

await new Promise((resolve) => outStream.end(resolve));

// ---------- summary ----------
process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      out: outPath,
      transcriptsDir,
      mergeIndexEntries: mergedByBranch.size,
      ...stats,
    },
    null,
    2,
  ) + "\n",
);
