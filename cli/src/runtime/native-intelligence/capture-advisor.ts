/**
 * Native Intelligence — Post-Run Knowledge Capture Advisor
 *
 * Analyzes a completed agent run and proposes structured knowledge items
 * worth saving to the local KB. This is the "compounding intelligence"
 * engine: each run can deposit reusable knowledge that enriches future runs.
 *
 * When the model backend is unavailable, falls back to deterministic
 * artifact-based proposals so the CLI never blocks on model availability.
 */

import type {
  NativeIntelligenceBackend,
  KnowledgeCaptureAdvisoryInput,
  KnowledgeCaptureAdvisoryResult,
  KnowledgeCaptureProposal,
} from "./contract.js";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const CAPTURE_ADVISOR_SYSTEM_PROMPT = `You are a knowledge capture specialist for the Growthub agent platform.
Your job is to analyze a completed agent run and propose structured knowledge items worth saving.

You analyze:
- The execution summary (what happened, what succeeded, what failed)
- The user's original intent (what they were trying to achieve)
- The artifacts produced (type and content preview)

You propose knowledge items that:
- Encode reusable insights, patterns, or findings from this run
- Are specific enough to be actionable in future runs
- Are general enough to apply beyond just this exact run
- Capture "what worked" and "what to avoid" learnings

Each proposal must have:
- name: concise title (max 80 chars)
- description: 1-2 sentences explaining value
- body: the actual knowledge content in markdown (max 2000 chars)
- format: "markdown" | "text" | "json"
- source: "agent_run" (always)
- confidence: 0.0-1.0 (how certain you are this is worth saving)
- reason: brief explanation of why this is valuable

Respond in JSON with this schema:
{
  "proposals": [
    {
      "name": "string",
      "description": "string",
      "body": "string",
      "format": "markdown" | "text" | "json",
      "source": "agent_run",
      "confidence": number,
      "reason": "string"
    }
  ],
  "explanation": "string — 1-2 sentence overview of what was captured",
  "confidence": number
}

IMPORTANT: Only propose items that are genuinely valuable to save. 
It is better to propose 0-1 high-quality items than 5 low-quality ones.
Do NOT propose items that are specific to a single piece of content with no reusable value.`;

// ---------------------------------------------------------------------------
// Advisor
// ---------------------------------------------------------------------------

export async function adviseCaptureItems(
  input: KnowledgeCaptureAdvisoryInput,
  backend: NativeIntelligenceBackend,
): Promise<KnowledgeCaptureAdvisoryResult> {
  const userPrompt = buildAdvisorPrompt(input);

  try {
    const completion = await backend.complete({
      systemPrompt: CAPTURE_ADVISOR_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
      maxTokens: 3000,
      responseFormat: "json",
    });

    const parsed = parseJsonSafe<KnowledgeCaptureAdvisoryResult>(completion.text);
    if (parsed) {
      return validateAdvisoryResult(parsed, input.maxProposals ?? 3);
    }
  } catch {
    // Fall through to deterministic fallback
  }

  return buildDeterministicCaptureSuggestions(input);
}

// ---------------------------------------------------------------------------
// Deterministic fallback
// ---------------------------------------------------------------------------

export function buildDeterministicCaptureSuggestions(
  input: KnowledgeCaptureAdvisoryInput,
): KnowledgeCaptureAdvisoryResult {
  const proposals: KnowledgeCaptureProposal[] = [];
  const maxProposals = input.maxProposals ?? 3;

  // Propose a run summary note if user intent is available
  if (input.userIntent && input.userIntent.trim().length > 10) {
    const summaryBody = [
      `## Run Summary: ${input.userIntent.slice(0, 80)}`,
      "",
      "### Intent",
      input.userIntent,
      "",
      "### Execution Summary",
      input.executionSummaryText.slice(0, 1000),
      "",
      "### Artifacts Produced",
      ...input.artifactSummaries.map(
        (a) => `- **${a.artifactType}** from \`${a.sourceNodeSlug}\`${a.outputText ? `: ${a.outputText.slice(0, 200)}` : ""}`,
      ),
    ].join("\n");

    proposals.push({
      name: `Run Pattern: ${input.userIntent.slice(0, 60)}`,
      description: `Execution pattern and outcome from run ${input.runId}.`,
      body: summaryBody,
      format: "markdown",
      source: "agent_run",
      confidence: 0.6,
      reason: "Captures the workflow pattern and intent for future reference.",
    });
  }

  // Propose artifact-specific items for text/report artifacts with output text
  for (const artifact of input.artifactSummaries) {
    if (proposals.length >= maxProposals) break;
    if (!artifact.outputText || artifact.outputText.trim().length < 50) continue;
    if (artifact.artifactType !== "text" && artifact.artifactType !== "report") continue;

    proposals.push({
      name: `${artifact.artifactType.charAt(0).toUpperCase() + artifact.artifactType.slice(1)} from ${artifact.sourceNodeSlug}`,
      description: `Output content from ${artifact.sourceNodeSlug} in run ${input.runId}.`,
      body: artifact.outputText.slice(0, 2000),
      format: "text",
      source: "agent_run",
      confidence: 0.5,
      reason: `Text/report artifact with substantial content (${artifact.outputText.length} chars).`,
    });
  }

  return {
    proposals,
    explanation:
      proposals.length > 0
        ? `Deterministic capture: ${proposals.length} item(s) proposed from run ${input.runId}.`
        : `No high-confidence knowledge items identified for run ${input.runId}.`,
    confidence: proposals.length > 0 ? 0.5 : 0.0,
  };
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildAdvisorPrompt(input: KnowledgeCaptureAdvisoryInput): string {
  const sections: string[] = [
    `Run ID: ${input.runId}`,
    `Max proposals requested: ${input.maxProposals ?? 3}`,
    "",
    "Execution Summary:",
    input.executionSummaryText.slice(0, 1500),
  ];

  if (input.userIntent) {
    sections.push("", "User Intent:", input.userIntent.slice(0, 500));
  }

  if (input.artifactSummaries.length > 0) {
    sections.push("", "Artifacts Produced:");
    for (const artifact of input.artifactSummaries) {
      sections.push(
        `  - Type: ${artifact.artifactType}, Source Node: ${artifact.sourceNodeSlug}` +
          (artifact.outputText ? `\n    Preview: ${artifact.outputText.slice(0, 300)}` : ""),
      );
    }
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

function validateAdvisoryResult(
  raw: Partial<KnowledgeCaptureAdvisoryResult>,
  maxProposals: number,
): KnowledgeCaptureAdvisoryResult {
  const rawProposals = Array.isArray(raw.proposals) ? raw.proposals : [];
  const proposals: KnowledgeCaptureProposal[] = rawProposals
    .slice(0, maxProposals)
    .filter(
      (p): p is Partial<KnowledgeCaptureProposal> =>
        typeof p === "object" && p !== null,
    )
    .map((p) => ({
      name: typeof p.name === "string" ? p.name.slice(0, 80) : "Untitled knowledge item",
      description: typeof p.description === "string" ? p.description : "",
      body: typeof p.body === "string" ? p.body.slice(0, 2000) : "",
      format: (p.format === "markdown" || p.format === "text" || p.format === "json")
        ? p.format
        : "markdown",
      source: "agent_run" as const,
      confidence: typeof p.confidence === "number" ? Math.max(0, Math.min(1, p.confidence)) : 0.5,
      reason: typeof p.reason === "string" ? p.reason : "",
    }))
    .filter((p) => p.body.trim().length > 0);

  return {
    proposals,
    explanation: typeof raw.explanation === "string" ? raw.explanation : "",
    confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
  };
}
