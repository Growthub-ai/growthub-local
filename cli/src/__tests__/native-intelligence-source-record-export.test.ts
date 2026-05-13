import { describe, expect, it } from "vitest";
import { redactForTraceExport, sandboxEnvelopeToTraceRecord } from "../runtime/native-intelligence/source-record-export.js";
import type { LocalIntelligenceSandboxTaskInput, LocalModelSandboxRunEnvelope } from "../runtime/native-intelligence/contract.js";

describe("redactForTraceExport", () => {
  it("redacts sensitive keys and bearer tokens in nested structures", () => {
    const out = redactForTraceExport({
      userIntent: "ok",
      nested: { api_key: "secret123", safe: "x" },
      text: 'use bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhIjoxfQ.sig',
    }) as Record<string, unknown>;
    expect(out.nested).toEqual({ api_key: "[REDACTED]", safe: "x" });
    expect(String(out.text)).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(String(out.text)).toMatch(/REDACTED/);
  });
});

describe("sandboxEnvelopeToTraceRecord", () => {
  it("applies redaction to exported trace records", () => {
    const taskInput: LocalIntelligenceSandboxTaskInput = {
      taskId: "t",
      businessObjectType: "x",
      userIntent: "token=sk-123456789012345678901234567890",
      context: {
        taskId: "t",
        businessObjectType: "x",
        executionMode: "local",
        allowedToolSlugs: [],
        availableContracts: [],
        bindings: { api_key: "leak" },
      },
    };
    const envelope: LocalModelSandboxRunEnvelope = {
      version: "growthub-local-model-sandbox-v1",
      taskId: "t",
      businessObjectType: "x",
      adapter: { kind: "local-intelligence", mode: "ollama", modelId: "m" },
      result: {
        json: { token: "x" },
        toolIntents: [],
        warnings: [],
        confidence: 0,
      },
      latencyMs: 1,
      createdAt: new Date().toISOString(),
    };
    const rec = sandboxEnvelopeToTraceRecord(taskInput, envelope);
    const serialized = JSON.stringify(rec);
    expect(serialized).not.toContain("leak");
    expect(serialized).not.toContain("sk-123456789012345678901234567890");
  });
});
