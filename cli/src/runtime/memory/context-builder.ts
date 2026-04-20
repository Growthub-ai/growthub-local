/**
 * Memory Module — Context Builder
 *
 * Generates a progressive-disclosure context block from stored memories,
 * suitable for injection into the local prompt chat system prompt.
 *
 * Progressive disclosure strategy (inspired by claude-mem):
 *   Layer 1: Session summaries (compact, ~50 tokens each)
 *   Layer 2: Recent observations (compact index, ~30 tokens each)
 *   Layer 3: Full-detail observations (expanded, ~150 tokens each)
 *
 * The builder respects a token budget and fills layers in priority order.
 * Token estimation uses a simple 4-chars-per-token heuristic.
 */

import { searchMemory } from "./search.js";
import type {
  MemoryObservation,
  SessionSummary,
  ContextInjectionConfig,
  InjectedContext,
} from "./contract.js";
import { DEFAULT_CONTEXT_INJECTION_CONFIG } from "./contract.js";
import { getObservations, getSummaries, incrementRelevanceCount } from "./store.js";

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderSummaryCompact(summary: SessionSummary): string {
  const parts: string[] = [];
  if (summary.request) parts.push(`Request: ${summary.request}`);
  if (summary.completed) parts.push(`Completed: ${summary.completed}`);
  if (summary.learned) parts.push(`Learned: ${summary.learned}`);
  if (summary.nextSteps) parts.push(`Next: ${summary.nextSteps}`);
  const date = summary.createdAt.split("T")[0];
  return `[${date}] ${parts.join(" | ")}`;
}

function renderObservationCompact(observation: MemoryObservation): string {
  const date = observation.createdAt.split("T")[0];
  const facts = observation.facts.length > 0 ? ` — ${observation.facts[0]}` : "";
  return `#${observation.id} [${date}] ${observation.type}: ${observation.title}${facts}`;
}

