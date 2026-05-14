#!/usr/bin/env node
/**
 * Read-only export of local-intelligence training signal to JSONL for **external**
 * fine-tuning tooling (Unsloth, Axolotl, etc.). The CLI does not train models;
 * this script only shapes on-disk artifacts into portable lines.
 *
 * Record kinds (filter downstream by `version`):
 * - `growthub-local-intelligence-trace-v1` — mirrors `cli/src/runtime/native-intelligence/source-record-export.ts`
 *   from workspace `growthub.source-records.json` sandbox rows (`adapter: "local-intelligence"`).
 * - `growthub-local-intelligence-thread-transcript-v1` — CLI prompt-flow threads under Paperclip home
 *   (`$PAPERCLIP_HOME/native-intelligence/threads/`, default `~/.paperclip/...`), optional via `--threads`.
 *
 * Usage:
 *   node scripts/export-distillation-jsonl.mjs --source-records ./apps/workspace/growthub.source-records.json
 *   node scripts/export-distillation-jsonl.mjs --source-records ./a.json --source-records ./b.json --out ./out.jsonl
 *   node scripts/export-distillation-jsonl.mjs --threads [--threads-dir ~/.paperclip/native-intelligence/threads]
 *
 * System prompt hashing for workspace sandbox rows matches
 * `default-local-intelligence.js` `buildSystemPrompt()` unless `--system-prompt-file` is set.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

/** Keep aligned with kit `buildSystemPrompt()` in default-local-intelligence.js */
const WORKSPACE_SANDBOX_SYSTEM_PROMPT = [
  "You are Growthub workspace sandbox local intelligence.",
  "Reply with a single JSON object only, matching:",
  '{"text":string optional,"json":object optional,"toolIntents":[],"warnings":[],"confidence":number}',
  "toolIntents are proposals only — never claim execution or access to secrets.",
].join("\n");

function usage() {
  console.log(
    [
      "Usage:",
      "  node scripts/export-distillation-jsonl.mjs --source-records <path> [--source-records <path> ...]",
      "      [--out <path>] [--system-prompt-file <path>] [--verbose]",
      "  node scripts/export-distillation-jsonl.mjs --threads [--threads-dir <dir>] [--paperclip-home <dir>]",
      "      ... (combine with --source-records)",
      "",
      "Defaults:",
      "  --out ./distillation-export.jsonl",
      "  Paperclip home: $PAPERCLIP_HOME or ~/.paperclip",
      "  Threads dir: <paperclip-home>/native-intelligence/threads",
    ].join("\n"),
  );
}

function expandHomePrefix(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.resolve(os.homedir(), value.slice(2));
  return value;
}

