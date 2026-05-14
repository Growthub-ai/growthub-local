/**
 * Export AWaC sandbox run receipts from `growthub.source-records.json` into
 * OpenAI-style chat JSONL for external SFT / distillation tooling.
 *
 * Receipts are produced by `POST /api/workspace/sandbox-run` (starter kit).
 */

import fs from "node:fs";
import path from "node:path";

export const DISTILLATION_TRACE_VERSION = "growthub-sandbox-distillation-v1" as const;

export interface SandboxRunReceiptLike {
  runId?: string;
  ranAt?: string;
  instructions?: string;
  command?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  durationMs?: number;
  adapter?: string;
  runtime?: string;
  runLocality?: string;
  localIntelligence?: {
    localModel?: string;
    localEndpoint?: string;
    intelligenceAdapterMode?: string;
  };
}

export interface SftJsonlLineV1 {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  growthub_distillation_v1: {
    version: typeof DISTILLATION_TRACE_VERSION;
    sourceId: string;
    runId: string | null;
    ranAt: string | null;
    exitCode: number | null;
    durationMs: number | null;
    adapter: string | null;
    runtime: string | null;
    runLocality: string | null;
    teacherModel: string | null;
    chatCompletionsUrl: string | null;
    intelligenceAdapterMode: string | null;
    role: string | null;
    qualityLabel: string | null;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Heuristic: persisted sandbox-run response objects from the starter route. */
export function looksLikeSandboxRunReceipt(value: unknown): value is SandboxRunReceiptLike {
  if (!isRecord(value)) return false;
  const hasRun = typeof value.runId === "string" || typeof value.ranAt === "string";
  const hasIo =
    (typeof value.stdout === "string" || typeof value.stderr === "string")
    || typeof value.command === "string"
    || typeof value.instructions === "string";
  return hasRun && hasIo;
}

export function sandboxReceiptToSftLine(
  receipt: SandboxRunReceiptLike,
  sourceId: string,
  options?: { role?: string | null; qualityLabel?: string | null },
): SftJsonlLineV1 | null {
  const instructions = typeof receipt.instructions === "string" ? receipt.instructions.trim() : "";
  const command = typeof receipt.command === "string" ? receipt.command : "";
  const stdout = typeof receipt.stdout === "string" ? receipt.stdout : "";
  if (!command.trim() && !instructions.trim()) return null;

  const systemContent = instructions || "(no system instructions)";
  const userContent = command.trim() ? command : "(empty command)";
  const assistantContent = stdout.trim() ? stdout : "(empty stdout)";

  const li = receipt.localIntelligence;
  const localModel = li?.localModel?.trim() || null;
  const localEndpoint = li?.localEndpoint?.trim() || null;
  const intelligenceAdapterMode = li?.intelligenceAdapterMode?.trim() || null;

  return {
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
      { role: "assistant", content: assistantContent },
    ],
    growthub_distillation_v1: {
      version: DISTILLATION_TRACE_VERSION,
      sourceId,
      runId: typeof receipt.runId === "string" ? receipt.runId : null,
      ranAt: typeof receipt.ranAt === "string" ? receipt.ranAt : null,
      exitCode: typeof receipt.exitCode === "number" ? receipt.exitCode : null,
      durationMs: typeof receipt.durationMs === "number" ? receipt.durationMs : null,
      adapter: typeof receipt.adapter === "string" ? receipt.adapter : null,
      runtime: typeof receipt.runtime === "string" ? receipt.runtime : null,
      runLocality: typeof receipt.runLocality === "string" ? receipt.runLocality : null,
      teacherModel: localModel,
      chatCompletionsUrl: localEndpoint,
      intelligenceAdapterMode,
      role: options?.role?.trim() || null,
      qualityLabel: options?.qualityLabel?.trim() || null,
    },
  };
}

export interface ResolveSourceRecordsPathResult {
  sourceRecordsPath: string;
  workspaceAppDir: string;
}

/**
 * Locate `growthub.source-records.json` for an exported AWaC workspace.
 * Accepts either the Next app root (`.../apps/workspace` with config sidecar)
 * or a fork root that contains `apps/workspace/`.
 */
export function resolveSourceRecordsPath(inputPath: string): ResolveSourceRecordsPathResult | null {
  const resolved = path.resolve(inputPath);
  const direct = path.join(resolved, "growthub.source-records.json");
  if (fs.existsSync(path.join(resolved, "growthub.config.json")) && fs.existsSync(direct)) {
    return { sourceRecordsPath: direct, workspaceAppDir: resolved };
  }
  const nested = path.join(resolved, "apps/workspace");
  const nestedFile = path.join(nested, "growthub.source-records.json");
  if (fs.existsSync(path.join(nested, "growthub.config.json")) && fs.existsSync(nestedFile)) {
    return { sourceRecordsPath: nestedFile, workspaceAppDir: nested };
  }
  return null;
}

export interface ExportSandboxTracesOptions {
  successOnly?: boolean;
  requireNonEmptyStdout?: boolean;
  defaultRole?: string | null;
}

export interface ExportSandboxTracesSummary {
  sourceRecordsPath: string;
  workspaceAppDir: string;
  linesWritten: number;
  receiptsSeen: number;
  skipped: {
    nonSandboxSourceIds: number;
    invalidBundles: number;
    invalidRecords: number;
    filteredByPolicy: number;
    unmappedToSft: number;
  };
}

export function exportSandboxTracesToJsonlLines(
  sourceRecordsRaw: unknown,
  options?: ExportSandboxTracesOptions,
): { lines: string[]; summary: Omit<ExportSandboxTracesSummary, "sourceRecordsPath" | "workspaceAppDir"> } {
  const lines: string[] = [];
  let receiptsSeen = 0;
  const skipped = {
    nonSandboxSourceIds: 0,
    invalidBundles: 0,
    invalidRecords: 0,
    filteredByPolicy: 0,
    unmappedToSft: 0,
  };

  if (!isRecord(sourceRecordsRaw)) {
    return {
      lines,
      summary: { linesWritten: 0, receiptsSeen: 0, skipped: { ...skipped } },
    };
  }

  for (const [sourceId, bundle] of Object.entries(sourceRecordsRaw)) {
    if (!sourceId.startsWith("sandbox:")) {
      skipped.nonSandboxSourceIds += 1;
      continue;
    }
    if (!isRecord(bundle) || !Array.isArray(bundle.records)) {
      skipped.invalidBundles += 1;
      continue;
    }
    for (const rec of bundle.records) {
      if (!looksLikeSandboxRunReceipt(rec)) {
        skipped.invalidRecords += 1;
        continue;
      }
      receiptsSeen += 1;
      if (options?.successOnly && rec.exitCode !== 0) {
        skipped.filteredByPolicy += 1;
        continue;
      }
      if (options?.requireNonEmptyStdout && !String(rec.stdout ?? "").trim()) {
        skipped.filteredByPolicy += 1;
        continue;
      }
      const lineObj = sandboxReceiptToSftLine(rec, sourceId, { role: options?.defaultRole ?? null });
      if (!lineObj) {
        skipped.unmappedToSft += 1;
        continue;
      }
      lines.push(`${JSON.stringify(lineObj)}\n`);
    }
  }

  return {
    lines,
    summary: {
      linesWritten: lines.length,
      receiptsSeen,
      skipped,
    },
  };
}

export function readSourceRecordsJson(sourceRecordsPath: string): unknown {
  const raw = fs.readFileSync(sourceRecordsPath, "utf8");
  return JSON.parse(raw) as unknown;
}
