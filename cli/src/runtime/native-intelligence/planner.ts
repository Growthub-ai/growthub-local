/**
 * Native Intelligence — Planner (Phase 4)
 *
 * Generates or refines workflow graphs from intent + contract truth.
 *
 * V1 scope:
 *   - Recommend a node sequence from available contracts
 *   - Map node slugs to fulfill user intent
 *   - Suggest bindings to collect
 *   - Optionally choose an existing workflow instead of creating a new one
 *
 * Important rule:
 *   Planner does NOT execute.
 *   Planner outputs graph suggestions only.
 *   Final compile/save/execute still goes through the existing contract pipeline.
 *
 * Falls back to deterministic single-node planning when model is unavailable.
 */

import type {
  NativeIntelligenceBackend,
  WorkflowPlanningInput,
  WorkflowPlanningResult,
  ProposedPipelineNode,
  PlanningConstraints,
  NodeContractSummary,
  WorkflowSummaryForIntelligence,
} from "./contract.js";

// ---------------------------------------------------------------------------
// System prompt for workflow planning
// ---------------------------------------------------------------------------

const PLANNER_SYSTEM_PROMPT = `You are a workflow graph planner for the Growthub platform.
Your job is to propose a pipeline graph (sequence of CMS nodes) that fulfills the user's intent.

You receive:
- The user's intent/goal
- Available CMS node contracts (with slugs, input schemas, output types, families)
- Optionally, existing saved workflows that might already fulfill the need

Rules:
1. Only use node slugs that exist in the available contracts list
2. Propose realistic bindings — use empty strings for values the user must provide
3. Chain nodes by specifying upstream dependencies when outputs feed into downstream inputs
4. Respect constraints (max nodes, required output types, preferred families)
5. If an existing workflow already matches well, recommend it instead of planning a new graph
6. Keep graphs minimal — prefer fewer nodes that accomplish the goal
7. NEVER propose nodes that don't exist in the available contracts

Respond in JSON:
{
  "proposedNodes": [
    {
      "slug": "string — must be from available contracts",
      "displayName": "string",
      "reason": "string — why this node is needed",
      "suggestedBindings": { "key": "value or empty string" },
      "upstreamNodeSlugs": ["string — slugs of upstream nodes, if any"]
    }
  ],
  "explanation": "string — overall plan rationale",
  "alternativeExistingWorkflowId": "string | null",
  "alternativeExistingWorkflowReason": "string | null",
  "confidence": 0.0-1.0,
  "warnings": ["string"]
}`;

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

export async function planWorkflow(
  input: WorkflowPlanningInput,
  backend: NativeIntelligenceBackend,
): Promise<WorkflowPlanningResult> {
  const userPrompt = buildPlannerPrompt(input);

  try {
    const completion = await backend.complete({
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.4,
      maxTokens: 3072,
      responseFormat: "json",
    });

    const parsed = parseJsonSafe<PlannerResponse>(completion.text);
    if (parsed) {
      return validatePlanningResult(parsed, input);
    }
  } catch {
    // Fall through to deterministic fallback
  }

  return buildDeterministicPlan(input);
}

// ---------------------------------------------------------------------------
// Deterministic fallback (no model required)
// ---------------------------------------------------------------------------

