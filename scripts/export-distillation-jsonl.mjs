#!/usr/bin/env node
/**
 * Merge workspace sandbox run history + CLI Local Intelligence thread files into
 * JSONL for external fine-tuning / distillation tooling (Unsloth, Axolotl, etc.).
 *
 * Does not train models — signal export only (see docs/NATIVE_INTELLIGENCE_LOCAL_ADAPTER_ARCHITECTURE.md §30–31).
 *
 * Source records shape: apps/workspace/growthub.source-records.json maps
 *   sourceId -> { records: [...], integrationId, fetchedAt }
 * Each sandbox append is the full `response` object from POST /api/workspace/sandbox-run
 * (see apps/workspace/app/api/workspace/sandbox-run/route.js buildRunResponse).
 *
 * Local-intelligence runs persist adapter "local-intelligence" and stdout carries
 * growthub-local-model-sandbox-v1 JSON (see lib/adapters/sandboxes/default-local-intelligence.js).
 *
 * CLI threads (optional): pass --threads-dir pointing at the same directory the CLI uses
 * ($PAPERCLIP_HOME/native-intelligence/threads, default PAPERCLIP_HOME: ~/.paperclip).
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function usage() {
  process.stderr.write(
    `Usage: node scripts/export-distillation-jsonl.mjs [options]\n` +
      `  --source-records <file>   growthub.source-records.json (optional)\n` +
      `  --threads-dir <dir>       CLI thread *.json directory (optional)\n` +
      `  --out <file>              output JSONL path (default: distillation-export.jsonl)\n` +
      `  --sandbox-only            only sourceIds starting with "sandbox:"\n`,
  );
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Must stay aligned with default-local-intelligence.js buildSystemPrompt(). */
function bundledLocalIntelligenceSystemPrompt() {
  return [
    "You are Growthub workspace sandbox local intelligence.",
    "Reply with a single JSON object only, matching:",
    '{"text":string optional,"json":object optional,"toolIntents":[],"warnings":[],"confidence":number}',
    "toolIntents are proposals only — never claim execution or access to secrets.",
  ].join("\n");
}

function parseArgs(argv) {
  const opts = {
    sourceRecords: null,
    threadsDir: null,
    out: path.resolve(process.cwd(), "distillation-export.jsonl"),
    sandboxOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    }
    if (a === "--source-records") {
      opts.sourceRecords = path.resolve(argv[++i] || "");
      continue;
    }
    if (a === "--threads-dir") {
      opts.threadsDir = path.resolve(expandHome(argv[++i] || ""));
      continue;
    }
    if (a === "--out") {
      opts.out = path.resolve(argv[++i] || "");
      continue;
    }
    if (a === "--sandbox-only") {
      opts.sandboxOnly = true;
      continue;
    }
    process.stderr.write(`Unknown argument: ${a}\n`);
    usage();
    process.exit(1);
  }
  return opts;
}

function expandHome(p) {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith(`~${path.sep}`)) return path.join(os.homedir(), p.slice(2));
  return p;
}

function tryParseSandboxEnvelope(stdout) {
  if (typeof stdout !== "string" || !stdout.trim()) return null;
  try {
    const o = JSON.parse(stdout);
    if (o && typeof o === "object" && o.version === "growthub-local-model-sandbox-v1") return o;
  } catch {
    /* ignore */
  }
  return null;
}

function userIntentFromRunRecord(rec) {
  const instructions = typeof rec.instructions === "string" ? rec.instructions.trim() : "";
  const command = typeof rec.command === "string" ? rec.command : "";
  if (instructions) {
    return `Instructions:\n${instructions}\n\nPrompt:\n${command}`;
  }
  return command;
}

