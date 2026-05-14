#!/usr/bin/env node
/**
 * Export distillation-ready JSONL from AWaC local signal surfaces.
 *
 * - Sandbox: reads `growthub.source-records.json` (workspace sidecar shape) and
 *   emits `growthub-local-intelligence-trace-v1` lines by parsing persisted
 *   `local-intelligence` sandbox stdout envelopes (`growthub-local-model-sandbox-v1`).
 *   Does not train models — external tooling consumes the JSONL.
 *
 * - Optional threads: CLI prompt flow stores `{ id, messages[] }` under
 *   `$PAPERCLIP_HOME/native-intelligence/threads` (default `~/.paperclip/...`).
 *   Thread files do not include the per-turn system prompt; emitted chat-pair
 *   lines are labeled accordingly for downstream merging.
 *
 * Keep `WORKSPACE_SANDBOX_INTELLIGENCE_SYSTEM_PROMPT` aligned with
 * `cli/assets/worker-kits/.../default-local-intelligence.js` → `buildSystemPrompt()`.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

/** @type {string} Must match default-local-intelligence.js `buildSystemPrompt()`. */
const WORKSPACE_SANDBOX_INTELLIGENCE_SYSTEM_PROMPT = [
  "You are Growthub workspace sandbox local intelligence.",
  "Reply with a single JSON object only, matching:",
  '{"text":string optional,"json":object optional,"toolIntents":[],"warnings":[],"confidence":number}',
  "toolIntents are proposals only — never claim execution or access to secrets.",
].join("\n");

