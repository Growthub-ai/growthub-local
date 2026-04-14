/**
 * Native Intelligence — Recommender (Phase 3)
 *
 * Given a task/intent, decides whether to:
 *   - Reuse an existing saved workflow
 *   - Start from a template
 *   - Synthesize a new graph
 *
 * Builds on the existing system's:
 *   - Saved workflows
 *   - Workflow lifecycle / hygiene labels
 *   - CMS node contracts
 *   - Templates
 *
 * The model creates value immediately without becoming "the whole orchestrator"
 * because it only recommends — the user/agent still chooses and executes.
 *
 * Falls back to deterministic scoring when model is unavailable.
 */

import type {
  NativeIntelligenceBackend,
  WorkflowRecommendationInput,
  WorkflowRecommendationResult,
  WorkflowRecommendation,
  RecommendationStrategy,
  WorkflowSummaryForIntelligence,
  NodeContractSummary,
} from "./contract.js";

// ---------------------------------------------------------------------------
// System prompt for workflow recommendation
// ---------------------------------------------------------------------------

const RECOMMENDER_SYSTEM_PROMPT = `You are a workflow recommendation engine for the Growthub platform.
Given a user's task intent, you decide the best path forward:

1. "reuse-existing" — if a saved workflow closely matches the intent
2. "start-from-template" — if a known node contract/template is a good starting point
3. "synthesize-new" — if no existing workflow or template fits well

You receive:
- The user's task description/intent
- A list of saved workflows (with names, node slugs, lifecycle labels)
- A list of available CMS node contracts

Your recommendation must:
- Pick the best strategy and explain why
- Provide 1-2 alternatives when possible
- Reference specific workflow IDs, names, or node slugs
- Consider lifecycle labels (canonical > experimental > archived)
- Be honest about confidence level

Respond in JSON:
{
  "topRecommendation": {
    "strategy": "reuse-existing | start-from-template | synthesize-new",
    "workflowId": "string | null — for reuse-existing",
    "workflowName": "string | null — for reuse-existing",
    "templateSlug": "string | null — for start-from-template",
    "reason": "string — why this is recommended",
    "confidence": 0.0-1.0
  },
  "alternatives": [
    {
      "strategy": "...",
      "workflowId": "string | null",
      "workflowName": "string | null",
      "templateSlug": "string | null",
      "reason": "string",
      "confidence": 0.0-1.0
    }
  ],
  "explanation": "string — overall recommendation rationale"
}`;

// ---------------------------------------------------------------------------
// Recommender
// ---------------------------------------------------------------------------

export async function recommendWorkflow(
  input: WorkflowRecommendationInput,
  backend: NativeIntelligenceBackend,
): Promise<WorkflowRecommendationResult> {
  const userPrompt = buildRecommenderPrompt(input);

  try {
    const completion = await backend.complete({
      systemPrompt: RECOMMENDER_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
      maxTokens: 2048,
      responseFormat: "json",
    });

    const parsed = parseJsonSafe<RecommenderResponse>(completion.text);
    if (parsed) {
      return validateRecommendationResult(parsed, input);
    }
  } catch {
    // Fall through to deterministic fallback
  }

  return buildDeterministicRecommendation(input);
}

// ---------------------------------------------------------------------------
// Deterministic fallback (no model required)
// ---------------------------------------------------------------------------

