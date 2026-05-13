/**
 * Validates tool intents from local-model sandbox output.
 * Does not execute tools — proposal + contract alignment only.
 */

import type { NodeContractSummary } from "../cms-node-contracts/types.js";
import type {
  LocalIntelligenceToolPolicy,
  LocalModelToolIntent,
  RejectedLocalModelToolIntent,
  ValidatedLocalModelToolIntent,
} from "./contract.js";

export interface ToolIntentValidationResult {
  accepted: ValidatedLocalModelToolIntent[];
  rejected: RejectedLocalModelToolIntent[];
  warnings: string[];
}

function contractForSlug(contracts: NodeContractSummary[], slug: string): NodeContractSummary | undefined {
  return contracts.find((c) => c.slug === slug);
}

function validateIntentInputAgainstContract(
  contract: NodeContractSummary,
  input: Record<string, unknown>,
): { ok: boolean; reasons: string[]; stripped: Record<string, unknown>; softNotes: string[] } {
  const reasons: string[] = [];
  const softNotes: string[] = [];
  const allowedKeys = new Set(contract.inputs.map((i) => i.key));
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowedKeys.has(key)) {
      softNotes.push(`unknown field "${key}" stripped`);
      continue;
    }
    stripped[key] = value;
  }
  for (const field of contract.inputs) {
    if (!field.required) continue;
    if (stripped[field.key] === undefined || stripped[field.key] === null || stripped[field.key] === "") {
      reasons.push(`missing required contract field "${field.key}"`);
    }
  }
  return { ok: reasons.length === 0, reasons, stripped, softNotes };
}

/**
 * Validates model-proposed tool calls against policy and known contracts.
 * Never dispatches execution.
 */
export function validateLocalModelToolIntents(
  intents: LocalModelToolIntent[],
  policy: LocalIntelligenceToolPolicy,
  availableContracts: NodeContractSummary[],
): ToolIntentValidationResult {
  const warnings: string[] = [];
  const accepted: ValidatedLocalModelToolIntent[] = [];
  const rejected: RejectedLocalModelToolIntent[] = [];

  const allowList =
    policy.allowedToolSlugs.length > 0
      ? policy.allowedToolSlugs
      : availableContracts.map((c) => c.slug);

  if (policy.mode === "disabled") {
    for (const intent of intents) {
      rejected.push({ intent, reasons: ["tool proposals disabled by policy"] });
    }
    if (intents.length > 0) warnings.push("tool policy mode is disabled; all intents rejected");
    return { accepted, rejected, warnings };
  }

  const minConfidence = typeof policy.minConfidence === "number" ? policy.minConfidence : undefined;

  for (const intent of intents) {
    const reasons: string[] = [];

    if (!Number.isFinite(intent.confidence)) {
      reasons.push("confidence is not a finite number");
    } else if (minConfidence !== undefined && intent.confidence < minConfidence) {
      reasons.push(`confidence ${intent.confidence} below minimum ${minConfidence}`);
    }

    const slug = String(intent.toolSlug || "").trim();
    if (!slug) {
      reasons.push("empty toolSlug");
    }

    if (slug && !allowList.includes(slug)) {
      reasons.push(`tool "${slug}" not in allowed slugs for this sandbox`);
    }

    const contract = slug ? contractForSlug(availableContracts, slug) : undefined;
    if (slug && !contract) {
      reasons.push(`no contract for slug "${slug}" in availableContracts`);
    }

    if (contract && reasons.length === 0) {
      const inputCheck = validateIntentInputAgainstContract(contract, intent.input);
      if (!inputCheck.ok) {
        reasons.push(...inputCheck.reasons);
      }
      if (inputCheck.softNotes.length > 0) {
        warnings.push(...inputCheck.softNotes.map((n) => `${slug}: ${n}`));
      }
    }

    if (reasons.length > 0) {
      rejected.push({ intent, reasons });
      continue;
    }

    const contractResolved = contractForSlug(availableContracts, slug)!;
    const inputCheck = validateIntentInputAgainstContract(contractResolved, intent.input);
    const validationNotes = [
      ...(inputCheck.softNotes.length > 0 ? inputCheck.softNotes : []),
      ...(inputCheck.reasons.length > 0 ? inputCheck.reasons : []),
    ];
    accepted.push({
      ...intent,
      toolSlug: slug,
      input: inputCheck.stripped,
      validationNotes: validationNotes.length > 0 ? validationNotes : undefined,
    });
  }

  return { accepted, rejected, warnings };
}
