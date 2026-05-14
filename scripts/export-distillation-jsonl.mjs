#!/usr/bin/env node
/**
 * Export distillation-ready JSONL from AWaC signal surfaces (no training here).
 *
 * 1) Workspace sandbox history: growthub.source-records.json (keys sandbox:*).
 *    Rows from adapter "local-intelligence" with stdout containing
 *    growthub-local-model-sandbox-v1 become growthub-local-intelligence-trace-v1
 *    lines (same shape as cli/src/runtime/native-intelligence/source-record-export.ts).
 *
 * 2) Optional CLI prompt threads: PAPERCLIP_HOME/native-intelligence/threads/*.json
 *    (see resolveLocalThreadsDir in cli/src/index.ts). Emits growthub-cli-local-intelligence-thread-v1.
 *
 * Usage:
 *   node scripts/export-distillation-jsonl.mjs --source-records ./apps/workspace/growthub.source-records.json --out ./distillation-export.jsonl
 *   node scripts/export-distillation-jsonl.mjs --source-records ./growthub.source-records.json --threads
 *
 * Env:
 *   PAPERCLIP_HOME — overrides ~/.paperclip for thread discovery
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ENVELOPE_VERSION = "growthub-local-model-sandbox-v1";
const TRACE_VERSION = "growthub-local-intelligence-trace-v1";
const THREAD_EXPORT_VERSION = "growthub-cli-local-intelligence-thread-v1";

/** Must stay byte-identical to default-local-intelligence.js buildSystemPrompt(). */
const WORKSPACE_LOCAL_INTELLIGENCE_SYSTEM_PROMPT = [
  "You are Growthub workspace sandbox local intelligence.",
  "Reply with a single JSON object only, matching:",
  "{\"text\":string optional,\"json\":object optional,\"toolIntents\":[],\"warnings\":[],\"confidence\":number}",
  "toolIntents are proposals only — never claim execution or access to secrets.",
].join("\n");

function expandHome(value) {
  const v = String(value || "").trim();
  if (v === "~") return os.homedir();
  if (v.startsWith("~/")) return path.resolve(os.homedir(), v.slice(2));
  return path.resolve(v);
}

function resolvePaperclipHome() {
  const raw = process.env.PAPERCLIP_HOME?.trim();
  if (raw) return expandHome(raw);
  return path.join(os.homedir(), ".paperclip");
}

function hashSystemPrompt(systemPrompt) {
  return createHash("sha256").update(systemPrompt, "utf8").digest("hex");
}

function reconstructSandboxUserIntent(record) {
  const instructions = typeof record.instructions === "string" ? record.instructions.trim() : "";
  const command = typeof record.command === "string" ? record.command : "";
  return instructions
    ? `Instructions:\n${instructions}\n\nPrompt:\n${command}`
    : command;
}

function envelopeToTraceRecord(envelope, { systemPrompt, userIntent }) {
  const result = envelope.result || {};
  const json = result.json && typeof result.json === "object" ? result.json : undefined;
  const bindings =
    json && typeof json.bindings === "object" && json.bindings !== null && !Array.isArray(json.bindings)
      ? json.bindings
      : undefined;

  return {
    version: TRACE_VERSION,
    taskId: envelope.taskId,
    businessObjectType: envelope.businessObjectType,
    businessObjectId: envelope.businessObjectId,
    modelId: envelope.adapter?.modelId || "unknown",
    systemPromptHash: hashSystemPrompt(systemPrompt),
    input: {
      userIntent,
      availableContracts: [],
      bindings,
    },
    output: {
      json,
      toolIntents: Array.isArray(result.toolIntents) ? result.toolIntents : [],
      warnings: [
        ...(Array.isArray(result.warnings) ? result.warnings : []),
        ...(Array.isArray(envelope.validatedToolIntents)
          ? envelope.validatedToolIntents.flatMap((v) => (Array.isArray(v.warnings) ? v.warnings : []))
          : []),
      ],
    },
    validation: {
      acceptedToolIntents: Array.isArray(envelope.validatedToolIntents) ? envelope.validatedToolIntents : [],
      rejectedToolIntents: Array.isArray(envelope.rejectedToolIntents) ? envelope.rejectedToolIntents : [],
    },
    createdAt: envelope.createdAt || new Date().toISOString(),
  };
}