export function buildDeterministicPlan(
  input: WorkflowPlanningInput,
): WorkflowPlanningResult {
  const { userIntent, availableContracts, existingWorkflows, constraints } = input;
  const intentLower = userIntent.toLowerCase();
  const intentTokens = intentLower.split(/\s+/).filter((t) => t.length > 2);

  const existingMatch = findBestExistingWorkflow(existingWorkflows ?? [], intentTokens, intentLower);

  const scoredContracts = availableContracts
    .map((c) => ({ contract: c, score: scoreContract(c, intentTokens, intentLower, constraints) }))
    .sort((a, b) => b.score - a.score);

  const maxNodes = constraints?.maxNodes ?? 5;
  const requiredOutputs = new Set(constraints?.requiredOutputTypes ?? []);
  const selectedNodes: ProposedPipelineNode[] = [];
  const usedSlugs = new Set<string>();
  const warnings: string[] = [];

  for (const { contract, score } of scoredContracts) {
    if (selectedNodes.length >= maxNodes) break;
    if (score <= 0) break;
    if (usedSlugs.has(contract.slug)) continue;
    if (constraints?.avoidSlugs?.includes(contract.slug)) continue;

    const suggestedBindings: Record<string, unknown> = {};
    for (const field of contract.inputs) {
      suggestedBindings[field.key] = field.defaultValue ?? "";
    }

    const upstreamSlugs: string[] = [];
    if (selectedNodes.length > 0) {
      const lastNode = selectedNodes[selectedNodes.length - 1];
      const lastContract = availableContracts.find((c) => c.slug === lastNode.slug);
      if (lastContract && hasOutputInputOverlap(lastContract, contract)) {
        upstreamSlugs.push(lastNode.slug);
      }
    }

    selectedNodes.push({
      slug: contract.slug,
      displayName: contract.displayName,
      reason: `Matches intent tokens and produces ${contract.outputTypes.join(", ") || "general"} output.`,
      suggestedBindings,
      upstreamNodeSlugs: upstreamSlugs.length > 0 ? upstreamSlugs : undefined,
    });

    usedSlugs.add(contract.slug);
    for (const outType of contract.outputTypes) {
      requiredOutputs.delete(outType);
    }
  }

  if (requiredOutputs.size > 0) {
    warnings.push(`Could not find contracts producing required output types: ${[...requiredOutputs].join(", ")}.`);
  }

  if (selectedNodes.length === 0) {
    warnings.push("No contracts matched the user intent. Consider refining the task description.");
    return {
      proposedNodes: [],
      explanation: "No matching contracts found for the given intent.",
      confidence: 0.1,
      warnings,
    };
  }

  return {
    proposedNodes: selectedNodes,
    explanation: `Proposed ${selectedNodes.length}-node pipeline using ${selectedNodes.map((n) => n.slug).join(" -> ")}.`,
    alternativeExistingWorkflowId: existingMatch?.workflowId,
    alternativeExistingWorkflowReason: existingMatch
      ? `Existing workflow "${existingMatch.name}" may already fulfill this intent.`
      : undefined,
    confidence: Math.min(0.7, selectedNodes.length > 0 ? scoredContracts[0].score / 10 : 0.1),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function scoreContract(
  contract: NodeContractSummary,
  intentTokens: string[],
  intentLower: string,
  constraints?: PlanningConstraints,
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

  if (constraints?.requiredOutputTypes) {
    for (const requiredType of constraints.requiredOutputTypes) {
      if (contract.outputTypes.includes(requiredType)) score += 3;
    }
  }

  if (constraints?.preferredFamilies) {
    if (constraints.preferredFamilies.includes(contract.family)) score += 2;
  }

  for (const outType of contract.outputTypes) {
    if (intentLower.includes(outType.toLowerCase())) score += 1.5;
  }

  return score;
}

function findBestExistingWorkflow(
  workflows: WorkflowSummaryForIntelligence[],
  intentTokens: string[],
  intentLower: string,
): WorkflowSummaryForIntelligence | null {
  let best: WorkflowSummaryForIntelligence | null = null;
  let bestScore = 0;

  for (const wf of workflows) {
    if (wf.label === "archived") continue;
    let score = 0;
    const nameLower = wf.name.toLowerCase();
    const slugsLower = wf.nodeSlugs.join(" ").toLowerCase();

    for (const token of intentTokens) {
      if (nameLower.includes(token)) score += 2;
      if (slugsLower.includes(token)) score += 1.5;
    }

    if (wf.label === "canonical") score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = wf;
    }
  }

  return bestScore >= 3 ? best : null;
}

function hasOutputInputOverlap(
  upstream: NodeContractSummary,
  downstream: NodeContractSummary,
): boolean {
  const outputTypes: Set<string> = new Set(upstream.outputTypes.map((t: string) => t.toLowerCase()));
  for (const input of downstream.inputs) {
    const keyLower = input.key.toLowerCase();
    for (const outType of outputTypes) {
      if (keyLower.includes(outType) || outType.includes(keyLower)) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPlannerPrompt(input: WorkflowPlanningInput): string {
  const { userIntent, availableContracts, existingWorkflows, executionMode, constraints } = input;

  const sections: string[] = [
    `User Intent: ${userIntent}`,
    `Execution Mode: ${executionMode ?? "hosted"}`,
  ];

  if (constraints) {
    sections.push("", "Constraints:");
    if (constraints.maxNodes) sections.push(`  Max Nodes: ${constraints.maxNodes}`);
    if (constraints.requiredOutputTypes?.length) {
      sections.push(`  Required Output Types: ${constraints.requiredOutputTypes.join(", ")}`);
    }
    if (constraints.preferredFamilies?.length) {
      sections.push(`  Preferred Families: ${constraints.preferredFamilies.join(", ")}`);
    }
    if (constraints.avoidSlugs?.length) {
      sections.push(`  Avoid Slugs: ${constraints.avoidSlugs.join(", ")}`);
    }
  }

  sections.push("", `Available Contracts (${availableContracts.length}):`);
  for (const contract of availableContracts.slice(0, 40)) {
    const inputs = contract.inputs
      .map((i) => `${i.key}:${i.type}${i.required ? "*" : ""}`)
      .join(", ");
    sections.push(
      `  - ${contract.slug} "${contract.displayName}" (${contract.family})`
      + ` — inputs=[${inputs}], outputs=[${contract.outputTypes.join(",")}]`
      + `, strategy=${contract.executionStrategy}`,
    );
  }

  if (existingWorkflows && existingWorkflows.length > 0) {
    sections.push("", `Existing Workflows (${existingWorkflows.length}):`);
    for (const wf of existingWorkflows.slice(0, 20)) {
      sections.push(
        `  - [${wf.workflowId}] "${wf.name}" (${wf.label ?? "unlabeled"}) — nodes: ${wf.nodeSlugs.join(", ")} — v${wf.versionCount}`,
      );
    }
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface PlannerResponse {
  proposedNodes?: Array<Partial<ProposedPipelineNode>>;
  explanation?: string;
  alternativeExistingWorkflowId?: string;
  alternativeExistingWorkflowReason?: string;
  confidence?: number;
  warnings?: string[];
}

function validatePlanningResult(
  raw: PlannerResponse,
  input: WorkflowPlanningInput,
): WorkflowPlanningResult {
  const availableSlugs = new Set(input.availableContracts.map((c) => c.slug));
  const proposedNodes: ProposedPipelineNode[] = [];
  const warnings: string[] = Array.isArray(raw.warnings) ? [...raw.warnings] : [];

  if (Array.isArray(raw.proposedNodes)) {
    for (const node of raw.proposedNodes) {
      if (typeof node.slug !== "string") continue;
      if (!availableSlugs.has(node.slug)) {
        warnings.push(`Proposed node slug "${node.slug}" is not in the available contracts — skipped.`);
        continue;
      }

      proposedNodes.push({
        slug: node.slug,
        displayName: typeof node.displayName === "string" ? node.displayName : node.slug,
        reason: typeof node.reason === "string" ? node.reason : "Selected by planner.",
        suggestedBindings: node.suggestedBindings && typeof node.suggestedBindings === "object"
          ? node.suggestedBindings
          : {},
        upstreamNodeSlugs: Array.isArray(node.upstreamNodeSlugs) ? node.upstreamNodeSlugs : undefined,
      });
    }
  }

  return {
    proposedNodes,
    explanation: typeof raw.explanation === "string" ? raw.explanation : "Plan generated.",
    alternativeExistingWorkflowId: typeof raw.alternativeExistingWorkflowId === "string"
      ? raw.alternativeExistingWorkflowId
      : undefined,
    alternativeExistingWorkflowReason: typeof raw.alternativeExistingWorkflowReason === "string"
      ? raw.alternativeExistingWorkflowReason
      : undefined,
    confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
    warnings,
  };
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
