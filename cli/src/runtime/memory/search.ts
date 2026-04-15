/**
 * Memory Module — Search
 *
 * In-memory full-text search over observations and summaries.
 * Uses term-frequency scoring with field-weight boosting to rank results.
 *
 * No external dependency — all search logic is pure TypeScript operating
 * over the JSON memory store. For v1 this is sufficient for the expected
 * dataset sizes (hundreds to low thousands of observations per project).
 *
 * Inspired by claude-mem's FTS5 virtual table approach, but implemented
 * as an in-process scorer to avoid adding SQLite as a native dependency.
 */

import type {
  MemoryObservation,
  MemorySearchQuery,
  MemorySearchResult,
  MemorySearchResponse,
  SessionSummary,
} from "./contract.js";
import { loadMemoryDatabase } from "./store.js";

// ---------------------------------------------------------------------------
// Field weights for scoring
// ---------------------------------------------------------------------------

const FIELD_WEIGHTS: Record<string, number> = {
  title: 5.0,
  subtitle: 3.0,
  facts: 2.0,
  narrative: 1.5,
  concepts: 2.5,
  type: 1.0,
};

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreObservation(
  observation: MemoryObservation,
  queryTokens: string[],
): { score: number; matchedFields: string[] } {
  let totalScore = 0;
  const matchedFields: string[] = [];

  function scoreField(fieldName: string, text: string): void {
    const fieldTokens = tokenize(text);
    const weight = FIELD_WEIGHTS[fieldName] ?? 1.0;
    let fieldHits = 0;

    for (const queryToken of queryTokens) {
      for (const fieldToken of fieldTokens) {
        if (fieldToken.includes(queryToken) || queryToken.includes(fieldToken)) {
          fieldHits += 1;
        }
      }
    }

    if (fieldHits > 0) {
      totalScore += fieldHits * weight;
      if (!matchedFields.includes(fieldName)) {
        matchedFields.push(fieldName);
      }
    }
  }

  scoreField("title", observation.title);
  if (observation.subtitle) scoreField("subtitle", observation.subtitle);
  for (const fact of observation.facts) scoreField("facts", fact);
  if (observation.narrative) scoreField("narrative", observation.narrative);
  for (const concept of observation.concepts) scoreField("concepts", concept);
  scoreField("type", observation.type);

  // Boost recently surfaced observations slightly
  if (observation.relevanceCount > 0) {
    totalScore *= 1 + Math.min(observation.relevanceCount, 10) * 0.02;
  }

  return { score: totalScore, matchedFields };
}

// ---------------------------------------------------------------------------
// Public search API
// ---------------------------------------------------------------------------

export function searchMemory(query: MemorySearchQuery): MemorySearchResponse {
  const db = loadMemoryDatabase(query.project ?? "default");
  const queryTokens = tokenize(query.text);

  if (queryTokens.length === 0) {
    return { results: [], totalMatched: 0, query };
  }

  let candidates = db.observations;

  // Apply filters
  if (query.type) {
    candidates = candidates.filter((o) => o.type === query.type);
  }
  if (query.after) {
    const afterMs = Date.parse(query.after);
    if (!Number.isNaN(afterMs)) {
      candidates = candidates.filter((o) => Date.parse(o.createdAt) >= afterMs);
    }
  }
  if (query.before) {
    const beforeMs = Date.parse(query.before);
    if (!Number.isNaN(beforeMs)) {
      candidates = candidates.filter((o) => Date.parse(o.createdAt) <= beforeMs);
    }
  }

  // Score and rank
  const scored: MemorySearchResult[] = [];
  for (const observation of candidates) {
    const { score, matchedFields } = scoreObservation(observation, queryTokens);
    if (score > 0) {
      scored.push({ observation, score, matchedFields });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const limit = query.limit ?? 20;
  const results = scored.slice(0, limit);

  return {
    results,
    totalMatched: scored.length,
    query,
  };
}

/**
 * Search session summaries by free text.
 */
export function searchSummaries(
  project: string,
  text: string,
  limit = 10,
): SessionSummary[] {
  const db = loadMemoryDatabase(project);
  const queryTokens = tokenize(text);
  if (queryTokens.length === 0) return [];

  const scored: Array<{ summary: SessionSummary; score: number }> = [];

  for (const summary of db.summaries) {
    let score = 0;
    const fields = [
      summary.request,
      summary.investigated,
      summary.learned,
      summary.completed,
      summary.nextSteps,
      summary.notes,
    ].filter(Boolean) as string[];

    for (const field of fields) {
      const fieldTokens = tokenize(field);
      for (const queryToken of queryTokens) {
        for (const fieldToken of fieldTokens) {
          if (fieldToken.includes(queryToken) || queryToken.includes(fieldToken)) {
            score += 1;
          }
        }
      }
    }

    if (score > 0) {
      scored.push({ summary, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.summary);
}