function parseEnvelopeFromStdout(stdout) {
  if (typeof stdout !== "string" || !stdout.trim()) return null;
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.version !== ENVELOPE_VERSION) return null;
  if (parsed.adapter?.kind !== "local-intelligence") return null;
  return parsed;
}

function collectSandboxTraces(sourceRecordsPath) {
  const raw = readFileSync(sourceRecordsPath, "utf8");
  const all = JSON.parse(raw);
  if (!all || typeof all !== "object" || Array.isArray(all)) {
    throw new Error("growthub.source-records.json must be a JSON object keyed by sourceId");
  }
  const lines = [];
  for (const [sourceId, bucket] of Object.entries(all)) {
    if (!String(sourceId).startsWith("sandbox:")) continue;
    const records = Array.isArray(bucket?.records) ? bucket.records : [];
    for (const record of records) {
      if (record?.adapter !== "local-intelligence") continue;
      const envelope = parseEnvelopeFromStdout(record.stdout);
      if (!envelope) continue;
      const userIntent = reconstructSandboxUserIntent(record);
      const trace = envelopeToTraceRecord(envelope, {
        systemPrompt: WORKSPACE_LOCAL_INTELLIGENCE_SYSTEM_PROMPT,
        userIntent,
      });
      lines.push(trace);
    }
  }
  return lines;
}

function collectThreadExports(threadsDir) {
  if (!existsSync(threadsDir)) return [];
  const out = [];
  for (const name of readdirSync(threadsDir)) {
    if (!name.endsWith(".json") || name === "active-thread.json") continue;
    const fp = path.join(threadsDir, name);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(fp, "utf8"));
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const id = typeof parsed.id === "string" ? parsed.id : name.replace(/\.json$/i, "");
    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    if (!messages.length) continue;
    out.push({
      version: THREAD_EXPORT_VERSION,
      threadId: id,
      filePath: fp,
      messages,
    });
  }
  return out;
}

function parseArgs(argv) {
  const opts = {
    sourceRecords: "",
    out: "distillation-export.jsonl",
    threads: false,
    threadsDir: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--threads") {
      opts.threads = true;
      continue;
    }
    if (arg === "--source-records" && argv[i + 1]) {
      opts.sourceRecords = String(argv[++i]).trim();
      continue;
    }
    if (arg === "--out" && argv[i + 1]) {
      opts.out = String(argv[++i]).trim();
      continue;
    }
    if (arg === "--threads-dir" && argv[i + 1]) {
      opts.threadsDir = String(argv[++i]).trim();
      continue;
    }
    if (arg.startsWith("--source-records=")) opts.sourceRecords = arg.slice("--source-records=".length).trim();
    else if (arg.startsWith("--out=")) opts.out = arg.slice("--out=".length).trim();
    else if (arg.startsWith("--threads-dir=")) opts.threadsDir = arg.slice("--threads-dir=".length).trim();
    else if (!arg.startsWith("--") && !opts.sourceRecords) opts.sourceRecords = arg;
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.sourceRecords) {
    process.stderr.write(
      "Usage: node scripts/export-distillation-jsonl.mjs --source-records <path/to/growthub.source-records.json> [--out <file>] [--threads] [--threads-dir <dir>]\n",
    );
    process.exit(1);
  }
  const sourcePath = path.resolve(opts.sourceRecords);
  const outPath = path.resolve(opts.out);

  const rows = collectSandboxTraces(sourcePath);
  if (opts.threads) {
    const dir = opts.threadsDir
      ? path.resolve(opts.threadsDir)
      : path.join(resolvePaperclipHome(), "native-intelligence", "threads");
    rows.push(...collectThreadExports(dir));
  }

  const jsonl = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  writeFileSync(outPath, jsonl, "utf8");
  process.stdout.write(
    `Wrote ${rows.length} record(s) to ${outPath} (sandbox local-intelligence traces + optional thread exports)\n`,
  );
}

main();
