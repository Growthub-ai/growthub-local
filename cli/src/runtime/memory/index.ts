/**
 * Memory Module
 *
 * Persistent memory layer for the Growthub CLI, inspired by claude-mem's
 * observation/summary architecture. Provides cross-session memory capture,
 * search, progressive-disclosure context injection, multi-provider model
 * configuration, and optional sync to hosted Growthub accounts.
 */

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

export type {
  ObservationType,
  ConceptCategory,
  MemoryObservation,
  SessionSummary,
  MemoryDatabase,
  MemorySearchQuery,
  MemorySearchResult,
  MemorySearchResponse,
  ContextInjectionConfig,
  InjectedContext,
  MemorySyncPayload,
  MemorySyncResult,
  MemoryProviderType,
  MemoryProviderConfig,
} from "./contract.js";

export {
  EMPTY_MEMORY_DATABASE,
  DEFAULT_CONTEXT_INJECTION_CONFIG,
  DEFAULT_MEMORY_PROVIDER_CONFIG,
} from "./contract.js";

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export {
  loadMemoryDatabase,
  saveMemoryDatabase,
  addObservation,
  addSummary,
  getObservations,
  getSummaries,
  incrementRelevanceCount,
  listMemoryProjects,
  getMemoryStats,
  readProviderConfig,
  writeProviderConfig,
} from "./store.js";

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export {
  searchMemory,
  searchSummaries,
} from "./search.js";

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

export {
  buildMemoryContext,
  buildSemanticContext,
} from "./context-builder.js";

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export {
  canSync,
  syncMemoriesToHosted,
} from "./sync.js";