export function buildDeterministicRecommendation(
  input: WorkflowRecommendationInput,
): WorkflowRecommendationResult {
  const { userIntent, savedWorkflows, availableContracts } = input;
  const intentLower = userIntent.toLowerCase();
  const intentTokens = intentLower.split(/\s+/).filter((t) => t.length > 2);

  const scoredWorkflows = savedWorkflows
    .filter((w) => w.label !== "archived")
    .map((w) => ({
      workflow: w,
      score: scoreWorkflowMatch(w, intentTokens, intentLower),
    }))
    .sort((a, b) => b.score - a.score);

  const scoredContracts = availableContracts
    .map((c) => ({
      contract: c,
      score: scoreContractMatch(c, intentTokens, intentLower),
    }))
    .sort((a, b) => b.score - a.score);

  const bestWorkflow = scoredWorkflows[0];
  const bestContract = scoredContracts[0];
  const alternatives: WorkflowRecommendation[] = [];

  if (bestWorkflow && bestWorkflow.score >= 3) {
    const topRecommendation: WorkflowRecommendation = {
      strategy: "reuse-existing",
      workflowId: bestWorkflow.workflow.workflowId,
      workflowName: bestWorkflow.workflow.name,
      reason: `Saved workflow "${bestWorkflow.workflow.name}" matches your intent with ${bestWorkflow.workflow.nodeCount} node(s): ${bestWorkflow.workflow.nodeSlugs.join(", ")}.`,
      confidence: Math.min(0.9, bestWorkflow.score / 10),
    };

    if (bestContract && bestContract.score >= 2) {
      alternatives.push({
        strategy: "start-from-template",
        templateSlug: bestContract.contract.slug,
        reason: `Contract "${bestContract.contract.displayName}" could serve as a starting point for a new pipeline.`,
        confidence: Math.min(0.7, bestContract.score / 10),
      });
    }

    alternatives.push({
      strategy: "synthesize-new",
      reason: "Build a custom pipeline if the existing workflow doesn't fully match your needs.",
      confidence: 0.3,
    });

    return {
      topRecommendation,
      alternatives,
      explanation: `Found ${scoredWorkflows.filter((w) => w.score >= 2).length} potentially matching saved workflow(s). ` +
        `"${bestWorkflow.workflow.name}" is the closest match.`,
    };
  }

  if (bestContract && bestContract.score >= 2) {
    const topRecommendation: WorkflowRecommendation = {
      strategy: "start-from-template",
      templateSlug: bestContract.contract.slug,
      reason: `Contract "${bestContract.contract.displayName}" (${bestContract.contract.family}) is a good starting point for your task.`,
      confidence: Math.min(0.7, bestContract.score / 10),
    };

    if (scoredWorkflows.length > 0 && bestWorkflow && bestWorkflow.score >= 1) {
      alternatives.push({
        strategy: "reuse-existing",
        workflowId: bestWorkflow.workflow.workflowId,
        workflowName: bestWorkflow.workflow.name,
        reason: `Existing workflow "${bestWorkflow.workflow.name}" might partially match — review before reusing.`,
        confidence: Math.min(0.5, bestWorkflow.score / 10),
      });
    }

    alternatives.push({
      strategy: "synthesize-new",
      reason: "Compose a multi-node pipeline from available contracts.",
      confidence: 0.4,
    });

    return {
      topRecommendation,
      alternatives,
      explanation: `No strong saved workflow match found. "${bestContract.contract.displayName}" is the best contract starting point.`,
    };
  }

  return {
    topRecommendation: {
      strategy: "synthesize-new",
      reason: "No strong match found in saved workflows or available templates. A custom pipeline is recommended.",
      confidence: 0.5,
    },
    alternatives: savedWorkflows.length > 0 && bestWorkflow
      ? [{
          strategy: "reuse-existing",
          workflowId: bestWorkflow.workflow.workflowId,
          workflowName: bestWorkflow.workflow.name,
          reason: `"${bestWorkflow.workflow.name}" is the closest existing workflow, but may need significant modification.`,
          confidence: Math.min(0.3, (bestWorkflow.score || 0) / 10),
        }]
      : [],
    explanation: "No strong matches found. Recommending a custom pipeline synthesis.",
  };
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function scoreWorkflowMatch(
  workflow: WorkflowSummaryForIntelligence,
  intentTokens: string[],
  intentLower: string,
): number {
  let score = 0;
  const nameLower = workflow.name.toLowerCase();
  const descLower = (workflow.description ?? "").toLowerCase();
  const slugsLower = workflow.nodeSlugs.map((s) => s.toLowerCase()).join(" ");

  for (const token of intentTokens) {
    if (nameLower.includes(token)) score += 2;
    if (descLower.includes(token)) score += 1;
    if (slugsLower.includes(token)) score += 1.5;
  }

  if (workflow.label === "canonical") score += 2;
  if (workflow.label === "experimental") score += 0.5;
  if (workflow.label === "archived") score -= 3;

  if (workflow.versionCount >= 3) score += 1;

  return score;
}

function scoreContractMatch(
  contract: NodeContractSummary,
  intentTokens: string[],
  intentLower: string,
): number {
  let score = 0;
  const slugLower = contract.slug.toLowerCase();
  const nameLower = contract.displayName.toLowerCase();
  const familyLower = contract.family.toLowerCase();

  for (const token of intentTokens) {
    if (slugLower.includes(token)) score += 2;
    if (nameLower.includes(token)) score += 2;
    if (familyLower.includes(token)) score += 1;
  }

  for (const outputType of contract.outputTypes) {
    if (intentLower.includes(outputType.toLowerCase())) {
      score += 1.5;
    }
  }

  return score;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildRecommenderPrompt(input: WorkflowRecommendationInput): string {
  const { userIntent, savedWorkflows, availableContracts, executionMode } = input;

  const sections: string[] = [
    `User Intent: ${userIntent}`,
    `Execution Mode: ${executionMode ?? "hosted"}`,
    "",
    `Saved Workflows (${savedWorkflows.length}):`,
  ];

  for (const wf of savedWorkflows.slice(0, 30)) {
    sections.push(
      `  - [${wf.workflowId}] "${wf.name}" (${wf.label ?? "unlabeled"}) — ${wf.nodeCount} node(s): ${wf.nodeSlugs.join(", ")} — v${wf.versionCount}`,
    );
  }

  sections.push("", `Available Contracts (${availableContracts.length}):`);
  for (const contract of availableContracts.slice(0, 30)) {
    sections.push(
      `  - ${contract.slug} "${contract.displayName}" (${contract.family}) — outputs: [${contract.outputTypes.join(",")}]`,
    );
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface RecommenderResponse {
  topRecommendation?: Partial<WorkflowRecommendation>;
  alternatives?: Array<Partial<WorkflowRecommendation>>;
  explanation?: string;
}

function validateRecommendationResult(
  raw: RecommenderResponse,
  input: WorkflowRecommendationInput,
): WorkflowRecommendationResult {
  return {
    topRecommendation: validateRecommendation(raw.topRecommendation, input),
    alternatives: Array.isArray(raw.alternatives)
      ? raw.alternatives.map((alt) => validateRecommendation(alt, input))
      : [],
    explanation: typeof raw.explanation === "string" ? raw.explanation : "Recommendation generated.",
  };
}

function validateRecommendation(
  raw: Partial<WorkflowRecommendation> | undefined,
  input: WorkflowRecommendationInput,
): WorkflowRecommendation {
  const strategy = validateStrategy(raw?.strategy);
  return {
    strategy,
    workflowId: typeof raw?.workflowId === "string" ? raw.workflowId : undefined,
    workflowName: typeof raw?.workflowName === "string" ? raw.workflowName : undefined,
    templateSlug: typeof raw?.templateSlug === "string" ? raw.templateSlug : undefined,
    reason: typeof raw?.reason === "string" ? raw.reason : "No specific reason provided.",
    confidence: typeof raw?.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
  };
}

function validateStrategy(strategy: unknown): RecommendationStrategy {
  const valid: RecommendationStrategy[] = ["reuse-existing", "start-from-template", "synthesize-new"];
  if (typeof strategy === "string" && valid.includes(strategy as RecommendationStrategy)) {
    return strategy as RecommendationStrategy;
  }
  return "synthesize-new";
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
