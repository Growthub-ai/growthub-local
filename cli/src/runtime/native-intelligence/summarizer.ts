/**
 * Native Intelligence — Summarizer (Phase 1)
 *
 * Generates better execution summaries at key lifecycle points:
 *   - pre-save review text
 *   - pre-execution explanation
 *   - "why this workflow" summary
 *   - "what is missing" guidance
 *   - post-execution summary
 *
 * This is the lowest-risk, highest-value V1 use case because:
 *   - No workflow mutation needed
 *   - Immediately useful for both agents and humans
 *   - Improves current CLI UX right away
 *
 * When the model backend is unavailable, falls back to deterministic
 * template-based summaries so the CLI never blocks on model availability.
 */

import type {
  NativeIntelligenceBackend,
  ExecutionSummaryInput,
  ExecutionSummaryResult,
  PipelineSummaryForIntelligence,
  ExecutionResultForIntelligence,
  NodeContractSummary,
} from "./contract.js";

// ---------------------------------------------------------------------------
// System prompt for summary generation
// ---------------------------------------------------------------------------

const SUMMARIZER_SYSTEM_PROMPT = `You are a workflow execution analyst for the Growthub platform.
Your job is to produce clear, concise, actionable summaries about workflow pipelines.

You analyze:
- Pipeline graph structure (node slugs, bindings, upstream dependencies)
- Contract truth (required/optional inputs, output types, execution strategies)
- Execution results when available (success/failure per node, artifacts produced)
- Runtime mode (local, hosted, hybrid)

Your summaries must be:
- Specific: reference actual node slugs and binding names
- Actionable: tell the user what to fix or what to expect
- Concise: under 200 words for each summary section
- Honest: flag real issues, don't invent phantom problems

You NEVER recommend running workflows, only explain and analyze them.
You NEVER generate executable code or modify pipeline configurations.

Respond in JSON with this schema:
{
  "title": "string — short summary title",
  "explanation": "string — 1-3 sentence overview of the pipeline",
  "missingBindingGuidance": ["string — one per missing binding with fix guidance"],
  "runtimeModeNote": "string | null — note about execution mode implications",
  "outputExpectation": "string | null — what artifacts/outputs to expect",
  "costLatencyCautions": ["string — cost or latency warnings"],
  "warnings": ["string — other warnings"],
  "confidence": "number 0-1 — how confident in the analysis"
}`;

// ---------------------------------------------------------------------------
// Summarizer
// ---------------------------------------------------------------------------

export async function summarizeExecution(
  input: ExecutionSummaryInput,
  backend: NativeIntelligenceBackend,
): Promise<ExecutionSummaryResult> {
  const userPrompt = buildSummarizerPrompt(input);

  try {
    const completion = await backend.complete({
      systemPrompt: SUMMARIZER_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.2,
      maxTokens: 2048,
      responseFormat: "json",
    });

    const parsed = parseJsonSafe<ExecutionSummaryResult>(completion.text);
    if (parsed) {
      return validateSummaryResult(parsed);
    }
  } catch {
    // Fall through to deterministic fallback
  }

  return buildDeterministicSummary(input);
}

// ---------------------------------------------------------------------------
// Deterministic fallback (no model required)
// ---------------------------------------------------------------------------

