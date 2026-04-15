/**
 * Native Intelligence — Marketing Context Builder
 *
 * Auto-drafts a product-marketing-context.md from project artifacts
 * (README, package.json, landing page content) using the local model
 * or deterministic extraction.
 *
 * This flow does NOT replace the user filling in their context.
 * It produces a first draft that the user validates and refines.
 *
 * Falls back to deterministic extraction when the model is unavailable.
 */

import fs from "node:fs";
import path from "node:path";
import type { NativeIntelligenceBackend, ModelCompletionResult } from "./contract.js";

// ---------------------------------------------------------------------------
// Input / Output contracts
// ---------------------------------------------------------------------------

export interface MarketingContextInput {
  /** Root directory to scan for project artifacts */
  projectDir: string;
  /** Optional existing context to update rather than create from scratch */
  existingContext?: string;
}

export interface MarketingContextResult {
  /** The drafted product-marketing-context markdown */
  contextMarkdown: string;
  /** Sources that were found and used */
  sourcesUsed: string[];
  /** Sources that were looked for but not found */
  sourcesMissing: string[];
  /** Whether a model was used or just deterministic extraction */
  mode: "model-assisted" | "deterministic";
  /** Confidence in the draft quality (0.0-1.0) */
  confidence: number;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const CONTEXT_BUILDER_SYSTEM_PROMPT = `You are a marketing strategist drafting a product-marketing-context document.

You receive project artifacts (README content, package.json metadata, any landing page content) and produce a structured product-marketing-context.md with 12 sections.

Rules:
1. Extract real information from the artifacts — never fabricate
2. Use "[NEEDS INPUT]" for sections that cannot be inferred from artifacts
3. For customer language, use any quotes or testimonials found; otherwise mark "[NEEDS INPUT]"
4. For competitive landscape, infer from positioning language if possible
5. Keep the tone analytical and factual
6. Prefer specificity over generality — use exact numbers, names, and features found in artifacts
7. The output should be valid Markdown following the 12-section structure

Respond with ONLY the markdown content for the product-marketing-context document.`;

// ---------------------------------------------------------------------------
// Artifact scanner
// ---------------------------------------------------------------------------

interface ProjectArtifacts {
  readme?: string;
  packageJson?: Record<string, unknown>;
  existingContext?: string;
  otherFiles: string[];
}

const MAX_ARTIFACT_LENGTH = 8000;

function scanProjectArtifacts(projectDir: string, existingContext?: string): ProjectArtifacts {
  const artifacts: ProjectArtifacts = { otherFiles: [] };

  // README
  for (const name of ["README.md", "readme.md", "Readme.md", "README"]) {
    const readmePath = path.join(projectDir, name);
    if (fs.existsSync(readmePath)) {
      const content = fs.readFileSync(readmePath, "utf-8");
      artifacts.readme = content.slice(0, MAX_ARTIFACT_LENGTH);
      break;
    }
  }

  // package.json
  const pkgPath = path.join(projectDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      artifacts.packageJson = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    } catch { /* skip malformed */ }
  }

  // Existing context
  if (existingContext) {
    artifacts.existingContext = existingContext;
  } else {
    for (const candidate of [
      ".agents/product-marketing-context.md",
      ".claude/product-marketing-context.md",
      "brands/_template/product-marketing-context.md",
    ]) {
      const ctxPath = path.join(projectDir, candidate);
      if (fs.existsSync(ctxPath)) {
        artifacts.existingContext = fs.readFileSync(ctxPath, "utf-8");
        break;
      }
    }
  }

  // Check for other relevant files
  for (const name of ["CONTRIBUTING.md", "AGENTS.md", "landing-page.md", "about.md"]) {
    if (fs.existsSync(path.join(projectDir, name))) {
      artifacts.otherFiles.push(name);
    }
  }

  return artifacts;
}

// ---------------------------------------------------------------------------
// Builder (model-assisted)
// ---------------------------------------------------------------------------

export async function buildMarketingContext(
  input: MarketingContextInput,
  backend: NativeIntelligenceBackend,
): Promise<MarketingContextResult> {
  const artifacts = scanProjectArtifacts(input.projectDir, input.existingContext);
  const userPrompt = buildPromptFromArtifacts(artifacts);
  const sourcesUsed: string[] = [];
  const sourcesMissing: string[] = [];

  if (artifacts.readme) sourcesUsed.push("README.md");
  else sourcesMissing.push("README.md");
  if (artifacts.packageJson) sourcesUsed.push("package.json");
  else sourcesMissing.push("package.json");
  if (artifacts.existingContext) sourcesUsed.push("existing product-marketing-context");

  try {
    const completion: ModelCompletionResult = await backend.complete({
      systemPrompt: CONTEXT_BUILDER_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
      maxTokens: 4096,
      responseFormat: "text",
    });

    const contextMarkdown = cleanMarkdownResponse(completion.text);
    if (contextMarkdown.length > 200) {
      return {
        contextMarkdown,
        sourcesUsed,
        sourcesMissing,
        mode: "model-assisted",
        confidence: sourcesUsed.length >= 2 ? 0.7 : 0.4,
      };
    }
  } catch {
    // Fall through to deterministic
  }

  return buildDeterministicContext(input);
}

// ---------------------------------------------------------------------------
// Deterministic fallback (no model required)
// ---------------------------------------------------------------------------

