import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { addObservation, addSummary, incrementRelevanceCount } from "../runtime/memory/store.js";
import { searchMemory, searchSummaries } from "../runtime/memory/search.js";

let testDir: string;
const uid = `search-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const p = (name: string) => `${uid}-${name}`;

beforeAll(() => {
  testDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "gh-mem-search-"));
  process.env.PAPERCLIP_HOME = testDir;
});

afterAll(() => {
  delete process.env.PAPERCLIP_HOME;
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe("memory search", () => {
  describe("searchMemory", () => {
    it("returns empty results for empty database", () => {
      const results = searchMemory({ text: "authentication", project: p("proj") });
      expect(results.results).toHaveLength(0);
      expect(results.totalMatched).toBe(0);
    });

    it("returns empty results for empty query tokens", () => {
      addObservation(p("proj"), { sessionId: "s1", type: "feature", title: "OAuth login" });
      const results = searchMemory({ text: "", project: p("proj") });
      expect(results.results).toHaveLength(0);
    });

    it("matches observations by title", () => {
      addObservation(p("proj"), { sessionId: "s1", type: "feature", title: "OAuth authentication flow" });
      addObservation(p("proj"), { sessionId: "s1", type: "bugfix", title: "Database connection pooling" });

      const results = searchMemory({ text: "authentication", project: p("proj") });
      expect(results.totalMatched).toBe(1);
      expect(results.results[0].observation.title).toBe("OAuth authentication flow");
      expect(results.results[0].matchedFields).toContain("title");
    });

    it("matches observations by facts", () => {
      addObservation(p("proj"), {
        sessionId: "s1",
        type: "discovery",
        title: "Config system",
        facts: ["uses zod for validation", "config stored at ~/.paperclip"],
      });
      addObservation(p("proj"), { sessionId: "s1", type: "feature", title: "Unrelated feature" });

      const results = searchMemory({ text: "zod validation", project: p("proj") });
      expect(results.totalMatched).toBe(1);
      expect(results.results[0].matchedFields).toContain("facts");
    });

    it("matches observations by narrative", () => {
      addObservation(p("proj"), {
        sessionId: "s1",
        type: "change",
        title: "Refactored auth",
        narrative: "Migrated from session tokens to JWT bearer authentication",
      });

      const results = searchMemory({ text: "JWT bearer", project: p("proj") });
      expect(results.totalMatched).toBe(1);
      expect(results.results[0].matchedFields).toContain("narrative");
    });

    it("ranks higher-scoring results first", () => {
      addObservation(p("proj"), {
        sessionId: "s1",
        type: "feature",
        title: "Authentication module",
        facts: ["uses OAuth2 authentication protocol"],
        narrative: "Built the authentication flow end to end",
      });
      addObservation(p("proj"), {
        sessionId: "s1",
        type: "bugfix",
        title: "Fixed typo in readme",
      });

      const results = searchMemory({ text: "authentication", project: p("proj") });
      expect(results.results[0].observation.title).toBe("Authentication module");
      expect(results.results[0].score).toBeGreaterThan(0);
    });

    it("filters by type", () => {
      addObservation(p("proj"), { sessionId: "s1", type: "feature", title: "Add auth" });
      addObservation(p("proj"), { sessionId: "s1", type: "bugfix", title: "Fix auth bug" });

      const results = searchMemory({ text: "auth", project: p("proj"), type: "bugfix" });
      expect(results.totalMatched).toBe(1);
      expect(results.results[0].observation.type).toBe("bugfix");
    });

    it("respects limit", () => {
      const keyword = `xylophone${uid}`;
      for (let i = 0; i < 20; i++) {
        addObservation(p("limit"), { sessionId: "s1", type: "feature", title: `Feature ${i} with ${keyword}` });
      }
      const results = searchMemory({ text: keyword, project: p("limit"), limit: 5 });
      expect(results.results).toHaveLength(5);
      expect(results.totalMatched).toBe(20);
    });

    it("boosts observations with higher relevance count", () => {
      const obs1 = addObservation(p("proj"), {
        sessionId: "s1",
        type: "feature",
        title: "Auth feature one",
      });
      addObservation(p("proj"), {
        sessionId: "s1",
        type: "feature",
        title: "Auth feature two",
      });

      // Boost obs1 relevance
      for (let i = 0; i < 5; i++) incrementRelevanceCount(p("proj"), obs1.id);

      const results = searchMemory({ text: "auth feature", project: p("proj") });
      expect(results.results[0].observation.id).toBe(obs1.id);
    });
  });

  describe("searchSummaries", () => {
    it("returns empty for no matches", () => {
      addSummary(p("proj"), { sessionId: "s1", request: "Build dashboard" });
      const results = searchSummaries(p("proj"), "authentication");
      expect(results).toHaveLength(0);
    });

    it("matches summaries by request text", () => {
      addSummary(p("proj"), { sessionId: "s1", request: "Add authentication module" });
      addSummary(p("proj"), { sessionId: "s2", request: "Fix database migration" });

      const results = searchSummaries(p("proj"), "authentication");
      expect(results).toHaveLength(1);
      expect(results[0].request).toBe("Add authentication module");
    });

    it("matches summaries by learned text", () => {
      addSummary(p("proj"), {
        sessionId: "s1",
        request: "Setup project",
        learned: "The codebase uses TypeScript with ESM modules",
      });

      const results = searchSummaries(p("proj"), "TypeScript ESM");
      expect(results).toHaveLength(1);
    });

    it("respects limit", () => {
      for (let i = 0; i < 20; i++) {
        addSummary(p("proj"), { sessionId: `s${i}`, request: `Auth task ${i}` });
      }
      const results = searchSummaries(p("proj"), "auth task", 3);
      expect(results).toHaveLength(3);
    });
  });
});
