import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { addObservation, addSummary } from "../runtime/memory/store.js";
import { buildMemoryContext, buildSemanticContext } from "../runtime/memory/context-builder.js";

let testDir: string;
const uid = `ctx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const p = (name: string) => `${uid}-${name}`;

beforeAll(() => {
  testDir = fs.mkdtempSync(path.resolve(os.tmpdir(), "gh-mem-ctx-"));
  process.env.PAPERCLIP_HOME = testDir;
});

afterAll(() => {
  delete process.env.PAPERCLIP_HOME;
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe("memory context builder", () => {
  describe("buildMemoryContext", () => {
    it("returns empty context when no memories exist", () => {
      const ctx = buildMemoryContext(p("empty"));
      expect(ctx.text).toBe("");
      expect(ctx.observationCount).toBe(0);
      expect(ctx.summaryCount).toBe(0);
      expect(ctx.estimatedTokens).toBe(0);
    });

    it("includes summaries in context", () => {
      addSummary(p("proj"), {
        sessionId: "s1",
        request: "Add authentication",
        completed: "Implemented OAuth2 flow",
        learned: "Token refresh requires special handling",
      });

      const ctx = buildMemoryContext(p("proj"));
      expect(ctx.text).toContain("Memory Context");
      expect(ctx.text).toContain("Session History");
      expect(ctx.text).toContain("Add authentication");
      expect(ctx.text).toContain("Implemented OAuth2 flow");
      expect(ctx.summaryCount).toBe(1);
    });

    it("includes observations in context", () => {
      addObservation(p("proj"), {
        sessionId: "s1",
        type: "feature",
        title: "Added OAuth2 login",
        narrative: "Built the complete authentication flow",
        facts: ["Uses refresh tokens", "Tokens stored in httpOnly cookies"],
        concepts: ["how-it-works"],
        filesModified: ["src/auth.ts"],
      });

      const ctx = buildMemoryContext(p("proj"));
      expect(ctx.text).toContain("Added OAuth2 login");
      expect(ctx.text).toContain("Uses refresh tokens");
      expect(ctx.observationCount).toBeGreaterThanOrEqual(1);
    });

    it("respects token budget", () => {
      // Add many observations to exceed budget
      for (let i = 0; i < 100; i++) {
        addObservation(p("proj"), {
          sessionId: "s1",
          type: "feature",
          title: `Feature number ${i} with a long description that takes up tokens`,
          narrative: `This is a detailed narrative about feature ${i} that explains what was done and why it matters for the project`,
          facts: [`Fact A for feature ${i}`, `Fact B for feature ${i}`],
          concepts: ["how-it-works"],
        });
      }

      const ctx = buildMemoryContext(p("proj"), { tokenBudget: 512 });
      expect(ctx.estimatedTokens).toBeLessThanOrEqual(600); // Allow some headroom
      expect(ctx.observationCount).toBeLessThan(100);
    });

    it("uses progressive disclosure — full detail for recent, compact for older", () => {
      for (let i = 0; i < 10; i++) {
        addObservation(p("proj"), {
          sessionId: "s1",
          type: "feature",
          title: `Feature ${i}`,
          narrative: `Detailed narrative for feature ${i}`,
          facts: [`Core fact for ${i}`],
          concepts: ["how-it-works"],
        });
      }

      const ctx = buildMemoryContext(p("proj"), {
        fullDetailCount: 2,
        maxObservations: 10,
        tokenBudget: 8192,
      });

      // Should contain full detail markers
      expect(ctx.text).toContain("Recent Observations (full)");
      // Should contain compact markers if there are enough observations
      if (ctx.observationCount > 2) {
        expect(ctx.text).toContain("Earlier Observations (compact)");
      }
    });
  });

  describe("buildSemanticContext", () => {
    it("falls back to buildMemoryContext when no search results match", () => {
      addSummary(p("proj"), {
        sessionId: "s1",
        request: "Build dashboard",
        completed: "Added charts",
      });

      const ctx = buildSemanticContext(p("proj"), "completely unrelated xyz query");
      // Falls back to chronological context
      expect(ctx.text).toContain("Memory Context");
    });

    it("returns relevant observations for matching prompt", () => {
      addObservation(p("proj"), {
        sessionId: "s1",
        type: "feature",
        title: "OAuth authentication flow",
        narrative: "Implemented the full OAuth2 authentication flow",
        facts: ["Uses PKCE", "Supports refresh tokens"],
        concepts: ["how-it-works"],
      });
      addObservation(p("proj"), {
        sessionId: "s1",
        type: "bugfix",
        title: "Database migration fix",
        narrative: "Fixed the migration ordering issue",
        facts: ["Reordered migration files"],
        concepts: ["problem-solution"],
      });

      const ctx = buildSemanticContext(p("proj"), "authentication login", {
        maxObservations: 10,
        fullDetailCount: 2,
        tokenBudget: 4096,
      });

      expect(ctx.text).toContain("Relevant Memory Context");
      expect(ctx.text).toContain("OAuth authentication flow");
      expect(ctx.observationCount).toBeGreaterThanOrEqual(1);
    });
  });
});
