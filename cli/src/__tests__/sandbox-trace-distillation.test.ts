import { describe, expect, it } from "vitest";
import {
  exportSandboxTracesToJsonlLines,
  looksLikeSandboxRunReceipt,
  sandboxReceiptToSftLine,
} from "../runtime/workspace/sandbox-trace-distillation.js";

describe("sandbox-trace-distillation", () => {
  it("detects sandbox run receipts", () => {
    expect(
      looksLikeSandboxRunReceipt({
        runId: "run_1",
        command: "hello",
        stdout: "out",
      }),
    ).toBe(true);
    expect(looksLikeSandboxRunReceipt({})).toBe(false);
    expect(looksLikeSandboxRunReceipt({ runId: "x" })).toBe(false);
  });

  it("maps receipt to OpenAI-style messages + metadata", () => {
    const line = sandboxReceiptToSftLine(
      {
        runId: "run_a",
        ranAt: "2026-05-14T00:00:00.000Z",
        instructions: "You are an SDR.",
        command: "Score this lead.",
        stdout: "BANT 7/10",
        exitCode: 0,
        durationMs: 1200,
        adapter: "local-intelligence",
        runtime: "node",
        runLocality: "local",
        localIntelligence: {
          localModel: "gemma3:4b",
          localEndpoint: "http://127.0.0.1:11434/v1/chat/completions",
          intelligenceAdapterMode: "ollama",
        },
      },
      "sandbox:obj_1:qualifier",
      { role: "sdr-qualification", qualityLabel: "gold" },
    );
    expect(line).not.toBeNull();
    expect(line!.messages).toHaveLength(3);
    expect(line!.messages[0]).toEqual({ role: "system", content: "You are an SDR." });
    expect(line!.messages[1]).toEqual({ role: "user", content: "Score this lead." });
    expect(line!.messages[2]).toEqual({ role: "assistant", content: "BANT 7/10" });
    expect(line!.growthub_distillation_v1.teacherModel).toBe("gemma3:4b");
    expect(line!.growthub_distillation_v1.role).toBe("sdr-qualification");
    expect(line!.growthub_distillation_v1.qualityLabel).toBe("gold");
  });

  it("exportSandboxTracesToJsonlLines iterates sandbox:* keys only", () => {
    const sidecar = {
      "ga:traffic": { records: [{ foo: 1 }] },
      "sandbox:obj:x": {
        records: [
          {
            runId: "r1",
            ranAt: "2026-05-14T00:00:00.000Z",
            instructions: "sys",
            command: "usr",
            stdout: "asst",
            exitCode: 0,
          },
          {
            runId: "r2",
            ranAt: "2026-05-14T00:00:01.000Z",
            instructions: "sys",
            command: "usr",
            stdout: "",
            exitCode: 1,
          },
        ],
      },
    };
    const { lines, summary } = exportSandboxTracesToJsonlLines(sidecar, {
      successOnly: true,
      requireNonEmptyStdout: true,
    });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!.trim()) as { growthub_distillation_v1: { runId: string } };
    expect(parsed.growthub_distillation_v1.runId).toBe("r1");
    expect(summary.receiptsSeen).toBe(2);
    expect(summary.linesWritten).toBe(1);
    expect(summary.skipped.filteredByPolicy).toBe(1);
  });
});
