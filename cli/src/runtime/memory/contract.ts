/**
 * Memory Module — Contract Types
 *
 * Stable types that define the memory layer's data model, inspired by
 * claude-mem's observation/summary architecture but adapted for the
 * Growthub runtime. Observations capture what happened during a session;
 * summaries distill sessions into structured takeaways.
 *
 * Persistence: JSON files under ~/.paperclip/memory/
 * Search: in-memory FTS over observation/summary text fields
 * Sync: optional push to hosted Growthub account via auth bridge
 *
 * Guardrails:
 *   - Memory layer is read/write for its own store only
 *   - Memory layer does not execute tools or modify runtime state
 *   - Memory layer complements (does not replace) native-intelligence
 *   - Hosted sync is best-effort; memory works fully offline
 */

// ---------------------------------------------------------------------------
// Observation types (what happened)
// ---------------------------------------------------------------------------

/**
 * Observation type taxonomy — classifies what kind of work was captured.
 * Mirrors claude-mem's type field for interop potential.
 */
export type ObservationType =
  | "bugfix"
  | "feature"
  | "refactor"
  | "change"
  | "discovery"
  | "decision"
  | "conversation";

/**
 * Concept categories — semantic tags for how knowledge relates.
 */
export type ConceptCategory =
  | "how-it-works"
  | "why-it-exists"
  | "what-changed"
  | "problem-solution"
  | "gotcha"
  | "pattern"
  | "trade-off";

/**
 * A single observation captured from a CLI session interaction.
 */
export interface MemoryObservation {
  /** Unique observation id (monotonic within project). */
  id: number;
  /** ISO timestamp when the observation was captured. */
  createdAt: string;
  /** Project identifier (cwd basename or explicit project label). */
  project: string;
  /** Session id this observation belongs to. */
  sessionId: string;
  /** Classification of the work. */
  type: ObservationType;
  /** Short headline. */
  title: string;
  /** Optional subtitle / context line. */
  subtitle?: string;
  /** Atomic facts extracted from the interaction. */
  facts: string[];
  /** Narrative description of what happened and why. */
  narrative?: string;
  /** Semantic concept tags. */
  concepts: ConceptCategory[];
  /** Files that were read during this interaction. */
  filesRead: string[];
  /** Files that were modified during this interaction. */
  filesModified: string[];
  /** How many times this observation was surfaced in context injection. */
  relevanceCount: number;
}

// ---------------------------------------------------------------------------
// Session summary types (distilled takeaways)
// ---------------------------------------------------------------------------

/**
 * A structured summary of an entire session's work.
 */
export interface SessionSummary {
  /** Unique summary id. */
  id: number;
  /** ISO timestamp when the summary was generated. */
  createdAt: string;
  /** Project identifier. */
  project: string;
  /** Session id this summary covers. */
  sessionId: string;
  /** What the user originally requested. */
  request?: string;
  /** What was investigated / explored. */
  investigated?: string;
  /** Key things learned during the session. */
  learned?: string;
  /** What was actually completed. */
  completed?: string;
  /** Suggested next steps. */
  nextSteps?: string;
  /** Freeform notes. */
  notes?: string;
  /** Approximate token cost of generating this summary. */
  discoveryTokens?: number;
}

// ---------------------------------------------------------------------------
// Memory store types
// ---------------------------------------------------------------------------

/**
 * A project-scoped memory database persisted as JSON.
 */
export interface MemoryDatabase {
  version: 1;
  project: string;
  observations: MemoryObservation[];
  summaries: SessionSummary[];
  nextObservationId: number;
  nextSummaryId: number;
}

export const EMPTY_MEMORY_DATABASE: Readonly<Omit<MemoryDatabase, "project">> = {
  version: 1,
  observations: [],
  summaries: [],
  nextObservationId: 1,
  nextSummaryId: 1,
};

// ---------------------------------------------------------------------------
// Search types
// ---------------------------------------------------------------------------

export interface MemorySearchQuery {
  /** Free-text search terms. */
  text: string;
  /** Filter by observation type. */
  type?: ObservationType;
  /** Filter by project. */
  project?: string;
  /** Maximum results to return. */
  limit?: number;
  /** Filter observations created after this ISO date. */
  after?: string;
  /** Filter observations created before this ISO date. */
  before?: string;
}

export interface MemorySearchResult {
  observation: MemoryObservation;
  /** Relevance score (higher = better match). */
  score: number;
  /** Which fields matched the query. */
  matchedFields: string[];
}

export interface MemorySearchResponse {
  results: MemorySearchResult[];
  totalMatched: number;
  query: MemorySearchQuery;
}

// ---------------------------------------------------------------------------
// Context injection types
// ---------------------------------------------------------------------------

export interface ContextInjectionConfig {
  /** Maximum number of observations to include. */
  maxObservations: number;
  /** Maximum number of full-detail observations (rest are compact). */
  fullDetailCount: number;
  /** Maximum number of session summaries to include. */
  maxSummaries: number;
  /** Approximate token budget for injected context. */
  tokenBudget: number;
}

export const DEFAULT_CONTEXT_INJECTION_CONFIG: ContextInjectionConfig = {
  maxObservations: 50,
  fullDetailCount: 5,
  maxSummaries: 10,
  tokenBudget: 4096,
};

export interface InjectedContext {
  /** Rendered context string ready for injection into a prompt. */
  text: string;
  /** Number of observations included. */
  observationCount: number;
  /** Number of summaries included. */
  summaryCount: number;
  /** Approximate tokens used. */
  estimatedTokens: number;
}

// ---------------------------------------------------------------------------
// Sync types
// ---------------------------------------------------------------------------

export interface MemorySyncPayload {
  project: string;
  observations: MemoryObservation[];
  summaries: SessionSummary[];
  syncedAt: string;
}

export interface MemorySyncResult {
  success: boolean;
  syncedObservations: number;
  syncedSummaries: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Memory provider config (multi-provider model selection)
// ---------------------------------------------------------------------------

export type MemoryProviderType = "local" | "claude" | "openai" | "gemini" | "openrouter";

export interface MemoryProviderConfig {
  /** Which provider to use for memory summarization. */
  provider: MemoryProviderType;
  /** API key for the selected provider (not needed for "local"). */
  apiKey?: string;
  /** Model identifier for the selected provider. */
  modelId?: string;
  /** Provider-specific endpoint override. */
  endpoint?: string;
}

export const DEFAULT_MEMORY_PROVIDER_CONFIG: MemoryProviderConfig = {
  provider: "local",
};