function usage() {
  console.log(
    [
      "Usage:",
      "  node scripts/export-distillation-jsonl.mjs [options]",
      "",
      "Options:",
      "  --source-records <path>   growthub.source-records.json (default: ./growthub.source-records.json)",
      "  --out <path>              Output JSONL (default: ./distillation-export.jsonl)",
      "  --include-threads         Also export CLI prompt-thread user/assistant pairs",
      "  --threads-dir <path>      Override thread directory (default: $PAPERCLIP_HOME/native-intelligence/threads)",
      "",
      "Environment:",
      "  PAPERCLIP_HOME            Base dir for CLI state (default: ~/.paperclip)",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const cwd = process.cwd();
  const result = {
    sourceRecords: path.resolve(cwd, "growthub.source-records.json"),
    out: path.resolve(cwd, "distillation-export.jsonl"),
    includeThreads: false,
    threadsDir: "",
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--source-records") {
      result.sourceRecords = path.resolve(args[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--out") {
      result.out = path.resolve(args[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--include-threads") {
      result.includeThreads = true;
      continue;
    }
    if (arg === "--threads-dir") {
      result.threadsDir = path.resolve(args[i + 1] || "");
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!result.threadsDir) {
    const home = process.env.PAPERCLIP_HOME?.trim()
      ? path.resolve(expandHome(process.env.PAPERCLIP_HOME.trim()))
      : path.resolve(os.homedir(), ".paperclip");
    result.threadsDir = path.join(home, "native-intelligence", "threads");
  }

  return result;
}

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.resolve(os.homedir(), value.slice(2));
  return value;
}

function hashSystemPrompt(systemPrompt) {
  return crypto.createHash("sha256").update(systemPrompt, "utf8").digest("hex");
}

/**
 * @param {Record<string, unknown>} envelope
 * @param {{ systemPrompt: string, userIntent: string, availableContracts?: Array<{ slug: string, displayName: string }> }} options
 */
function sandboxEnvelopeToTraceRecord(envelope, options) {
  const result = envelope.result && typeof envelope.result === "object" ? envelope.result : {};
  const json = result.json && typeof result.json === "object" ? result.json : undefined;
  const bindings =
    json && "bindings" in json && typeof json.bindings === "object" && json.bindings !== null
      ? /** @type {Record<string, unknown>} */ (json.bindings)
      : undefined;

  return {
    version: "growthub-local-intelligence-trace-v1",
    taskId: String(envelope.taskId || ""),
    businessObjectType: String(envelope.businessObjectType || ""),
    businessObjectId: envelope.businessObjectId != null ? String(envelope.businessObjectId) : undefined,
    modelId: String(envelope.adapter?.modelId || ""),
    systemPromptHash: hashSystemPrompt(options.systemPrompt),
    input: {
      userIntent: options.userIntent,
      availableContracts: options.availableContracts ?? [],
      bindings,
    },
    output: {
      json: json ?? undefined,
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
    createdAt: String(envelope.createdAt || new Date().toISOString()),
  };
}

function userIntentFromSandboxRunRecord(record) {
  const instructions = typeof record.instructions === "string" ? record.instructions.trim() : "";
  const command = typeof record.command === "string" ? record.command : "";
  if (instructions) {
    return `Instructions:\n${instructions}\n\nPrompt:\n${command}`;
  }
  return command;
}

/**
 * @param {unknown} raw
 * @returns {Generator<{ sourceId: string, record: Record<string, unknown> }>}
 */
function* iterSandboxRunRecords(raw) {
  if (!raw || typeof raw !== "object") return;
  for (const [sourceId, bucket] of Object.entries(raw)) {
    if (!bucket || typeof bucket !== "object") continue;
    const recs = /** @type {{ records?: unknown }} */ (bucket).records;
    if (!Array.isArray(recs)) continue;
    if (!String(sourceId).startsWith("sandbox:")) continue;
    for (const record of recs) {
      if (record && typeof record === "object") {
        yield { sourceId, record: /** @type {Record<string, unknown>} */ (record) };
      }
    }
  }
}

function tryParseEnvelope(stdout) {
  if (typeof stdout !== "string" || !stdout.trim()) return null;
  try {
    const parsed = JSON.parse(stdout);
    if (
      parsed
      && typeof parsed === "object"
      && parsed.version === "growthub-local-model-sandbox-v1"
      && parsed.adapter
      && typeof parsed.adapter === "object"
      && parsed.adapter.kind === "local-intelligence"
    ) {
      return /** @type {Record<string, unknown>} */ (parsed);
    }
  } catch {
    // ignore
  }
  return null;
}

function* exportSandboxTraceLines(sourceRecordsPath) {
  if (!fs.existsSync(sourceRecordsPath)) {
    console.warn(`[export-distillation-jsonl] Skipping missing source records: ${sourceRecordsPath}`);
    return;
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(sourceRecordsPath, "utf8"));
  } catch (err) {
    console.warn(`[export-distillation-jsonl] Failed to read JSON: ${sourceRecordsPath} (${err})`);
    return;
  }

  let count = 0;
  for (const { record } of iterSandboxRunRecords(raw)) {
    if (record.adapter !== "local-intelligence") continue;
    const envelope = tryParseEnvelope(record.stdout);
    if (!envelope) continue;
    const userIntent = userIntentFromSandboxRunRecord(record);
    const trace = sandboxEnvelopeToTraceRecord(envelope, {
      systemPrompt: WORKSPACE_SANDBOX_INTELLIGENCE_SYSTEM_PROMPT,
      userIntent,
      availableContracts: [],
    });
    yield JSON.stringify(trace);
    count += 1;
  }
  console.log(`[export-distillation-jsonl] Wrote ${count} sandbox trace line(s) from source records.`);
}

function* exportThreadChatPairLines(threadsDir) {
  if (!fs.existsSync(threadsDir)) {
    console.warn(`[export-distillation-jsonl] Threads directory missing: ${threadsDir}`);
    return;
  }
  const names = fs.readdirSync(threadsDir).filter((n) => n.endsWith(".json") && n !== "active-thread.json");
  let pairCount = 0;
  for (const name of names) {
    const filePath = path.join(threadsDir, name);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      continue;
    }
    const threadId = typeof parsed.id === "string" ? parsed.id : path.basename(name, ".json");
    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    for (let i = 0; i < messages.length - 1; i += 1) {
      const a = messages[i];
      const b = messages[i + 1];
      if (a?.role === "user" && b?.role === "assistant") {
        const line = {
          version: "growthub-local-intelligence-chat-pair-v1",
          threadId,
          threadPath: filePath,
          note:
            "CLI prompt flow does not persist system prompts in thread JSON; merge with live systemPrompt in downstream training if needed.",
          prompt: String(a.content || ""),
          completion: String(b.content || ""),
          meta: { userCreatedAt: a.createdAt, assistantCreatedAt: b.createdAt },
        };
        yield JSON.stringify(line);
        pairCount += 1;
      }
    }
  }
  console.log(`[export-distillation-jsonl] Wrote ${pairCount} thread chat-pair line(s).`);
}

function main() {
  const opts = parseArgs(process.argv);
  const lines = [];

  for (const line of exportSandboxTraceLines(opts.sourceRecords)) {
    lines.push(line);
  }

  if (opts.includeThreads) {
    for (const line of exportThreadChatPairLines(opts.threadsDir)) {
      lines.push(line);
    }
  }

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
  console.log(`[export-distillation-jsonl] Done: ${opts.out} (${lines.length} line(s))`);
}

main();
