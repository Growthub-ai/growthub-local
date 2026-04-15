import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
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
} from "../runtime/memory/store.js";

// Use a single temp dir for the entire file and unique project names per test
let testDir: string;

beforeAll(() => {
  testDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "gh-mem-store-"));
  process.env.PAPERCLIP_HOME = testDir;
});

afterAll(() => {
  delete process.env.PAPERCLIP_HOME;
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// Unique project name per test to avoid data collisions
const uid = `store-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const p = (name: string) => `${uid}-${name}`;

describe("memory store", () => {
  describe("loadMemoryDatabase", () => {
    it("returns empty database when no file exists", () => {
      const proj = p("empty");
      const db = loadMemoryDatabase(proj);
      expect(db.version).toBe(1);
      expect(db.project).toBe(proj);
      expect(db.observations).toEqual([]);
      expect(db.summaries).toEqual([]);
      expect(db.nextObservationId).toBe(1);
    });

    it("loads an existing database from disk", () => {
      const proj = p("saved");
      saveMemoryDatabase({
        version: 1,
        project: proj,
        observations: [{
          id: 1, createdAt: "2025-01-01T00:00:00.000Z", project: proj,
          sessionId: "s1", type: "discovery", title: "Test obs",
          facts: ["fact-1"], concepts: ["how-it-works"],
          filesRead: [], filesModified: [], relevanceCount: 0,
        }],
        summaries: [],
        nextObservationId: 2,
        nextSummaryId: 1,
      });
      const loaded = loadMemoryDatabase(proj);
      expect(loaded.observations).toHaveLength(1);
      expect(loaded.observations[0].title).toBe("Test obs");
      expect(loaded.nextObservationId).toBe(2);
    });
  });

  describe("addObservation", () => {
    it("creates observations with auto-incremented ids", () => {
      const proj = p("add-obs");
      const obs1 = addObservation(proj, { sessionId: "s1", type: "feature", title: "Added login", facts: ["OAuth2"], concepts: ["how-it-works"] });
      expect(obs1.id).toBe(1);
      const obs2 = addObservation(proj, { sessionId: "s1", type: "bugfix", title: "Fixed crash" });
      expect(obs2.id).toBe(2);
      const db = loadMemoryDatabase(proj);
      expect(db.observations).toHaveLength(2);
      expect(db.nextObservationId).toBe(3);
    });
  });

  describe("addSummary", () => {
    it("creates a session summary with auto-incremented id", () => {
      const proj = p("add-sum");
      const s1 = addSummary(proj, { sessionId: "s1", request: "Add auth", completed: "Added OAuth2", learned: "Token refresh" });
      expect(s1.id).toBe(1);
      expect(s1.request).toBe("Add auth");
      expect(loadMemoryDatabase(proj).summaries).toHaveLength(1);
    });
  });

  describe("getObservations", () => {
    it("returns observations in reverse chronological order", () => {
      const proj = p("chrono");
      addObservation(proj, { sessionId: "s1", type: "feature", title: "First" });
      addObservation(proj, { sessionId: "s1", type: "bugfix", title: "Second" });
      addObservation(proj, { sessionId: "s1", type: "discovery", title: "Third" });
      const results = getObservations(proj);
      expect(results).toHaveLength(3);
      expect(results[0].title).toBe("Third");
      expect(results[2].title).toBe("First");
    });

    it("filters by type", () => {
      const proj = p("type");
      addObservation(proj, { sessionId: "s1", type: "feature", title: "Feat" });
      addObservation(proj, { sessionId: "s1", type: "bugfix", title: "Fix" });
      expect(getObservations(proj, { type: "bugfix" })).toHaveLength(1);
    });

    it("respects limit", () => {
      const proj = p("limit");
      for (let i = 0; i < 10; i++) addObservation(proj, { sessionId: "s1", type: "feature", title: `Obs ${i}` });
      expect(getObservations(proj, { limit: 3 })).toHaveLength(3);
    });

    it("filters by sessionId", () => {
      const proj = p("sess");
      addObservation(proj, { sessionId: "s1", type: "feature", title: "Session 1" });
      addObservation(proj, { sessionId: "s2", type: "feature", title: "Session 2" });
      const results = getObservations(proj, { sessionId: "s1" });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Session 1");
    });
  });

  describe("getSummaries", () => {
    it("returns summaries in reverse chronological order", () => {
      const proj = p("sum-order");
      addSummary(proj, { sessionId: "s1", request: "First" });
      addSummary(proj, { sessionId: "s2", request: "Second" });
      const results = getSummaries(proj);
      expect(results).toHaveLength(2);
      expect(results[0].request).toBe("Second");
    });
  });

  describe("incrementRelevanceCount", () => {
    it("increments the relevance count of an observation", () => {
      const proj = p("relevance");
      addObservation(proj, { sessionId: "s1", type: "feature", title: "Test" });
      incrementRelevanceCount(proj, 1);
      incrementRelevanceCount(proj, 1);
      const obs = getObservations(proj);
      expect(obs[0].relevanceCount).toBe(2);
    });
  });

  describe("listMemoryProjects", () => {
    it("lists all projects with stored memories", () => {
      const a = p("alpha");
      const b = p("beta");
      addObservation(a, { sessionId: "s1", type: "feature", title: "A" });
      addObservation(b, { sessionId: "s1", type: "feature", title: "B" });
      const projects = listMemoryProjects();
      expect(projects).toContain(a);
      expect(projects).toContain(b);
    });
  });

  describe("getMemoryStats", () => {
    it("returns correct stats for a project", () => {
      const proj = p("stats");
      addObservation(proj, { sessionId: "s1", type: "feature", title: "One" });
      addObservation(proj, { sessionId: "s1", type: "bugfix", title: "Two" });
      addSummary(proj, { sessionId: "s1", request: "Summary" });
      const stats = getMemoryStats(proj);
      expect(stats.observationCount).toBe(2);
      expect(stats.summaryCount).toBe(1);
      expect(stats.oldestObservation).toBeDefined();
    });
  });

  describe("provider config", () => {
    it("returns default config when no file exists", () => {
      expect(readProviderConfig().provider).toBe("local");
    });

    it("persists and reads provider config", () => {
      writeProviderConfig({ provider: "claude", apiKey: "sk-test", modelId: "claude-sonnet-4-6" });
      const config = readProviderConfig();
      expect(config.provider).toBe("claude");
      expect(config.apiKey).toBe("sk-test");
    });
  });
});
