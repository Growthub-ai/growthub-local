/**
 * Memory Module — Store
 *
 * JSON-file-based persistence for memory observations and session summaries.
 * Each project gets its own database file under ~/.paperclip/memory/projects/.
 *
 * Storage layout:
 *   ~/.paperclip/memory/
 *     projects/
 *       <project-slug>.json   (MemoryDatabase per project)
 *     provider-config.json    (MemoryProviderConfig)
 *
 * Design decisions:
 *   - JSON files (not SQLite) to match existing thread persistence pattern
 *     and avoid adding a native dependency
 *   - One file per project keeps reads/writes scoped and fast
 *   - Monotonic IDs within each project database
 *   - File permissions 0o600 for API key protection in provider config
 */

import fs from "node:fs";
import path from "node:path";
import { resolveMemoryDir, resolveMemoryProjectsDir } from "../../config/home.js";
import type {
  MemoryDatabase,
  MemoryObservation,
  SessionSummary,
  ObservationType,
  ConceptCategory,
  MemoryProviderConfig,
} from "./contract.js";
import {
  EMPTY_MEMORY_DATABASE,
  DEFAULT_MEMORY_PROVIDER_CONFIG,
} from "./contract.js";

// ---------------------------------------------------------------------------
// Project slug normalization
// ---------------------------------------------------------------------------

function toProjectSlug(project: string): string {
  return project
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "default";
}

function resolveProjectPath(project: string): string {
  return path.resolve(resolveMemoryProjectsDir(), `${toProjectSlug(project)}.json`);
}

// ---------------------------------------------------------------------------
// Database I/O
// ---------------------------------------------------------------------------

export function loadMemoryDatabase(project: string): MemoryDatabase {
  const filePath = resolveProjectPath(project);
  if (!fs.existsSync(filePath)) {
    return { version: 1, project, observations: [], summaries: [], nextObservationId: 1, nextSummaryId: 1 };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<MemoryDatabase>;
    return {
      version: 1,
      project,
      observations: Array.isArray(raw.observations) ? raw.observations : [],
      summaries: Array.isArray(raw.summaries) ? raw.summaries : [],
      nextObservationId: typeof raw.nextObservationId === "number" ? raw.nextObservationId : 1,
      nextSummaryId: typeof raw.nextSummaryId === "number" ? raw.nextSummaryId : 1,
    };
  } catch {
    return { ...EMPTY_MEMORY_DATABASE, project };
  }
}

export function saveMemoryDatabase(db: MemoryDatabase): void {
  const dir = resolveMemoryProjectsDir();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = resolveProjectPath(db.project);
  fs.writeFileSync(filePath, `${JSON.stringify(db, null, 2)}\n`, "utf-8");
}

// ---------------------------------------------------------------------------
// Observation CRUD
// ---------------------------------------------------------------------------

export function addObservation(
  project: string,
  input: {
    sessionId: string;
    type: ObservationType;
    title: string;
    subtitle?: string;
    facts?: string[];
    narrative?: string;
    concepts?: ConceptCategory[];
    filesRead?: string[];
    filesModified?: string[];
  },
): MemoryObservation {
  const db = loadMemoryDatabase(project);
  const observation: MemoryObservation = {
    id: db.nextObservationId,
    createdAt: new Date().toISOString(),
    project,
    sessionId: input.sessionId,
    type: input.type,
    title: input.title,
    subtitle: input.subtitle,
    facts: input.facts ?? [],
    narrative: input.narrative,
    concepts: input.concepts ?? [],
    filesRead: input.filesRead ?? [],
    filesModified: input.filesModified ?? [],
    relevanceCount: 0,
  };
  db.observations.push(observation);
  db.nextObservationId += 1;
  saveMemoryDatabase(db);
  return observation;
}

