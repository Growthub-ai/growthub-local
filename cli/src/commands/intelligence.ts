/**
 * `growthub intelligence export` — continued-training corpus export.
 *
 * The only writer for real Training Ledger stamps (the app surface is
 * read-only by contract — AGENT_HARNESS_IMPLEMENTATION_PLAN_V1 Part A).
 *
 * Collects governed evidence that already persists in a workspace:
 *   - helper apply receipts        (`helper:apply:receipts` source records)
 *   - sandbox / swarm run evidence (`sandbox:*` source records + row
 *                                   `lastResponse` payloads incl. reward)
 *   - self-eval events             (`.growthub-fork/trace.jsonl`)
 *   - pipeline stage events        (`.growthub-fork/trace.jsonl`)
 *
 * Writes one JSONL corpus in the existing `growthub-local-intelligence-
 * trace-v1` record format (no second JSONL format), then stamps the
 * `model-training` object row (lastExportAt/Id/SourceId/Summary — the same
 * stamping discipline sandbox-run uses) and appends the matching
 * `training:model-training:<slug>` source-record entry.
 *
 * Governance: direct filesystem writes to the workspace's own
 * `growthub.config.json` + `growthub.source-records.json` — the CLI-owned
 * write lane (same lane the feature seed uses). The app PATCH allowlist is
 * never touched and no app route is added. Secrets are redacted before any
 * record reaches the corpus.
 */

import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import pc from "picocolors";
import {
  type LocalIntelligenceTraceRecordV1,
  formatTraceRecordLine,
  hashSystemPrompt,
} from "../runtime/native-intelligence/source-record-export.js";
import { readKitForkTrace } from "../kits/fork-trace.js";

export const TRAINING_OBJECT_ID = "model-training";
export const TRAINING_OBJECT_TYPE = "model-training";
export const DEFAULT_TRAINING_ROW = "workspace-local";
export const HELPER_RECEIPTS_KEY = "helper:apply:receipts";

const TRAINING_COLUMNS = [
  "Name", "status", "baseModel", "localModel", "lastExportAt", "lastExportId", "lastSourceId", "lastExportSummary", "description",
];

// ---------------------------------------------------------------------------
// Sanitization — nothing credential-shaped reaches the corpus.
// ---------------------------------------------------------------------------

const SECRET_KEY_PATTERN = /(token|secret|password|passphrase|api[-_]?key|authorization|bearer|credential|cookie)/i;
const SECRET_VALUE_PATTERN = /^(sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|github_pat_|Bearer\s+\S|eyJ[A-Za-z0-9_-]{10,})/;