function sandboxRecordsToTraceLines(sourceId, records, systemPrompt) {
  const systemPromptHash = sha256(systemPrompt);
  const lines = [];
  if (!Array.isArray(records)) return lines;

  for (const rec of records) {
    if (!rec || typeof rec !== "object") continue;
    if (rec.adapter !== "local-intelligence") continue;
    const envelope = tryParseSandboxEnvelope(rec.stdout);
    if (!envelope) continue;

    const userIntent = userIntentFromRunRecord(rec);
    const trace = {
      version: "growthub-local-intelligence-trace-v1",
      taskId: envelope.taskId || rec.runId || "unknown",
      businessObjectType: envelope.businessObjectType || "sandbox-environment",
      businessObjectId: undefined,
      modelId: envelope.adapter?.modelId || "unknown",
      systemPromptHash,
      input: {
        userIntent,
        availableContracts: [],
        bindings:
          envelope.result?.json &&
          typeof envelope.result.json === "object" &&
          envelope.result.json !== null &&
          "bindings" in envelope.result.json &&
          typeof envelope.result.json.bindings === "object"
            ? envelope.result.json.bindings
            : undefined,
      },
      output: {
        json: envelope.result?.json,
        toolIntents: Array.isArray(envelope.result?.toolIntents) ? envelope.result.toolIntents : [],
        warnings: Array.isArray(envelope.result?.warnings) ? envelope.result.warnings : [],
      },
      validation: {
        acceptedToolIntents: [],
        rejectedToolIntents: [],
      },
      createdAt: envelope.createdAt || rec.ranAt || new Date().toISOString(),
    };
    lines.push(JSON.stringify(trace));
  }
  return lines;
}

function loadSourceRecords(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function threadFilesToLines(dir) {
  const lines = [];
  if (!fs.existsSync(dir)) return lines;
  const names = fs.readdirSync(dir).filter((n) => n.endsWith(".json") && n !== "active-thread.json");
  for (const name of names) {
    const fp = path.join(dir, name);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(fp, "utf8"));
    } catch {
      continue;
    }
    const threadId = typeof data.id === "string" ? data.id : name.replace(/\.json$/i, "");
    const messages = Array.isArray(data.messages) ? data.messages : [];
    let pendingUser = null;
    for (const m of messages) {
      if (!m || typeof m !== "object") continue;
      if (m.role === "user" && typeof m.content === "string") {
        pendingUser = m.content;
      } else if (m.role === "assistant" && typeof m.content === "string" && pendingUser !== null) {
        const row = {
          version: "growthub-cli-prompt-thread-pair-v1",
          threadId,
          messages: [
            { role: "user", content: pendingUser },
            { role: "assistant", content: m.content },
          ],
          createdAt: typeof m.createdAt === "string" ? m.createdAt : undefined,
        };
        lines.push(JSON.stringify(row));
        pendingUser = null;
      }
    }
  }
  return lines;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const systemPrompt = bundledLocalIntelligenceSystemPrompt();
  const allLines = [];

  if (!opts.sourceRecords && !opts.threadsDir) {
    usage();
    process.stderr.write("\nProvide --source-records and/or --threads-dir.\n");
    process.exit(1);
  }

  if (opts.sourceRecords) {
    if (!fs.existsSync(opts.sourceRecords)) {
      process.stderr.write(`Missing --source-records file: ${opts.sourceRecords}\n`);
      process.exit(1);
    }
    const bucket = loadSourceRecords(opts.sourceRecords);
    if (typeof bucket !== "object" || bucket === null) {
      process.stderr.write("source-records root must be a JSON object\n");
      process.exit(1);
    }
    for (const [sourceId, entry] of Object.entries(bucket)) {
      if (opts.sandboxOnly && !String(sourceId).startsWith("sandbox:")) continue;
      const records = entry?.records;
      allLines.push(...sandboxRecordsToTraceLines(sourceId, records, systemPrompt));
    }
  }

  if (opts.threadsDir) {
    if (!fs.existsSync(opts.threadsDir)) {
      process.stderr.write(`Missing --threads-dir: ${opts.threadsDir}\n`);
      process.exit(1);
    }
    allLines.push(...threadFilesToLines(opts.threadsDir));
  }

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, `${allLines.join("\n")}${allLines.length ? "\n" : ""}`, "utf8");
  process.stdout.write(`Wrote ${allLines.length} JSONL line(s) to ${opts.out}\n`);
}

main();