export function addSummary(
  project: string,
  input: {
    sessionId: string;
    request?: string;
    investigated?: string;
    learned?: string;
    completed?: string;
    nextSteps?: string;
    notes?: string;
    discoveryTokens?: number;
  },
): SessionSummary {
  const db = loadMemoryDatabase(project);
  const summary: SessionSummary = {
    id: db.nextSummaryId,
    createdAt: new Date().toISOString(),
    project,
    sessionId: input.sessionId,
    request: input.request,
    investigated: input.investigated,
    learned: input.learned,
    completed: input.completed,
    nextSteps: input.nextSteps,
    notes: input.notes,
    discoveryTokens: input.discoveryTokens,
  };
  db.summaries.push(summary);
  db.nextSummaryId += 1;
  saveMemoryDatabase(db);
  return summary;
}

export function getObservations(
  project: string,
  options?: {
    limit?: number;
    sessionId?: string;
    type?: ObservationType;
    after?: string;
    before?: string;
  },
): MemoryObservation[] {
  const db = loadMemoryDatabase(project);
  let results = db.observations;

  if (options?.sessionId) {
    results = results.filter((o) => o.sessionId === options.sessionId);
  }
  if (options?.type) {
    results = results.filter((o) => o.type === options.type);
  }
  if (options?.after) {
    const afterMs = Date.parse(options.after);
    if (!Number.isNaN(afterMs)) {
      results = results.filter((o) => Date.parse(o.createdAt) >= afterMs);
    }
  }
  if (options?.before) {
    const beforeMs = Date.parse(options.before);
    if (!Number.isNaN(beforeMs)) {
      results = results.filter((o) => Date.parse(o.createdAt) <= beforeMs);
    }
  }

  // Most recent first
  results = [...results].reverse();

  if (options?.limit && options.limit > 0) {
    results = results.slice(0, options.limit);
  }
  return results;
}

export function getSummaries(
  project: string,
  options?: { limit?: number; sessionId?: string },
): SessionSummary[] {
  const db = loadMemoryDatabase(project);
  let results = db.summaries;

  if (options?.sessionId) {
    results = results.filter((s) => s.sessionId === options.sessionId);
  }

  results = [...results].reverse();

  if (options?.limit && options.limit > 0) {
    results = results.slice(0, options.limit);
  }
  return results;
}

export function incrementRelevanceCount(project: string, observationId: number): void {
  const db = loadMemoryDatabase(project);
  const observation = db.observations.find((o) => o.id === observationId);
  if (observation) {
    observation.relevanceCount += 1;
    saveMemoryDatabase(db);
  }
}

// ---------------------------------------------------------------------------
// Project listing
// ---------------------------------------------------------------------------

export function listMemoryProjects(): string[] {
  const dir = resolveMemoryProjectsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f: string) => f.endsWith(".json"))
    .map((f: string) => f.replace(/\.json$/, ""))
    .sort();
}

export function getMemoryStats(project: string): {
  observationCount: number;
  summaryCount: number;
  oldestObservation?: string;
  newestObservation?: string;
} {
  const db = loadMemoryDatabase(project);
  return {
    observationCount: db.observations.length,
    summaryCount: db.summaries.length,
    oldestObservation: db.observations[0]?.createdAt,
    newestObservation: db.observations[db.observations.length - 1]?.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Provider config persistence
// ---------------------------------------------------------------------------

function resolveProviderConfigPath(): string {
  return path.resolve(resolveMemoryDir(), "provider-config.json");
}

export function readProviderConfig(): MemoryProviderConfig {
  const filePath = resolveProviderConfigPath();
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_MEMORY_PROVIDER_CONFIG };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<MemoryProviderConfig>;
    return {
      provider: validateProvider(raw.provider),
      apiKey: typeof raw.apiKey === "string" ? raw.apiKey : undefined,
      modelId: typeof raw.modelId === "string" ? raw.modelId : undefined,
      endpoint: typeof raw.endpoint === "string" ? raw.endpoint : undefined,
    };
  } catch {
    return { ...DEFAULT_MEMORY_PROVIDER_CONFIG };
  }
}

export function writeProviderConfig(config: MemoryProviderConfig): void {
  const dir = resolveMemoryDir();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = resolveProviderConfigPath();
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

function validateProvider(value: unknown): MemoryProviderConfig["provider"] {
  if (
    value === "local"
    || value === "claude"
    || value === "openai"
    || value === "gemini"
    || value === "openrouter"
  ) {
    return value;
  }
  return "local";
}