function renderObservationFull(observation: MemoryObservation): string {
  const lines: string[] = [];
  const date = observation.createdAt.split("T")[0];
  lines.push(`#${observation.id} [${date}] ${observation.type}: ${observation.title}`);
  if (observation.subtitle) lines.push(`  ${observation.subtitle}`);
  if (observation.narrative) lines.push(`  ${observation.narrative}`);
  if (observation.facts.length > 0) {
    for (const fact of observation.facts) {
      lines.push(`  • ${fact}`);
    }
  }
  if (observation.concepts.length > 0) {
    lines.push(`  Concepts: ${observation.concepts.join(", ")}`);
  }
  if (observation.filesModified.length > 0) {
    lines.push(`  Modified: ${observation.filesModified.join(", ")}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a context injection block from stored memories for a given project.
 * Respects the token budget via progressive disclosure.
 */
export function buildMemoryContext(
  project: string,
  configOverride?: Partial<ContextInjectionConfig>,
): InjectedContext {
  const config = { ...DEFAULT_CONTEXT_INJECTION_CONFIG, ...configOverride };
  const summaries = getSummaries(project, { limit: config.maxSummaries });
  const observations = getObservations(project, { limit: config.maxObservations });

  if (summaries.length === 0 && observations.length === 0) {
    return { text: "", observationCount: 0, summaryCount: 0, estimatedTokens: 0 };
  }

  const sections: string[] = [];
  let usedTokens = 0;
  let includedObservations = 0;
  let includedSummaries = 0;

  const header = "=== Memory Context (from previous sessions) ===";
  usedTokens += estimateTokens(header);
  sections.push(header);

  // Layer 1: Session summaries (highest priority, most compact)
  if (summaries.length > 0) {
    const summaryLines: string[] = ["", "--- Session History ---"];
    for (const summary of summaries) {
      const line = renderSummaryCompact(summary);
      const lineCost = estimateTokens(line) + 1;
      if (usedTokens + lineCost > config.tokenBudget) break;
      summaryLines.push(line);
      usedTokens += lineCost;
      includedSummaries += 1;
    }
    if (includedSummaries > 0) {
      sections.push(summaryLines.join("\n"));
    }
  }

  // Layer 2: Full-detail observations (most recent N)
  const fullDetailCount = Math.min(config.fullDetailCount, observations.length);
  if (fullDetailCount > 0 && usedTokens < config.tokenBudget) {
    const fullLines: string[] = ["", "--- Recent Observations (full) ---"];
    for (let i = 0; i < fullDetailCount; i += 1) {
      const block = renderObservationFull(observations[i]);
      const blockCost = estimateTokens(block) + 2;
      if (usedTokens + blockCost > config.tokenBudget) break;
      fullLines.push(block);
      usedTokens += blockCost;
      includedObservations += 1;
      incrementRelevanceCount(project, observations[i].id);
    }
    if (includedObservations > 0) {
      sections.push(fullLines.join("\n"));
    }
  }

  // Layer 3: Compact observation index (remaining budget)
  const compactStart = fullDetailCount;
  if (compactStart < observations.length && usedTokens < config.tokenBudget) {
    const compactLines: string[] = ["", "--- Earlier Observations (compact) ---"];
    let compactCount = 0;
    for (let i = compactStart; i < observations.length; i += 1) {
      const line = renderObservationCompact(observations[i]);
      const lineCost = estimateTokens(line) + 1;
      if (usedTokens + lineCost > config.tokenBudget) break;
      compactLines.push(line);
      usedTokens += lineCost;
      compactCount += 1;
      includedObservations += 1;
    }
    if (compactCount > 0) {
      sections.push(compactLines.join("\n"));
    }
  }

  sections.push("\n=== End Memory Context ===");
  const text = sections.join("\n");

  return {
    text,
    observationCount: includedObservations,
    summaryCount: includedSummaries,
    estimatedTokens: estimateTokens(text),
  };
}

/**
 * Build a relevance-targeted context block by searching memory first,
 * then rendering matching observations with progressive disclosure.
 */
export function buildSemanticContext(
  project: string,
  prompt: string,
  configOverride?: Partial<ContextInjectionConfig>,
): InjectedContext {
  // searchMemory imported at top of file

  const config = { ...DEFAULT_CONTEXT_INJECTION_CONFIG, ...configOverride };
  const searchResults = searchMemory({
    text: prompt,
    project,
    limit: config.maxObservations,
  });

  if (searchResults.results.length === 0) {
    return buildMemoryContext(project, configOverride);
  }

  const sections: string[] = [];
  let usedTokens = 0;
  let includedObservations = 0;

  const header = "=== Relevant Memory Context ===";
  usedTokens += estimateTokens(header);
  sections.push(header);

  // Full detail for top matches
  const fullDetailCount = Math.min(config.fullDetailCount, searchResults.results.length);
  if (fullDetailCount > 0) {
    const fullLines: string[] = ["", "--- Most Relevant ---"];
    for (let i = 0; i < fullDetailCount; i += 1) {
      const block = renderObservationFull(searchResults.results[i].observation);
      const blockCost = estimateTokens(block) + 2;
      if (usedTokens + blockCost > config.tokenBudget) break;
      fullLines.push(block);
      usedTokens += blockCost;
      includedObservations += 1;
      incrementRelevanceCount(project, searchResults.results[i].observation.id);
    }
    sections.push(fullLines.join("\n"));
  }

  // Compact index for remaining matches
  if (fullDetailCount < searchResults.results.length && usedTokens < config.tokenBudget) {
    const compactLines: string[] = ["", "--- Also Related ---"];
    for (let i = fullDetailCount; i < searchResults.results.length; i += 1) {
      const line = renderObservationCompact(searchResults.results[i].observation);
      const lineCost = estimateTokens(line) + 1;
      if (usedTokens + lineCost > config.tokenBudget) break;
      compactLines.push(line);
      usedTokens += lineCost;
      includedObservations += 1;
    }
    if (compactLines.length > 1) {
      sections.push(compactLines.join("\n"));
    }
  }

  sections.push("\n=== End Memory Context ===");
  const text = sections.join("\n");

  return {
    text,
    observationCount: includedObservations,
    summaryCount: 0,
    estimatedTokens: estimateTokens(text),
  };
}
