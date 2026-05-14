/**
 * Smoke tests for export-distillation-jsonl.mjs (no Vitest / pnpm required).
 * Run: node scripts/export-distillation-jsonl.test.mjs
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "export-distillation-jsonl.mjs");

test("trace export from growthub.source-records.json", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "distill-export-"));
  const recordsPath = path.join(tmp, "growthub.source-records.json");
  const outPath = path.join(tmp, "out.jsonl");

  const envelope = {
    version: "growthub-local-model-sandbox-v1",
    taskId: "run_fixture",
    businessObjectType: "sandbox-environment",
    adapter: {
      kind: "local-intelligence",
      mode: "ollama",
      modelId: "gemma3:4b",
      endpoint: "http://127.0.0.1:11434/v1/chat/completions",
    },
    result: {
      toolIntents: [],
      warnings: [],
      confidence: 0.4,
    },
    createdAt: "2026-05-01T12:00:00.000Z",
    latencyMs: 10,
  };

  fs.writeFileSync(
    recordsPath,
    `${JSON.stringify(
      {
        "sandbox:obj1:row-a": {
          records: [
            {
              runId: "run_fixture",
              ranAt: "2026-05-01T12:00:00.000Z",
              adapter: "local-intelligence",
              instructions: "Be concise.",
              command: "List widgets",
              stdout: JSON.stringify(envelope, null, 2),
              stderr: "",
              exitCode: 0,
              durationMs: 10,
            },
          ],
          integrationId: "sandbox:obj1:row-a",
          fetchedAt: "2026-05-01T12:00:00.000Z",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  execFileSync(process.execPath, [scriptPath, "--source-records", recordsPath, "--out", outPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const lines = fs.readFileSync(outPath, "utf8").trim().split("\n").filter(Boolean);
  assert.equal(lines.length, 1);
  const row = JSON.parse(lines[0]);
  assert.equal(row.version, "growthub-local-intelligence-trace-v1");
  assert.equal(row.taskId, "run_fixture");
  assert.equal(row.modelId, "gemma3:4b");
  assert.match(row.input.userIntent, /List widgets/);
  assert.match(row.input.userIntent, /Instructions:/);
  assert.equal(row.systemPromptHash.length, 64);
});

test("thread transcript export with --threads", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "distill-threads-"));
  const threadsDir = path.join(tmp, "threads");
  fs.mkdirSync(threadsDir, { recursive: true });
  fs.writeFileSync(
    path.join(threadsDir, "thread-one.json"),
    `${JSON.stringify(
      {
        id: "thread-one",
        messages: [{ role: "user", content: "hi", createdAt: "2026-05-01T12:00:00.000Z" }],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const outPath = path.join(tmp, "threads.jsonl");
  execFileSync(
    process.execPath,
    [scriptPath, "--threads", "--threads-dir", threadsDir, "--out", outPath],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  const lines = fs.readFileSync(outPath, "utf8").trim().split("\n").filter(Boolean);
  assert.equal(lines.length, 1);
  const row = JSON.parse(lines[0]);
  assert.equal(row.version, "growthub-local-intelligence-thread-transcript-v1");
  assert.equal(row.threadId, "thread-one");
  assert.equal(row.messages.length, 1);
});
