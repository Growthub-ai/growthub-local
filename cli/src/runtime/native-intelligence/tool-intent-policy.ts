/**
 * Governed tool-intent validation for local-intelligence sandbox runs.
 * Validates proposals only — never executes tools or reaches provider SDKs.
 */

import type {
  LocalIntelligenceToolPolicy,
  LocalModelToolIntent,
  NodeContractSummary,
  RejectedLocalModelToolIntent,
  ValidatedLocalModelToolIntent,
} from "./contract.js";

export interface ValidateLocalModelToolIntentsResult {
  validated: ValidatedLocalModelToolIntent[];
  rejected: RejectedLocalModelToolIntent[];
  warnings: string[];
}

function contractForSlug(
  slug: string,
  contracts: NodeContractSummary[],
): NodeContractSummary | undefined {
  return contracts.find((c) => c.slug === slug);
}

function validateIntentInputAgainstContract(
  intent: LocalModelToolIntent,
  contract: NodeContractSummary,
): string[] {
  const warnings: string[] = [];
  const allowedKeys = new Set(contract.inputs.map((i) => i.key));
  for (const key of Object.keys(intent.input)) {
    if (!allowedKeys.has(key)) {
      warnings.push(`stripped unknown field "${key}" on tool "${intent.toolSlug}"`);
    }
  }
  for (const field of contract.inputs) {
    if (!field.required) continue;
    const v = intent.input[field.key];
    if (v === undefined || v === null || v === "") {
      warnings.push(`missing required contract field "${field.key}" for tool "${intent.toolSlug}"`);
    }
  }
  return warnings;
}

/**
 * Validates model-proposed tool calls against allowlists and contract shapes.
 * Does not execute tools.
 */
export function validateLocalModelToolIntents(
  intents: LocalModelToolIntent[],
  policy: LocalIntelligenceToolPolicy,
  availableContracts: NodeContractSummary[],
): ValidateLocalModelToolIntentsResult {
  const validated: ValidatedLocalModelToolIntent[] = [];
  const rejected: RejectedLocalModelToolIntent[] = [];
  const warnings: string[] = [];

  if (policy.mode === "disabled") {
    for (const intent of intents) {
      rejected.push({
        intent,
        reasons: ["tool policy mode is disabled"],
      });
    }
    return { validated, rejected, warnings };
  }

  const allowed = new Set(policy.allowedToolSlugs.map((s) => s.trim()).filter(Boolean));
  const minConfidence = typeof policy.minConfidence === "number" ? policy.minConfidence : undefined;

  for (const intent of intents) {
    const reasons: string[] = [];
    const slug = String(intent.toolSlug || "").trim();
    if (!slug) {
      reasons.push("missing toolSlug");
      rejected.push({ intent, reasons });
      continue;
    }

    if (!allowed.has(slug)) {
      reasons.push(`toolSlug "${slug}" is not in allowedToolSlugs`);
    }

    const contract = contractForSlug(slug, availableContracts);
    if (!contract) {
      reasons.push(`no contract summary for slug "${slug}"`);
    }

    if (minConfidence !== undefined && !(typeof intent.confidence === "number" && intent.confidence >= minConfidence)) {
      reasons.push(`confidence ${intent.confidence} below minimum ${minConfidence}`);
    }

    if (reasons.length) {
      rejected.push({ intent: { ...intent, toolSlug: slug }, reasons });
      continue;
    }

    const contractNonNull = contract!;
    const fieldWarnings = validateIntentInputAgainstContract({ ...intent, toolSlug: slug }, contractNonNull);
    warnings.push(...fieldWarnings);

    const strippedInput: Record<string, unknown> = {};
    const allowedKeys = new Set(contractNonNull.inputs.map((i) => i.key));
    for (const [k, v] of Object.entries(intent.input)) {
      if (allowedKeys.has(k)) strippedInput[k] = v;
    }

    validated.push({
      ...intent,
      toolSlug: slug,
      input: strippedInput,
      warnings: fieldWarnings,
    });
  }

  return { validated, rejected, warnings };
}