export function buildDeterministicContext(
  input: MarketingContextInput,
): MarketingContextResult {
  const artifacts = scanProjectArtifacts(input.projectDir, input.existingContext);
  const sourcesUsed: string[] = [];
  const sourcesMissing: string[] = [];

  if (artifacts.readme) sourcesUsed.push("README.md");
  else sourcesMissing.push("README.md");
  if (artifacts.packageJson) sourcesUsed.push("package.json");
  else sourcesMissing.push("package.json");

  const pkg = artifacts.packageJson ?? {};
  const name = (pkg.name as string) ?? "[NEEDS INPUT]";
  const description = (pkg.description as string) ?? extractFirstLine(artifacts.readme) ?? "[NEEDS INPUT]";
  const version = (pkg.version as string) ?? "";
  const license = (pkg.license as string) ?? "";
  const homepage = (pkg.homepage as string) ?? "";
  const keywords = Array.isArray(pkg.keywords) ? (pkg.keywords as string[]).join(", ") : "";

  const contextMarkdown = `# Product Marketing Context — ${cleanPackageName(name)}

---

## 1. Product Overview

| Field | Value |
|---|---|
| Product name | ${cleanPackageName(name)} |
| One-liner | ${description} |
| Category | ${keywords || "[NEEDS INPUT]"} |
| Product type | [NEEDS INPUT] |
| Pricing model | [NEEDS INPUT] |
| Starting price | [NEEDS INPUT] |
| Website | ${homepage || "[NEEDS INPUT]"} |
${version ? `| Version | ${version} |` : ""}
${license ? `| License | ${license} |` : ""}

---

## 2. Target Audience

| Field | Value |
|---|---|
| Company type | [NEEDS INPUT] |
| Company size | [NEEDS INPUT] |
| Industry verticals | [NEEDS INPUT] |
| Decision-maker titles | [NEEDS INPUT] |
| Primary use case | [NEEDS INPUT] |

---

## 3. Personas

| Persona | Role | Key Motivation | Primary Objection |
|---|---|---|---|
| [NEEDS INPUT] | | | |

---

## 4. Problems & Pain Points

1. **Core problem**: [NEEDS INPUT]
2. **Cost of inaction**: [NEEDS INPUT]
3. **Emotional tension**: [NEEDS INPUT]
4. **Failed alternatives**: [NEEDS INPUT]

---

## 5. Competitive Landscape

| Competitor | Type | Key Difference |
|---|---|---|
| [NEEDS INPUT] | Direct | |

---

## 6. Differentiation

- **Key differentiator 1**: [NEEDS INPUT]
- **Key differentiator 2**: [NEEDS INPUT]
- **Why customers choose you**: [NEEDS INPUT]

---

## 7. Objections & Anti-Personas

**Common objections:**
1. [NEEDS INPUT]

**Anti-personas:**
- [NEEDS INPUT]

---

## 8. Switching Dynamics

| Force | Description |
|---|---|
| Push | [NEEDS INPUT] |
| Pull | [NEEDS INPUT] |
| Habit | [NEEDS INPUT] |
| Anxiety | [NEEDS INPUT] |

---

## 9. Customer Language

- "[NEEDS INPUT]"

---

## 10. Brand Voice

| Attribute | Value |
|---|---|
| Tone | [NEEDS INPUT] |
| Style | [NEEDS INPUT] |
| Words we use | [NEEDS INPUT] |
| Words we avoid | [NEEDS INPUT] |

---

## 11. Proof Points

| Type | Detail |
|---|---|
| [NEEDS INPUT] | |

---

## 12. Goals

| Goal | Metric | Target |
|---|---|---|
| Primary conversion | [NEEDS INPUT] | [NEEDS INPUT] |

---

## Messaging Guardrails

- [NEEDS INPUT]

---

## Deliverables Log

<!-- Append a line after every operator session -->
`;

  return {
    contextMarkdown,
    sourcesUsed,
    sourcesMissing,
    mode: "deterministic",
    confidence: sourcesUsed.length >= 2 ? 0.4 : 0.2,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPromptFromArtifacts(artifacts: ProjectArtifacts): string {
  const sections: string[] = [];

  if (artifacts.existingContext) {
    sections.push("=== EXISTING PRODUCT MARKETING CONTEXT ===");
    sections.push(artifacts.existingContext.slice(0, MAX_ARTIFACT_LENGTH));
    sections.push("");
    sections.push("Update and refine this existing context using the project artifacts below.");
    sections.push("");
  } else {
    sections.push("Draft a new product-marketing-context.md using the project artifacts below.");
    sections.push("Use the standard 12-section structure. Mark unknown sections with [NEEDS INPUT].");
    sections.push("");
  }

  if (artifacts.readme) {
    sections.push("=== README.md ===");
    sections.push(artifacts.readme);
    sections.push("");
  }

  if (artifacts.packageJson) {
    sections.push("=== package.json (metadata) ===");
    const { name, description, version, license, homepage, keywords, repository } = artifacts.packageJson;
    sections.push(JSON.stringify({ name, description, version, license, homepage, keywords, repository }, null, 2));
    sections.push("");
  }

  if (artifacts.otherFiles.length > 0) {
    sections.push(`Other project files found: ${artifacts.otherFiles.join(", ")}`);
  }

  return sections.join("\n");
}

function extractFirstLine(text?: string): string | undefined {
  if (!text) return undefined;
  const lines = text.split("\n").filter((l) => l.trim().length > 0 && !l.startsWith("#"));
  return lines[0]?.trim();
}

function cleanPackageName(name: string): string {
  return name.replace(/^@[^/]+\//, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function cleanMarkdownResponse(text: string): string {
  let cleaned = text.trim();
  // Strip markdown code fences if the model wrapped the response
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    cleaned = cleaned.slice(firstNewline + 1);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, cleaned.lastIndexOf("```"));
  }
  return cleaned.trim();
}