function resolvePaperclipHome(cliHome) {
  const raw = cliHome?.trim() || process.env.PAPERCLIP_HOME?.trim();
  if (raw) return path.resolve(expandHomePrefix(raw));
  return path.resolve(os.homedir(), ".paperclip");
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    sourceRecordsPaths: [],
    outPath: path.resolve(process.cwd(), "distillation-export.jsonl"),
    includeThreads: false,
    threadsDir: null,
    paperclipHome: null,
    systemPromptFile: null,
    verbose: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    }
    if (arg === "--source-records") {
      result.sourceRecordsPaths.push(path.resolve(args[i + 1]));
      i += 1;
      continue;
    }
    if (arg === "--out") {
      result.outPath = path.resolve(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--threads") {
      result.includeThreads = true;
      continue;
    }
    if (arg === "--threads-dir") {
      result.threadsDir = path.resolve(expandHomePrefix(args[i + 1]));
      i += 1;
      continue;
    }
    if (arg === "--paperclip-home") {
      result.paperclipHome = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--system-prompt-file") {
      result.systemPromptFile = path.resolve(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--verbose") {
      result.verbose = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (result.sourceRecordsPaths.length === 0 && !result.includeThreads) {
    usage();
    throw new Error("Provide --source-records and/or --threads.");
  }

  return result;
}

function hashSystemPrompt(systemPrompt) {
  return createHash("sha256").update(systemPrompt, "utf8").digest("hex");
}

function userIntentFromSandboxRecord(record) {
  const instructions = typeof record.instructions === "string" ? record.instructions.trim() : "";
  const command = typeof record.command === "string" ? record.command : "";
  if (instructions) {
    return `Instructions:\n${instructions}\n\nPrompt:\n${command}`;
  }
  return command;
}

function extractBindings(envelope) {
  const json = envelope?.result?.json;
  if (json && typeof json === "object" && json !== null && "bindings" in json) {
    const b = json.bindings;
    if (typeof b === "object" && b !== null) return b;
  }
  return undefined;
}

function sandboxEnvelopeToTraceRecord(envelope, { systemPrompt, userIntent, availableContracts }) {
  const flatWarnings = [...(envelope.result?.warnings ?? [])];
  for (const v of envelope.validatedToolIntents ?? []) {
    if (v && Array.isArray(v.warnings)) flatWarnings.push(...v.warnings);
  }

  return {
    version: "growthub-local-intelligence-trace-v1",
    taskId: envelope.taskId,
    businessObjectType: envelope.businessObjectType,
    businessObjectId: envelope.businessObjectId,
    modelId: envelope.adapter.modelId,
    systemPromptHash: hashSystemPrompt(systemPrompt),
    input: {
      userIntent,
      availableContracts: availableContracts ?? [],
      bindings: extractBindings(envelope),
    },
    output: {
      json: envelope.result?.json,
      toolIntents: envelope.result?.toolIntents ?? [],
      warnings: flatWarnings,
    },
    validation: {
      acceptedToolIntents: envelope.validatedToolIntents ?? [],
      rejectedToolIntents: envelope.rejectedToolIntents ?? [],
    },
    createdAt: envelope.createdAt,
  };
}

function loadSourceRecordsSidecar(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Expected object root in ${filePath}`);
  }
  return parsed;
}

function tracesFromSourceRecords(filePath, systemPrompt, verbose) {
  const lines = [];
  const sidecar = loadSourceRecordsSidecar(filePath);

  for (const [sourceId, bucket] of Object.entries(sidecar)) {
    if (!bucket || typeof bucket !== "object") continue;
    const records = Array.isArray(bucket.records) ? bucket.records : [];
    for (const record of records) {
      if (String(record?.adapter || "").trim() !== "local-intelligence") continue;
      const stdout = typeof record.stdout === "string" ? record.stdout.trim() : "";
      if (!stdout) {
        if (verbose) process.stderr.write(`[skip] ${sourceId} run ${record?.runId || "?"}: empty stdout\n`);
        continue;
      }
      let envelope;
      try {
        envelope = JSON.parse(stdout);
      } catch {
        if (verbose) process.stderr.write(`[skip] ${sourceId} run ${record?.runId || "?"}: stdout not JSON\n`);
        continue;
      }
      if (envelope?.version !== "growthub-local-model-sandbox-v1") {
        if (verbose) process.stderr.write(`[skip] ${sourceId} run ${record?.runId || "?"}: unexpected envelope version\n`);
        continue;
      }
      if (envelope?.adapter?.kind !== "local-intelligence") {
        if (verbose) process.stderr.write(`[skip] ${sourceId} run ${record?.runId || "?"}: adapter.kind not local-intelligence\n`);
        continue;
      }
      try {
        const trace = sandboxEnvelopeToTraceRecord(envelope, {
          systemPrompt,
          userIntent: userIntentFromSandboxRecord(record),
          availableContracts: [],
        });
        lines.push(JSON.stringify(trace));
      } catch (err) {
        if (verbose) process.stderr.write(`[skip] ${sourceId} run ${record?.runId || "?"}: ${err?.message || err}\n`);
      }
    }
  }
  return lines;
}

function threadTranscriptLines(threadsDir, verbose) {
  if (!fs.existsSync(threadsDir)) {
    if (verbose) process.stderr.write(`[threads] missing directory: ${threadsDir}\n`);
    return [];
  }
  const names = fs.readdirSync(threadsDir).filter((n) => n.endsWith(".json") && n !== "active-thread.json");
  const lines = [];
  for (const name of names) {
    const fp = path.join(threadsDir, name);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(fp, "utf8"));
    } catch (err) {
      if (verbose) process.stderr.write(`[skip thread] ${name}: ${err?.message || err}\n`);
      continue;
    }
    const id = typeof parsed.id === "string" && parsed.id.length > 0 ? parsed.id : name.replace(/\.json$/i, "");
    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    if (messages.length === 0) continue;
    lines.push(
      JSON.stringify({
        version: "growthub-local-intelligence-thread-transcript-v1",
        threadId: id,
        threadPath: fp,
        messages,
      }),
    );
  }
  return lines;
}

function main() {
  const opts = parseArgs(process.argv);
  const systemPrompt = opts.systemPromptFile
    ? fs.readFileSync(opts.systemPromptFile, "utf8").replace(/\r\n/g, "\n")
    : WORKSPACE_SANDBOX_SYSTEM_PROMPT;

  const out = [];
  for (const p of opts.sourceRecordsPaths) {
    if (!fs.existsSync(p)) {
      throw new Error(`Source records file not found: ${p}`);
    }
    out.push(...tracesFromSourceRecords(p, systemPrompt, opts.verbose));
  }

  if (opts.includeThreads) {
    const home = resolvePaperclipHome(opts.paperclipHome);
    const dir = opts.threadsDir || path.join(home, "native-intelligence", "threads");
    out.push(...threadTranscriptLines(dir, opts.verbose));
  }

  const body = out.length > 0 ? `${out.join("\n")}\n` : "";
  fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
  fs.writeFileSync(opts.outPath, body, "utf8");
  process.stdout.write(
    `Wrote ${out.length} JSONL line(s) to ${opts.outPath}\n` +
      `  (read-only; no model training performed — see docs/NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md §30–31.)\n`,
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`${err?.message || err}\n`);
  process.exitCode = 1;
}
