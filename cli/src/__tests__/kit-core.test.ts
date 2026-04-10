/**
 * Fork Adapter Core — Test Suite
 *
 * Covers:
 *   - Type taxonomy constants
 *   - Env gate runner (with and without .env file)
 *   - Setup validation
 *   - Fork inspector (fork present and absent)
 *   - Provider adapter contract validator
 *   - Runtime surface contract validator
 *   - Output contract validator
 *   - Studio kit factory
 *   - Full adapter validation runner
 *   - Open Higgsfield reference config
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  // Types
  KIT_FAMILIES,
  REQUIRED_PROVIDER_OPERATIONS,
  RUNTIME_SURFACE_TYPES,
  makeError,
  makeWarning,
  makeInfo,
  // Env gate
  parseEnvFile,
  runEnvGate,
  // Setup validation
  validateSetup,
  validateEnvExample,
  // Fork inspector
  inspectFork,
  assertForkFileExists,
  // Provider adapter
  validateProviderContract,
  buildMuapiProviderContract,
  buildProviderContract,
  // Runtime surface
  validateRuntimeSurfaceContract,
  buildStudioRuntimeSurfaceContract,
  formatSurfaceSelectionNote,
  // Output contract
  validateOutputContract,
  buildStudioOutputContract,
  // Factory
  createStudioKitConfig,
  STUDIO_KIT_DEFAULTS,
  createWorkflowKitConfig,
  createOperatorKitConfig,
  createOpsKitConfig,
  // Validation runner
  runAdapterValidation,
  formatAdapterValidationReport,
  // Reference config
  buildOpenHiggsfieldStudioConfig,
} from "../kits/core/index.js";

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(dir: string, relativePath: string, content: string): string {
  const fullPath = path.resolve(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
  return fullPath;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

describe("core types", () => {
  it("exports all four kit families", () => {
    expect(KIT_FAMILIES).toEqual(["studio", "workflow", "operator", "ops"]);
  });

  it("exports all five required provider operations", () => {
    expect(REQUIRED_PROVIDER_OPERATIONS).toHaveLength(5);
    expect(REQUIRED_PROVIDER_OPERATIONS).toContain("UPLOAD_ASSET");
    expect(REQUIRED_PROVIDER_OPERATIONS).toContain("SUBMIT_GENERATION");
    expect(REQUIRED_PROVIDER_OPERATIONS).toContain("POLL_RESULT");
    expect(REQUIRED_PROVIDER_OPERATIONS).toContain("NORMALIZE_RESULT");
    expect(REQUIRED_PROVIDER_OPERATIONS).toContain("LIST_MODEL_CAPABILITIES");
  });

  it("exports all four runtime surface types", () => {
    expect(RUNTIME_SURFACE_TYPES).toContain("local-fork");
    expect(RUNTIME_SURFACE_TYPES).toContain("browser-hosted");
    expect(RUNTIME_SURFACE_TYPES).toContain("desktop-app");
    expect(RUNTIME_SURFACE_TYPES).toContain("custom");
  });

  it("issue builders produce correct severity", () => {
    expect(makeError("CODE", "msg").severity).toBe("error");
    expect(makeWarning("CODE", "msg").severity).toBe("warning");
    expect(makeInfo("CODE", "msg").severity).toBe("info");
  });
});

// ---------------------------------------------------------------------------
// Env gate
// ---------------------------------------------------------------------------

describe("env gate", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir("env-gate-"); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("fails when .env is missing", () => {
    const result = runEnvGate(tmpDir, { requiredEnvVars: ["MY_KEY"] });
    expect(result.valid).toBe(false);
    expect(result.envFileExists).toBe(false);
    expect(result.issues.some((i) => i.code === "ENV_FILE_MISSING")).toBe(true);
  });

  it("passes when .env has all required vars", () => {
    writeFile(tmpDir, ".env", "MY_KEY=abc123\n");
    const result = runEnvGate(tmpDir, { requiredEnvVars: ["MY_KEY"] });
    expect(result.valid).toBe(true);
    expect(result.presentVars).toContain("MY_KEY");
  });

  it("fails when required var is missing from .env", () => {
    writeFile(tmpDir, ".env", "OTHER_KEY=foo\n");
    const result = runEnvGate(tmpDir, { requiredEnvVars: ["MY_KEY"] });
    expect(result.valid).toBe(false);
    expect(result.missingVars).toContain("MY_KEY");
  });

  it("fails when var is set to placeholder value", () => {
    writeFile(tmpDir, ".env", "MY_KEY=your_muapi_key_here\n");
    const result = runEnvGate(tmpDir, {
      requiredEnvVars: ["MY_KEY"],
      placeholderGuardedVars: [{ key: "MY_KEY", placeholder: "your_muapi_key_here" }],
    });
    expect(result.valid).toBe(false);
    expect(result.placeholderVars).toContain("MY_KEY");
  });

  it("parseEnvFile ignores comments and blank lines", () => {
    writeFile(tmpDir, ".env", "# comment\n\nKEY=value\n");
    const vars = parseEnvFile(path.join(tmpDir, ".env"));
    expect(vars["KEY"]).toBe("value");
    expect(Object.keys(vars)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Setup validation
// ---------------------------------------------------------------------------

describe("setup validation", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir("setup-val-"); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("fails when QUICKSTART.md is missing", () => {
    const result = validateSetup(tmpDir, {
      quickstart: "QUICKSTART.md",
      envExample: ".env.example",
      setupDir: "setup/",
      outputDir: "output/",
      files: [],
    });
    expect(result.valid).toBe(false);
    expect(result.quickstartExists).toBe(false);
  });

  it("passes when all required setup files exist", () => {
    writeFile(tmpDir, "QUICKSTART.md", "# Quick Start\n\nStep 1: do the thing.\nStep 2: do the other thing.\n");
    writeFile(tmpDir, ".env.example", "MY_KEY=placeholder\n");
    writeFile(tmpDir, "output/README.md", "# Output\n");
    const result = validateSetup(tmpDir, {
      quickstart: "QUICKSTART.md",
      envExample: ".env.example",
      setupDir: "setup/",
      outputDir: "output/",
      files: [],
    });
    expect(result.valid).toBe(true);
    expect(result.quickstartExists).toBe(true);
    expect(result.envExampleExists).toBe(true);
  });

  it("validateEnvExample detects missing keys", () => {
    writeFile(tmpDir, ".env.example", "ONLY_THIS_KEY=placeholder\n");
    const result = validateEnvExample(tmpDir, ["ONLY_THIS_KEY", "MISSING_KEY"]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "ENV_EXAMPLE_KEY_MISSING")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fork inspector
// ---------------------------------------------------------------------------

describe("fork inspector", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir("fork-inspect-"); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("returns assumption-based status when fork not found", () => {
    const result = inspectFork({
      upstreamRepoUrl: "https://github.com/example/repo",
      defaultLocalPath: path.join(tmpDir, "nonexistent-fork"),
      integrationDocPath: "docs/fork.md",
      inspectionRules: { requiredPlanningFiles: ["src/models.js"], sourceOfTruthFiles: [] },
    });
    expect(result.forkFound).toBe(false);
    expect(result.verificationStatus).toBe("assumption-based");
    expect(result.valid).toBe(true); // non-blocking
  });

  it("returns fork-verified when all planning files present", () => {
    writeFile(tmpDir, "src/models.js", "module.exports = {};\n");
    const result = inspectFork(
      {
        upstreamRepoUrl: "https://github.com/example/repo",
        defaultLocalPath: tmpDir,
        integrationDocPath: "docs/fork.md",
        inspectionRules: { requiredPlanningFiles: ["src/models.js"], sourceOfTruthFiles: [] },
      },
      { forkRootOverride: tmpDir },
    );
    expect(result.forkFound).toBe(true);
    expect(result.verificationStatus).toBe("fork-verified");
    expect(result.presentPlanningFiles).toContain("src/models.js");
  });

  it("assertForkFileExists returns correct result", () => {
    writeFile(tmpDir, "models.js", "export default {};\n");
    expect(assertForkFileExists(tmpDir, "models.js").exists).toBe(true);
    expect(assertForkFileExists(tmpDir, "missing.js").exists).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Provider adapter
// ---------------------------------------------------------------------------

describe("provider adapter", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir("provider-"); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("validates a complete Muapi contract", () => {
    writeFile(tmpDir, "docs/provider-adapter-layer.md", "# Provider Adapter\n");
    const contract = buildMuapiProviderContract();
    const result = validateProviderContract(tmpDir, contract);
    expect(result.valid).toBe(true);
    expect(result.missingRequiredOperations).toHaveLength(0);
    expect(result.referenceDocPresent).toBe(true);
  });

  it("fails when required operations are missing", () => {
    const contract = buildProviderContract("myapi", "My API", "https://api.example.com", "x-api-key", "docs/adapter.md");
    // Strip operations to simulate incomplete declaration
    const incomplete = { ...contract, operations: [] as any };
    const result = validateProviderContract(tmpDir, incomplete);
    expect(result.valid).toBe(false);
    expect(result.missingRequiredOperations.length).toBeGreaterThan(0);
  });

  it("buildMuapiProviderContract produces correct defaults", () => {
    const contract = buildMuapiProviderContract();
    expect(contract.providerId).toBe("muapi");
    expect(contract.authField).toBe("x-api-key");
    expect(contract.baseUrl).toBe("https://api.muapi.io");
  });
});

// ---------------------------------------------------------------------------
// Runtime surface
// ---------------------------------------------------------------------------

describe("runtime surface", () => {
  it("validates a well-formed studio surface contract", () => {
    const contract = buildStudioRuntimeSurfaceContract();
    const result = validateRuntimeSurfaceContract(contract);
    expect(result.valid).toBe(true);
    expect(result.supportedSurfaces).toContain("local-fork");
    expect(result.supportedSurfaces).toContain("browser-hosted");
  });

  it("fails when no surfaces are declared", () => {
    const result = validateRuntimeSurfaceContract({
      supportedSurfaces: [],
      defaultSurface: "local-fork",
      surfaceProbes: { "local-fork": null, "browser-hosted": null, "desktop-app": null, "custom": null },
    });
    expect(result.valid).toBe(false);
  });

  it("fails when defaultSurface is not in supportedSurfaces", () => {
    const result = validateRuntimeSurfaceContract({
      supportedSurfaces: ["browser-hosted"],
      defaultSurface: "local-fork",
      surfaceProbes: { "local-fork": null, "browser-hosted": null, "desktop-app": null, "custom": null },
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "DEFAULT_SURFACE_NOT_SUPPORTED")).toBe(true);
  });

  it("formatSurfaceSelectionNote returns a string for all surface types", () => {
    for (const surface of RUNTIME_SURFACE_TYPES) {
      const note = formatSurfaceSelectionNote(surface);
      expect(typeof note).toBe("string");
      expect(note.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Output contract
// ---------------------------------------------------------------------------

describe("output contract", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir("output-contract-"); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("validates the studio output contract", () => {
    writeFile(tmpDir, "output-standards.md", "# Output Standards\n");
    const contract = buildStudioOutputContract();
    const result = validateOutputContract(tmpDir, contract);
    expect(result.valid).toBe(true);
    expect(result.artifactCount).toBe(9);
    expect(result.duplicateArtifactNames).toHaveLength(0);
  });

  it("fails on duplicate artifact names", () => {
    const result = validateOutputContract(tmpDir, {
      outputRootPattern: "output/<client-slug>/<project-slug>/",
      requiresDeliverableLog: true,
      outputStandardsDocPath: "output-standards.md",
      artifacts: [
        { name: "Dupe", relativePath: "a.md", required: true, description: "First" },
        { name: "Dupe", relativePath: "b.md", required: true, description: "Second" },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.duplicateArtifactNames).toContain("Dupe");
  });
});

// ---------------------------------------------------------------------------
// Studio kit factory
// ---------------------------------------------------------------------------

describe("studio kit factory", () => {
  it("createStudioKitConfig produces a valid config", () => {
    const config = createStudioKitConfig({
      kitId: "test-studio-v1",
    });
    expect(config.family).toBe("studio");
    expect(config.kitId).toBe("test-studio-v1");
    expect(config.provider.providerId).toBe("muapi");
    expect(config.envGate.requiredEnvVars).toContain("MUAPI_API_KEY");
    expect(config.runtimeSurface.supportedSurfaces).toContain("local-fork");
    expect(config.output.artifacts).toHaveLength(9);
  });

  it("STUDIO_KIT_DEFAULTS are correct", () => {
    expect(STUDIO_KIT_DEFAULTS.defaultDevPort).toBe(3001);
    expect(STUDIO_KIT_DEFAULTS.apiKeyEnvVar).toBe("MUAPI_API_KEY");
    expect(STUDIO_KIT_DEFAULTS.providerId).toBe("muapi");
  });
});

// ---------------------------------------------------------------------------
// All four kit family factories
// ---------------------------------------------------------------------------

describe("kit family factories", () => {
  it("createWorkflowKitConfig sets family correctly", () => {
    const config = createWorkflowKitConfig({
      kitId: "test-workflow-v1",
      apiKeyEnvVar: "MY_KEY",
      providerId: "myapi",
      providerName: "My API",
      providerBaseUrl: "https://api.example.com",
    });
    expect(config.family).toBe("workflow");
    expect(config.kitId).toBe("test-workflow-v1");
  });

  it("createOperatorKitConfig sets family correctly", () => {
    const config = createOperatorKitConfig({
      kitId: "test-operator-v1",
      vertical: "email",
      apiKeyEnvVar: "EMAIL_KEY",
      providerId: "emailapi",
      providerName: "Email API",
      providerBaseUrl: "https://email.example.com",
    });
    expect(config.family).toBe("operator");
    expect(config.runtimeSurface.defaultSurface).toBe("browser-hosted");
  });

  it("createOpsKitConfig sets family correctly with no provider", () => {
    const config = createOpsKitConfig({
      kitId: "test-ops-v1",
      domain: "ci-pipeline",
    });
    expect(config.family).toBe("ops");
    expect(config.provider.providerId).toBe("none");
    expect(config.runtimeSurface.defaultSurface).toBe("local-fork");
  });
});

// ---------------------------------------------------------------------------
// Full validation runner
// ---------------------------------------------------------------------------

describe("adapter validation runner", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTempDir("adapter-val-"); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("produces a report with correct structure", () => {
    const config = buildOpenHiggsfieldStudioConfig();
    const report = runAdapterValidation(tmpDir, config, {
      skipEnvGate: true,
      skipForkInspection: true,
    });
    expect(report.kitId).toBe("growthub-open-higgsfield-studio-v1");
    expect(report.family).toBe("studio");
    expect(Array.isArray(report.sections)).toBe(true);
    expect(typeof report.totalErrors).toBe("number");
  });

  it("formatAdapterValidationReport returns a non-empty string", () => {
    const config = buildOpenHiggsfieldStudioConfig();
    const report = runAdapterValidation(tmpDir, config, {
      skipEnvGate: true,
      skipForkInspection: true,
    });
    const formatted = formatAdapterValidationReport(report);
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toContain("growthub-open-higgsfield-studio-v1");
  });
});

// ---------------------------------------------------------------------------
// Reference config
// ---------------------------------------------------------------------------

describe("Open Higgsfield reference config", () => {
  it("buildOpenHiggsfieldStudioConfig produces correct kitId and family", () => {
    const config = buildOpenHiggsfieldStudioConfig();
    expect(config.kitId).toBe("growthub-open-higgsfield-studio-v1");
    expect(config.family).toBe("studio");
    expect(config.forkInspection.upstreamRepoUrl).toBe("https://github.com/Anil-matcha/Open-Higgsfield-AI");
    expect(config.forkInspection.defaultLocalPath).toBe("~/open-higgsfield-ai");
  });

  it("reference config declares all 9 studio output artifacts", () => {
    const config = buildOpenHiggsfieldStudioConfig();
    expect(config.output.artifacts).toHaveLength(9);
    const names = config.output.artifacts.map((a) => a.name);
    expect(names).toContain("VisualCampaignBrief");
    expect(names).toContain("PlatformReadyExecutionHandoff");
  });

  it("reference config requires deliverable log", () => {
    const config = buildOpenHiggsfieldStudioConfig();
    expect(config.output.requiresDeliverableLog).toBe(true);
  });
});
