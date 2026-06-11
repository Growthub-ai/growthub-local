/**
 * `growthub intelligence export` — deterministic tests over a temp workspace.
 *
 * Proves the closed loop the Training Ledger renders: governed evidence in
 * (helper receipts, sandbox/swarm payloads with reward, self-eval trace),
 * existing-format JSONL corpus out, and row + training:* sidecar stamps that
 * the kit's pure deriver scores complete with evidence linked. Also proves
 * sanitization: credential-shaped values never reach the corpus.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildTrainingTraceRecords,
  collectTrainingEvidence,
  readWorkspaceFiles,
  runIntelligenceExport,
  sanitizeForExport,
  DEFAULT_TRAINING_ROW,
  TRAINING_OBJECT_TYPE,
} from "../commands/intelligence.js";

function makeWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-intel-export-"));
  const config = {
    dashboards: [],
    canvas: { widgets: [] },
    dataModel: {
      objects: [
        {
          id: "sandbox-probe",
          objectType: "sandbox-environment",
          rows: [
            {
              Name: "probe-local-sbx",
              adapter: "local-process",
              lastResponse: JSON.stringify({ ok: true, exitCode: 0, swarm: { reward: { score: 0.9 } } }),
            },
            { Name: "helper", adapter: "local-intelligence", localModel: "gemma3:4b" },
          ],
        },
      ],
    },
  };
  const records = {
    "helper:apply:receipts": {
      recordCount: 2,
      records: [
        { type: "dashboard.create", rationale: "ops overview", confidence: 0.9, outcome: "applied", apiKey: "sk-live-very-secret" },
        { type: "widgetType.bind", rationale: "weak match", confidence: 0.4, outcome: "skipped", skipReason: "low confidence" },
      ],
    },
    "sandbox:sandbox-probe:run": {
      recordCount: 1,
      records: [{ ok: true, exitCode: 0, swarm: { reward: { score: 0.7 } } }],
    },
  };
  fs.writeFileSync(path.join(dir, "growthub.config.json"), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(dir, "growthub.source-records.json"), JSON.stringify(records, null, 2));

  const forkDir = path.join(dir, ".growthub-fork");
  fs.mkdirSync(forkDir, { recursive: true });
  const traceEvents = [
    {
      forkId: "f1", kitId: "k1", type: "self_eval_recorded", summary: "attempt 1 fail",
      detail: { skill: "demo", attempt: 1, maxRetries: 2, criterion: "renders", outcome: "fail" },
      timestamp: "2026-06-11T00:00:00.000Z",
    },
    {
      forkId: "f1", kitId: "k1", type: "self_eval_recorded", summary: "attempt 2 fail",
      detail: { skill: "demo", attempt: 2, maxRetries: 2, criterion: "renders", outcome: "fail" },
      timestamp: "2026-06-11T00:01:00.000Z",
    },
    { type: "pipeline_stage_completed", kitId: "k1", pipelineId: "p1", stageId: "brief", client: "c", project: "p", outputArtifacts: ["a.md"], timestamp: "2026-06-11T00:02:00.000Z" },
  ];
  fs.writeFileSync(path.join(forkDir, "trace.jsonl"), traceEvents.map((e) => `${JSON.stringify(e)}\n`).join(""));
  return dir;
}

describe("sanitizeForExport", () => {
  it("redacts credential-shaped keys and values, preserves business fields", () => {
    const out = sanitizeForExport({
      apiKey: "sk-live-abc",
      nested: { Authorization: "Bearer xyz", note: "keep me" },
      plain: "Bearer abc123",
      count: 3,
    }) as Record<string, unknown>;
    expect(out.apiKey).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).Authorization).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).note).toBe("keep me");
    expect(out.plain).toBe("[redacted]");
    expect(out.count).toBe(3);
  });
});

describe("collectTrainingEvidence + buildTrainingTraceRecords", () => {
  it("collects all four surfaces and counts the escalation at maxRetries", () => {
    const dir = makeWorkspace();
    const workspace = readWorkspaceFiles(dir);
    const evidence = collectTrainingEvidence({ workspace });
    expect(evidence.helperApplied).toHaveLength(1);
    expect(evidence.helperSkipped).toHaveLength(1);
    expect(evidence.selfEval).toHaveLength(2);
    expect(evidence.pipeline).toHaveLength(1);
    expect(evidence.swarm.length).toBeGreaterThanOrEqual(2);
    expect(evidence.escalations).toBe(1);

    const records = buildTrainingTraceRecords(evidence, { modelId: "gemma3:4b", createdAt: "2026-06-11T00:03:00.000Z" });
    for (const record of records) {
      expect(record.version).toBe("growthub-local-intelligence-trace-v1");
      expect(JSON.stringify(record)).not.toContain("sk-live-very-secret");
    }
    const applied = records.find((r) => r.taskId === "helper-receipt-1");
    expect(applied?.validation.acceptedToolIntents).toHaveLength(1);
    const skipped = records.find((r) => r.taskId === "helper-receipt-2");
    expect(skipped?.validation.rejectedToolIntents).toHaveLength(1);
  });
});

describe("runIntelligenceExport", () => {
  it("writes the corpus, stamps the row, and the stamps cross-check (deriver-complete shape)", () => {
    const dir = makeWorkspace();
    const outDir = path.join(dir, "out");
    const result = runIntelligenceExport({ workspaceDir: dir, outDir, now: () => new Date("2026-06-11T01:00:00.000Z") });

    expect(result.recordCount).toBeGreaterThanOrEqual(6);
    expect(result.surfaces.helper).toBe(2);
    expect(result.surfaces.selfEval).toBe(2);
    expect(result.surfaces.pipeline).toBe(1);
    expect(result.escalations).toBe(1);
    expect(result.rewardMean).toBeCloseTo(0.8, 5);
    expect(result.modelId).toBe("gemma3:4b");

    const lines = fs.readFileSync(result.outPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(result.recordCount);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.version).toBe("growthub-local-intelligence-trace-v1");
    }
    expect(fs.readFileSync(result.outPath, "utf8")).not.toContain("sk-live-very-secret");

    const config = JSON.parse(fs.readFileSync(path.join(dir, "growthub.config.json"), "utf8"));
    const object = config.dataModel.objects.find((o: { objectType: string }) => o.objectType === TRAINING_OBJECT_TYPE);
    const row = object.rows.find((r: { Name: string }) => r.Name === DEFAULT_TRAINING_ROW);
    expect(row.lastExportId).toBe(result.exportId);
    expect(row.lastSourceId).toBe(result.sourceKey);
    expect(row.status).toBe("exported");

    const records = JSON.parse(fs.readFileSync(path.join(dir, "growthub.source-records.json"), "utf8"));
    const entry = records[result.sourceKey];
    expect(entry.records.at(-1).exportId).toBe(result.exportId);
    expect(entry.records.at(-1).recordCount).toBe(result.recordCount);

    // The PATCH-governed surfaces are untouched: only dataModel gained the
    // training object; dashboards/canvas exactly as seeded.
    expect(config.dashboards).toEqual([]);
    expect(config.canvas).toEqual({ widgets: [] });
  });

  it("re-export appends history and restamps the same row (no duplicates)", () => {
    const dir = makeWorkspace();
    const outDir = path.join(dir, "out");
    const first = runIntelligenceExport({ workspaceDir: dir, outDir, now: () => new Date("2026-06-11T01:00:00.000Z") });
    const second = runIntelligenceExport({ workspaceDir: dir, outDir, now: () => new Date("2026-06-11T02:00:00.000Z") });
    expect(second.exportId).not.toBe(first.exportId);

    const config = JSON.parse(fs.readFileSync(path.join(dir, "growthub.config.json"), "utf8"));
    const object = config.dataModel.objects.find((o: { objectType: string }) => o.objectType === TRAINING_OBJECT_TYPE);
    expect(object.rows.filter((r: { Name: string }) => r.Name === DEFAULT_TRAINING_ROW)).toHaveLength(1);

    const records = JSON.parse(fs.readFileSync(path.join(dir, "growthub.source-records.json"), "utf8"));
    expect(records[second.sourceKey].records).toHaveLength(2);
    expect(records[second.sourceKey].records.at(-1).exportId).toBe(second.exportId);
  });
});