export function sanitizeForExport(value: unknown): unknown {
  if (typeof value === "string") {
    return SECRET_VALUE_PATTERN.test(value.trim()) ? "[redacted]" : value;
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeForExport(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = sanitizeForExport(v);
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Workspace evidence collection — reads only what already persists.
// ---------------------------------------------------------------------------

interface WorkspaceFiles {
  configPath: string;
  recordsPath: string;
  config: Record<string, unknown>;
  records: Record<string, unknown>;
}

function readJsonFile(filePath: string): Record<string, unknown> {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path.basename(filePath)} must contain a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

export function readWorkspaceFiles(workspaceDir: string): WorkspaceFiles {
  const configPath = path.join(workspaceDir, "growthub.config.json");
  const recordsPath = path.join(workspaceDir, "growthub.source-records.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`no growthub.config.json under ${workspaceDir} — point --workspace at the exported apps/workspace directory`);
  }
  const config = readJsonFile(configPath);
  const records = fs.existsSync(recordsPath) ? readJsonFile(recordsPath) : {};
  return { configPath, recordsPath, config, records };
}

interface TrainingEvidence {
  helperApplied: Record<string, unknown>[];
  helperSkipped: Record<string, unknown>[];
  selfEval: Record<string, unknown>[];
  pipeline: Record<string, unknown>[];
  swarm: { payload: Record<string, unknown>; rewardScore: number | null }[];
  escalations: number;
}

function dataModelObjects(config: Record<string, unknown>): Record<string, unknown>[] {
  const dm = config?.dataModel as Record<string, unknown> | undefined;
  const objects = dm?.objects;
  return Array.isArray(objects) ? (objects as Record<string, unknown>[]) : [];
}

function safeParse(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractRewardScore(payload: Record<string, unknown>): number | null {
  const swarm = payload?.swarm as Record<string, unknown> | undefined;
  const reward = (swarm?.reward ?? payload?.reward) as Record<string, unknown> | undefined;
  const score = reward?.score;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

export function collectTrainingEvidence({
  workspace,
  forkDir,
}: {
  workspace: WorkspaceFiles;
  forkDir?: string;
}): TrainingEvidence {
  const evidence: TrainingEvidence = {
    helperApplied: [],
    helperSkipped: [],
    selfEval: [],
    pipeline: [],
    swarm: [],
    escalations: 0,
  };

  // Helper apply receipts — applied vs skipped is the preference pair.
  const receiptsEntry = workspace.records[HELPER_RECEIPTS_KEY] as Record<string, unknown> | undefined;
  const receipts = Array.isArray(receiptsEntry?.records) ? (receiptsEntry!.records as Record<string, unknown>[]) : [];
  for (const receipt of receipts) {
    const outcome = String(receipt?.outcome || "applied");
    if (outcome === "skipped") evidence.helperSkipped.push(receipt);
    else evidence.helperApplied.push(receipt);
  }

  // Sandbox / swarm evidence — source-record entries plus row lastResponse.
  for (const [key, entry] of Object.entries(workspace.records)) {
    if (!key.startsWith("sandbox:")) continue;
    const records = Array.isArray((entry as Record<string, unknown>)?.records)
      ? ((entry as Record<string, unknown>).records as Record<string, unknown>[])
      : [];
    for (const payload of records) {
      evidence.swarm.push({ payload, rewardScore: extractRewardScore(payload) });
    }
  }
  for (const object of dataModelObjects(workspace.config)) {
    if (object?.objectType !== "sandbox-environment") continue;
    const rows = Array.isArray(object.rows) ? (object.rows as Record<string, unknown>[]) : [];
    for (const row of rows) {
      const payload = safeParse(row?.lastResponse);
      if (payload) evidence.swarm.push({ payload, rewardScore: extractRewardScore(payload) });
    }
  }

  // Fork trace — self-eval + pipeline stage events. `readKitForkTrace`
  // expects the fork ROOT (it resolves `.growthub-fork/trace.jsonl` itself);
  // default root is the workspace directory.
  const resolvedFork = forkDir || path.dirname(workspace.configPath);
  let events: Record<string, unknown>[] = [];
  try {
    events = readKitForkTrace(resolvedFork) as unknown as Record<string, unknown>[];
  } catch {
    events = [];
  }
  {
    for (const event of events) {
      const type = String(event?.type || "");
      if (type === "self_eval_recorded") {
        evidence.selfEval.push(event);
        const detail = event?.detail as Record<string, unknown> | undefined;
        const attempt = Number(detail?.attempt);
        const maxRetries = Number(detail?.maxRetries);
        if (String(detail?.outcome) === "fail" && Number.isFinite(attempt) && Number.isFinite(maxRetries) && attempt >= maxRetries) {
          evidence.escalations += 1;
        }
      } else if (type === "self_eval_escalated") {
        evidence.selfEval.push(event);
        evidence.escalations += 1;
      } else if (type.startsWith("pipeline_stage_")) {
        evidence.pipeline.push(event);
      }
    }
  }

  return evidence;
}

// ---------------------------------------------------------------------------
// Record building — the EXISTING trace-record format, no second JSONL shape.
// ---------------------------------------------------------------------------

export function buildTrainingTraceRecords(
  evidence: TrainingEvidence,
  { modelId, createdAt }: { modelId: string; createdAt: string },
): LocalIntelligenceTraceRecordV1[] {
  const records: LocalIntelligenceTraceRecordV1[] = [];
  let index = 0;

  const push = (
    surface: string,
    userIntent: string,
    outputJson: Record<string, unknown> | undefined,
    accepted: unknown[],
    rejected: unknown[],
  ) => {
    index += 1;
    records.push({
      version: "growthub-local-intelligence-trace-v1",
      taskId: `${surface}-${index}`,
      businessObjectType: surface,
      modelId,
      systemPromptHash: hashSystemPrompt(`training-export:${surface}`),
      input: { userIntent, availableContracts: [] },
      output: {
        json: outputJson ? (sanitizeForExport(outputJson) as Record<string, unknown>) : undefined,
        toolIntents: [],
        warnings: [],
      },
      validation: {
        acceptedToolIntents: sanitizeForExport(accepted) as unknown[],
        rejectedToolIntents: sanitizeForExport(rejected) as unknown[],
      },
      createdAt,
    });
  };

  for (const receipt of evidence.helperApplied) {
    push("helper-receipt", `${String(receipt?.type || "proposal")}: ${String(receipt?.rationale || "")}`.trim(), receipt, [receipt], []);
  }
  for (const receipt of evidence.helperSkipped) {
    push("helper-receipt", `${String(receipt?.type || "proposal")}: ${String(receipt?.rationale || "")}`.trim(), receipt, [], [receipt]);
  }
  for (const event of evidence.selfEval) {
    const detail = event?.detail as Record<string, unknown> | undefined;
    const passed = String(detail?.outcome) === "pass";
    push("self-eval", String(event?.summary || detail?.criterion || "self-eval attempt"), event, passed ? [event] : [], passed ? [] : [event]);
  }
  for (const event of evidence.pipeline) {
    const failed = String(event?.type) === "pipeline_stage_failed";
    push("pipeline-stage", `${String(event?.type)} ${String((event as Record<string, unknown>)?.stageId || "")}`.trim(), event, failed ? [] : [event], failed ? [event] : []);
  }
  for (const { payload, rewardScore } of evidence.swarm) {
    const ok = payload?.ok !== false && Number(payload?.exitCode ?? 0) === 0;
    push(
      "swarm-task",
      rewardScore !== null ? `swarm run · reward ${rewardScore}` : "sandbox run",
      payload,
      ok ? [payload] : [],
      ok ? [] : [payload],
    );
  }

  return records;
}

// ---------------------------------------------------------------------------
// Stamping — model-training row + training:* sidecar entry (CLI-owned lane).
// ---------------------------------------------------------------------------

export interface TrainingExportSummary {
  exportId: string;
  at: string;
  modelId: string;
  recordCount: number;
  surfaces: Record<string, number>;
  escalations: number;
  rewardMean: number | null;
  path: string;
}

export function stampWorkspaceTraining(
  workspace: WorkspaceFiles,
  slug: string,
  summary: TrainingExportSummary,
): { sourceKey: string } {
  const sourceKey = `training:${TRAINING_OBJECT_ID}:${slug}`;
  const objects = dataModelObjects(workspace.config);
  let object = objects.find((o) => o?.objectType === TRAINING_OBJECT_TYPE);
  if (!object) {
    object = {
      id: TRAINING_OBJECT_ID,
      label: "Model Training",
      source: "Model Training",
      objectType: TRAINING_OBJECT_TYPE,
      icon: "Terminal",
      columns: TRAINING_COLUMNS,
      rows: [],
      binding: { mode: "manual", source: "Model Training" },
      relations: [],
      fieldSettings: { hidden: [], order: TRAINING_COLUMNS },
    };
    objects.push(object);
    (workspace.config.dataModel as Record<string, unknown>) = {
      ...(workspace.config.dataModel as Record<string, unknown>),
      objects,
    };
  }

  const rows = Array.isArray(object.rows) ? (object.rows as Record<string, unknown>[]) : [];
  let row = rows.find((r) => String(r?.Name || "") === slug);
  if (!row) {
    row = { Name: slug, baseModel: "", localModel: summary.modelId, description: "Continued-training ledger row." };
    rows.push(row);
    object.rows = rows;
  }
  row.status = "exported";
  row.lastExportAt = summary.at;
  row.lastExportId = summary.exportId;
  row.lastSourceId = sourceKey;
  row.lastExportSummary = JSON.stringify({
    recordCount: summary.recordCount,
    surfaces: summary.surfaces,
    escalations: summary.escalations,
    rewardMean: summary.rewardMean,
    path: summary.path,
  });

  const existing = workspace.records[sourceKey] as Record<string, unknown> | undefined;
  const priorRecords = Array.isArray(existing?.records) ? (existing!.records as unknown[]) : [];
  workspace.records[sourceKey] = {
    recordCount: priorRecords.length + 1,
    fetchedAt: summary.at,
    records: [
      ...priorRecords,
      {
        exportId: summary.exportId,
        at: summary.at,
        modelId: summary.modelId,
        recordCount: summary.recordCount,
        surfaces: summary.surfaces,
        escalations: summary.escalations,
        rewardMean: summary.rewardMean,
        path: summary.path,
      },
    ],
  };

  fs.writeFileSync(workspace.configPath, `${JSON.stringify(workspace.config, null, 2)}\n`, "utf8");
  fs.writeFileSync(workspace.recordsPath, `${JSON.stringify(workspace.records, null, 2)}\n`, "utf8");
  return { sourceKey };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface IntelligenceExportResult {
  exportId: string;
  outPath: string;
  sourceKey: string;
  recordCount: number;
  surfaces: Record<string, number>;
  escalations: number;
  rewardMean: number | null;
  modelId: string;
}

export function runIntelligenceExport({
  workspaceDir,
  forkDir,
  outDir,
  slug = DEFAULT_TRAINING_ROW,
  now = () => new Date(),
}: {
  workspaceDir: string;
  forkDir?: string;
  outDir?: string;
  slug?: string;
  now?: () => Date;
}): IntelligenceExportResult {
  const workspace = readWorkspaceFiles(workspaceDir);
  const evidence = collectTrainingEvidence({ workspace, forkDir });

  // Model id: existing ledger row's localModel, else the helper sandbox row.
  let modelId = "";
  for (const object of dataModelObjects(workspace.config)) {
    const rows = Array.isArray(object?.rows) ? (object.rows as Record<string, unknown>[]) : [];
    if (object?.objectType === TRAINING_OBJECT_TYPE) {
      const row = rows.find((r) => String(r?.Name || "") === slug);
      if (row?.localModel) modelId = String(row.localModel);
    }
    if (!modelId && object?.objectType === "sandbox-environment") {
      const row = rows.find((r) => String(r?.adapter || "") === "local-intelligence" && r?.localModel);
      if (row?.localModel) modelId = String(row.localModel);
    }
  }
  if (!modelId) modelId = "local";

  const at = now().toISOString();
  const records = buildTrainingTraceRecords(evidence, { modelId, createdAt: at });

  const surfaces: Record<string, number> = {};
  for (const record of records) {
    const key = record.businessObjectType === "helper-receipt"
      ? "helper"
      : record.businessObjectType === "self-eval"
        ? "selfEval"
        : record.businessObjectType === "pipeline-stage"
          ? "pipeline"
          : "swarm";
    surfaces[key] = (surfaces[key] || 0) + 1;
  }
  const rewards = evidence.swarm.map((s) => s.rewardScore).filter((s): s is number => s !== null);
  const rewardMean = rewards.length
    ? Number((rewards.reduce((a, b) => a + b, 0) / rewards.length).toFixed(4))
    : null;

  const exportsHome = outDir
    || path.join(process.env.GROWTHUB_KIT_EXPORTS_HOME || path.join(os.homedir(), "growthub-worker-kit-exports"), "training");
  fs.mkdirSync(exportsHome, { recursive: true });
  const exportId = `exp_${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`;
  const outPath = path.join(exportsHome, `${slug}-${at.replace(/[:.]/g, "-")}.jsonl`);
  fs.writeFileSync(outPath, records.map((r) => formatTraceRecordLine(r)).join(""), "utf8");

  const { sourceKey } = stampWorkspaceTraining(workspace, slug, {
    exportId,
    at,
    modelId,
    recordCount: records.length,
    surfaces,
    escalations: evidence.escalations,
    rewardMean,
    path: outPath,
  });

  return { exportId, outPath, sourceKey, recordCount: records.length, surfaces, escalations: evidence.escalations, rewardMean, modelId };
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

export function registerIntelligenceCommands(program: Command): void {
  const intelligence = program
    .command("intelligence")
    .description("Local intelligence utilities (continued-training export)");

  intelligence
    .command("export")
    .description("Export governed workspace evidence as a training corpus and stamp the Training Ledger")
    .option("--workspace <dir>", "exported workspace app directory (contains growthub.config.json)", process.cwd())
    .option("--fork <dir>", "fork root containing .growthub-fork (self-eval/pipeline evidence; defaults to the workspace dir)")
    .option("--out <dir>", "corpus output directory (default: $GROWTHUB_KIT_EXPORTS_HOME/training)")
    .option("--slug <name>", "training ledger row name", DEFAULT_TRAINING_ROW)
    .option("--json", "emit JSON envelope", false)
    .action((opts: { workspace: string; fork?: string; out?: string; slug: string; json: boolean }) => {
      try {
        const result = runIntelligenceExport({
          workspaceDir: path.resolve(opts.workspace),
          forkDir: opts.fork ? path.resolve(opts.fork) : undefined,
          outDir: opts.out ? path.resolve(opts.out) : undefined,
          slug: opts.slug,
        });
        if (opts.json) {
          process.stdout.write(`${JSON.stringify({ kind: "growthub-intelligence-export-v1", ...result }, null, 2)}\n`);
          return;
        }
        const surfaceLine = Object.entries(result.surfaces).map(([k, n]) => `${k} ${n}`).join(" · ") || "no traces";
        console.log(pc.green(`corpus exported — ${result.recordCount} records (${surfaceLine})`));
        console.log(`  exportId   ${result.exportId}`);
        console.log(`  corpus     ${result.outPath}`);
        console.log(`  ledger     ${result.sourceKey}`);
        if (result.escalations) console.log(`  escalations ${result.escalations} diagnoses included`);
        if (result.rewardMean !== null) console.log(`  rewardMean ${result.rewardMean}`);
        console.log("");
        console.log("Fine-tune handoff (no training happens in this CLI):");
        console.log("  1. Run your external QLoRA/fine-tune tooling over the corpus JSONL.");
        console.log(`  2. Load the tuned weights into your local runtime (Ollama/LM Studio/vLLM).`);
        console.log(`  3. Select the tuned model id in Local Intelligence — the ledger row (${opts.slug}) tracks it.`);
      } catch (error) {
        console.error(pc.red(`intelligence export failed: ${error instanceof Error ? error.message : String(error)}`));
        process.exitCode = 1;
      }
    });
}