export function buildDeterministicSummary(
  input: ExecutionSummaryInput,
): ExecutionSummaryResult {
  const { pipeline, registryContext, phase, executionResult } = input;
  const nodeCount = pipeline.nodes.length;
  const slugs = pipeline.nodes.map((n) => n.slug);
  const allMissing = pipeline.nodes.flatMap((n) => n.missingRequired);
  const allWarnings = [...pipeline.warnings];
  const costCautions: string[] = [];
  const missingGuidance: string[] = [];

  for (const node of pipeline.nodes) {
    for (const field of node.missingRequired) {
      const contract = registryContext.find((c) => c.slug === node.slug);
      const inputField = contract?.inputs.find((i) => i.key === field);
      const label = inputField?.label ?? field;
      missingGuidance.push(
        `${node.slug}: "${label}" is required but missing. Provide a value before execution.`,
      );
    }
  }

  for (const node of pipeline.nodes) {
    if (node.outputTypes.includes("video")) {
      costCautions.push(`${node.slug}: video generation may have higher latency and cost.`);
    }
    if (node.assetCount > 5) {
      costCautions.push(`${node.slug}: ${node.assetCount} assets referenced — verify all are accessible.`);
    }
  }

  let title: string;
  let explanation: string;
  let runtimeModeNote: string | undefined;
  let outputExpectation: string | undefined;

  if (phase === "pre-save") {
    title = `Pre-Save Review: ${nodeCount}-node pipeline`;
    explanation = `Pipeline "${pipeline.pipelineId}" contains ${nodeCount} node(s): ${slugs.join(", ")}. `
      + (allMissing.length > 0
        ? `${allMissing.length} required binding(s) are missing.`
        : "All required bindings are present.");
  } else if (phase === "pre-execution") {
    title = `Pre-Execution Summary: ${nodeCount} node(s)`;
    explanation = `About to execute pipeline "${pipeline.pipelineId}" with ${nodeCount} node(s) in ${pipeline.executionMode} mode. `
      + (allMissing.length > 0
        ? `Warning: ${allMissing.length} required binding(s) are unresolved.`
        : "All bindings are resolved.");
    runtimeModeNote = pipeline.executionMode === "hosted"
      ? "Running in hosted mode — execution happens on Growthub servers."
      : pipeline.executionMode === "local"
        ? "Running in local mode — execution happens on this machine."
        : "Running in hybrid mode — some nodes execute locally, others hosted.";
  } else if (phase === "post-execution" && executionResult) {
    title = `Execution ${executionResult.status === "succeeded" ? "Completed" : "Failed"}: ${nodeCount} node(s)`;
    const succeeded = Object.values(executionResult.nodeStatuses).filter((s) => s === "succeeded").length;
    const failed = Object.values(executionResult.nodeStatuses).filter((s) => s === "failed").length;
    explanation = `Execution finished: ${succeeded} succeeded, ${failed} failed. `
      + (executionResult.artifactCount > 0
        ? `${executionResult.artifactCount} artifact(s) produced.`
        : "No artifacts produced.");
    if (executionResult.errorMessages && executionResult.errorMessages.length > 0) {
      allWarnings.push(...executionResult.errorMessages.map((msg) => `Execution error: ${msg}`));
    }
    outputExpectation = executionResult.outputText
      ? `Output preview: ${executionResult.outputText.slice(0, 200)}`
      : undefined;
  } else if (phase === "recommendation") {
    title = `Workflow Analysis: ${nodeCount} node(s)`;
    explanation = `Analyzing pipeline with ${nodeCount} node(s): ${slugs.join(", ")}. `
      + `This pipeline ${allMissing.length === 0 ? "is ready for execution" : "needs attention before execution"}.`;
  } else {
    title = `Pipeline Summary: ${nodeCount} node(s)`;
    explanation = `Pipeline "${pipeline.pipelineId}" with ${nodeCount} node(s) in ${pipeline.executionMode} mode.`;
  }

  const outputFamilies = new Set(pipeline.nodes.flatMap((n) => n.outputTypes));
  if (!outputExpectation && outputFamilies.size > 0) {
    outputExpectation = `Expected output types: ${[...outputFamilies].join(", ")}.`;
  }

  return {
    title,
    explanation,
    missingBindingGuidance: missingGuidance,
    runtimeModeNote,
    outputExpectation,
    costLatencyCautions: costCautions,
    warnings: allWarnings,
    confidence: 1.0,
  };
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildSummarizerPrompt(input: ExecutionSummaryInput): string {
  const { pipeline, registryContext, phase, executionResult } = input;

  const sections: string[] = [
    `Phase: ${phase}`,
    `Pipeline ID: ${pipeline.pipelineId}`,
    `Execution Mode: ${pipeline.executionMode}`,
    `Node Count: ${pipeline.nodes.length}`,
    "",
    "Nodes:",
  ];

  for (const node of pipeline.nodes) {
    const contract = registryContext.find((c) => c.slug === node.slug);
    sections.push(
      `  - ${node.slug}: bindings=${node.bindingCount}, missing=[${node.missingRequired.join(",")}], outputs=[${node.outputTypes.join(",")}], assets=${node.assetCount}`
      + (contract ? `, family=${contract.family}, strategy=${contract.executionStrategy}` : ""),
    );
  }

  if (pipeline.warnings.length > 0) {
    sections.push("", "Pipeline Warnings:", ...pipeline.warnings.map((w) => `  - ${w}`));
  }

  if (executionResult) {
    sections.push(
      "",
      "Execution Result:",
      `  Status: ${executionResult.status}`,
      `  Artifacts: ${executionResult.artifactCount}`,
      `  Node Statuses: ${JSON.stringify(executionResult.nodeStatuses)}`,
    );
    if (executionResult.errorMessages && executionResult.errorMessages.length > 0) {
      sections.push("  Errors:", ...executionResult.errorMessages.map((e) => `    - ${e}`));
    }
    if (executionResult.outputText) {
      sections.push(`  Output Preview: ${executionResult.outputText.slice(0, 500)}`);
    }
  }

  sections.push("", "Available Contract Context:");
  for (const contract of registryContext.slice(0, 20)) {
    sections.push(
      `  - ${contract.slug} (${contract.family}): inputs=[${contract.inputs.map((i) => `${i.key}:${i.type}${i.required ? "*" : ""}`).join(",")}], outputs=[${contract.outputTypes.join(",")}]`,
    );
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// JSON parse helper
// ---------------------------------------------------------------------------

function parseJsonSafe<T>(text: string): T | null {
  try {
    const trimmed = text.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as T;
    }
    return null;
  } catch {
    return null;
  }
}

function validateSummaryResult(raw: Partial<ExecutionSummaryResult>): ExecutionSummaryResult {
  return {
    title: typeof raw.title === "string" ? raw.title : "Pipeline Summary",
    explanation: typeof raw.explanation === "string" ? raw.explanation : "",
    missingBindingGuidance: Array.isArray(raw.missingBindingGuidance) ? raw.missingBindingGuidance : [],
    runtimeModeNote: typeof raw.runtimeModeNote === "string" ? raw.runtimeModeNote : undefined,
    outputExpectation: typeof raw.outputExpectation === "string" ? raw.outputExpectation : undefined,
    costLatencyCautions: Array.isArray(raw.costLatencyCautions) ? raw.costLatencyCautions : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
  };
}
