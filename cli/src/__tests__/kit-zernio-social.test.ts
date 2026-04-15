/**
 * Zernio Social Media Kit — Production-Readiness Test Suite
 *
 * Covers:
 *   - Catalog registration
 *   - Core factory config (buildZernioSocialConfig) shape and constraints
 *   - Kit manifest + bundle contract integrity on disk
 *   - Frozen asset enumeration and docs/templates/examples presence
 *   - Platform coverage exposes all 14 Zernio platforms
 *   - .env.example + QUICKSTART + verify-env script smoke + contract
 *   - Scheduling manifest template shape (Zernio POST /api/v1/posts body)
 *   - Agent law (CLAUDE.md) contains the 10-step workflow gates
 *   - Secret hygiene: no real-looking API keys anywhere in the kit payload
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { BUNDLED_KIT_CATALOG } from "../kits/catalog.js";
import { buildZernioSocialConfig } from "../kits/core/index.js";
import {
  inspectBundledKit,
  listBundledKits,
  validateBundledKitAssetRoot,
} from "../kits/service.js";

const KIT_ID = "growthub-zernio-social-v1";
const WORKER_ID = "zernio-social-operator";
const BRIEF_TYPE = "zernio-social-media-campaign";

const KIT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  `../../assets/worker-kits/${KIT_ID}`,
);

const PLATFORM_IDS = [
  "twitter",
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "youtube",
  "pinterest",
  "reddit",
  "bluesky",
  "threads",
  "googlebusiness",
  "telegram",
  "snapchat",
  "whatsapp",
] as const;

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(KIT_ROOT, relativePath), "utf8");
}

describe("growthub-zernio-social-v1 — catalog registration", () => {
  it("is registered in BUNDLED_KIT_CATALOG with the correct shape", () => {
    const entry = BUNDLED_KIT_CATALOG.find((kit) => kit.id === KIT_ID);
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({
      id: KIT_ID,
      packageDirName: KIT_ID,
      defaultBundleId: KIT_ID,
      type: "worker",
      executionMode: "export",
      activationModes: ["export"],
      family: "studio",
    });
  });

  it("is surfaced by listBundledKits() with the expected metadata", () => {
    const kits = listBundledKits();
    const zernio = kits.find((kit) => kit.id === KIT_ID);
    expect(zernio).toBeDefined();
    expect(zernio).toMatchObject({
      bundleId: KIT_ID,
      briefType: BRIEF_TYPE,
      type: "worker",
      executionMode: "export",
      activationModes: ["export"],
    });
  });

  it("inspects via the bundled kit service with studio family and required setup assets", () => {
    const info = inspectBundledKit(KIT_ID);
    expect(info.family).toBe("studio");
    expect(info.type).toBe("worker");
    expect(info.executionMode).toBe("export");
    expect(info.activationModes).toEqual(["export"]);
    expect(info.requiredPaths).toContain(".env.example");
    expect(info.requiredPaths).toContain("QUICKSTART.md");
    expect(info.requiredPaths).toContain(`bundles/${KIT_ID}.json`);
  });

  it("passes validateBundledKitAssetRoot against the on-disk payload", () => {
    expect(() =>
      validateBundledKitAssetRoot(KIT_ROOT, { kitId: KIT_ID }),
    ).not.toThrow();
  });
});

describe("growthub-zernio-social-v1 — core factory config", () => {
  it("buildZernioSocialConfig produces an operator-family config with Zernio provider", () => {
    const config = buildZernioSocialConfig();
    expect(config.kitId).toBe(KIT_ID);
    expect(config.family).toBe("operator");
    expect(config.provider.providerId).toBe("zernio");
    expect(config.provider.providerName).toBe("Zernio (hosted)");
    expect(config.provider.baseUrl).toBe("https://zernio.com/api/v1");
    expect(config.provider.authField).toBe("Authorization");
    expect(config.provider.referenceDocPath).toBe("docs/zernio-api-integration.md");
  });

  it("env gate requires ZERNIO_API_KEY and ZERNIO_API_URL with placeholder guard", () => {
    const config = buildZernioSocialConfig();
    expect(config.envGate.requiredEnvVars).toEqual(
      expect.arrayContaining(["ZERNIO_API_KEY", "ZERNIO_API_URL"]),
    );
    expect(config.envGate.placeholderGuardedVars).toEqual(
      expect.arrayContaining([
        { key: "ZERNIO_API_KEY", placeholder: "your_zernio_api_key_here" },
      ]),
    );
    expect(config.envGate.verifyCommandPath).toBe("setup/verify-env.mjs");
  });

  it("declares browser-hosted as the default runtime surface (no fork)", () => {
    const config = buildZernioSocialConfig();
    expect(config.runtimeSurface.defaultSurface).toBe("browser-hosted");
    expect(config.runtimeSurface.supportedSurfaces).toContain("browser-hosted");
    expect(config.forkInspection.upstreamRepoUrl).toBe("");
  });

  it("declares the 7 Zernio output artifacts with 4 required + 3 optional", () => {
    const config = buildZernioSocialConfig();
    const names = config.output.artifacts.map((a) => a.name);
    expect(config.output.artifacts).toHaveLength(7);
    expect(names).toEqual([
      "Social Campaign Brief",
      "Content Calendar",
      "Platform Publishing Plan",
      "Caption Copy Deck",
      "Scheduling Manifest",
      "Analytics Brief",
      "Client Proposal",
    ]);
    const requiredCount = config.output.artifacts.filter((a) => a.required).length;
    const optionalCount = config.output.artifacts.filter((a) => !a.required).length;
    expect(requiredCount).toBe(4);
    expect(optionalCount).toBe(3);
  });

  it("requires a deliverable log", () => {
    const config = buildZernioSocialConfig();
    expect(config.output.requiresDeliverableLog).toBe(true);
    expect(config.output.outputRootPattern).toBe("output/<client-slug>/<project-slug>/");
  });
});

describe("growthub-zernio-social-v1 — kit.json + bundle manifest", () => {
  it("kit.json declares schemaVersion 2, correct family, and export mode", () => {
    const manifest = JSON.parse(readText("kit.json"));
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.kit.id).toBe(KIT_ID);
    expect(manifest.kit.type).toBe("worker");
    expect(manifest.kit.family).toBe("studio");
    expect(manifest.executionMode).toBe("export");
    expect(manifest.activationModes).toEqual(["export"]);
    expect(manifest.entrypoint.workerId).toBe(WORKER_ID);
    expect(manifest.entrypoint.path).toBe(`workers/${WORKER_ID}/CLAUDE.md`);
    expect(manifest.compatibility.cliMinVersion).toBeTruthy();
  });

  it("bundle manifest kitId and workerId match kit.json", () => {
    const bundle = JSON.parse(readText(`bundles/${KIT_ID}.json`));
    expect(bundle.schemaVersion).toBe(2);
    expect(bundle.bundle.id).toBe(KIT_ID);
    expect(bundle.bundle.kitId).toBe(KIT_ID);
    expect(bundle.bundle.workerId).toBe(WORKER_ID);
    expect(bundle.briefType).toBe(BRIEF_TYPE);
    expect(bundle.activationModes).toEqual(["export"]);
    expect(bundle.export.folderName).toBe(`growthub-agent-worker-kit-zernio-social-v1`);
    expect(bundle.export.zipFileName).toBe(`growthub-agent-worker-kit-zernio-social-v1.zip`);
  });

  it("every frozenAssetPath exists on disk", () => {
    const manifest = JSON.parse(readText("kit.json"));
    for (const rel of manifest.frozenAssetPaths) {
      expect(fs.existsSync(path.join(KIT_ROOT, rel)), `missing frozen asset ${rel}`).toBe(true);
    }
  });

  it("every bundle.requiredFrozenAsset exists on disk", () => {
    const bundle = JSON.parse(readText(`bundles/${KIT_ID}.json`));
    for (const rel of bundle.requiredFrozenAssets) {
      expect(fs.existsSync(path.join(KIT_ROOT, rel)), `missing required frozen asset ${rel}`).toBe(true);
    }
  });
});

describe("growthub-zernio-social-v1 — docs + templates + examples", () => {
  it("ships the four Zernio docs", () => {
    expect(fs.existsSync(path.join(KIT_ROOT, "docs/zernio-api-integration.md"))).toBe(true);
    expect(fs.existsSync(path.join(KIT_ROOT, "docs/platform-coverage.md"))).toBe(true);
    expect(fs.existsSync(path.join(KIT_ROOT, "docs/ai-caption-layer.md"))).toBe(true);
    expect(fs.existsSync(path.join(KIT_ROOT, "docs/posts-and-queues-layer.md"))).toBe(true);
  });

  it("platform coverage doc references all 14 Zernio platform ids", () => {
    const coverage = readText("docs/platform-coverage.md");
    for (const id of PLATFORM_IDS) {
      expect(coverage, `platform ${id} not present in platform-coverage.md`).toContain(`\`${id}\``);
    }
  });

  it("zernio-api-integration doc pins base URL and auth model", () => {
    const doc = readText("docs/zernio-api-integration.md");
    expect(doc).toContain("https://zernio.com/api/v1");
    expect(doc).toContain("Authorization: Bearer");
    expect(doc).toContain("Idempotency-Key");
    expect(doc).toContain("POST /api/v1/posts");
    expect(doc).toContain("POST /api/v1/queues");
    expect(doc).toContain("POST /api/v1/media");
  });

  it("ships the 7 templates", () => {
    for (const t of [
      "templates/social-campaign-brief.md",
      "templates/content-calendar.md",
      "templates/platform-publishing-plan.md",
      "templates/caption-copy-deck.md",
      "templates/analytics-brief.md",
      "templates/scheduling-manifest.md",
      "templates/client-proposal.md",
    ]) {
      expect(fs.existsSync(path.join(KIT_ROOT, t)), `missing template ${t}`).toBe(true);
    }
  });

  it("ships the 4 examples", () => {
    for (const e of [
      "examples/social-campaign-sample.md",
      "examples/content-calendar-sample.md",
      "examples/analytics-brief-sample.md",
      "examples/client-proposal-sample.md",
    ]) {
      expect(fs.existsSync(path.join(KIT_ROOT, e)), `missing example ${e}`).toBe(true);
    }
  });

  it("scheduling-manifest template documents the Zernio POST /api/v1/posts shape", () => {
    const tmpl = readText("templates/scheduling-manifest.md");
    expect(tmpl).toContain("zernioSchedulingManifest");
    expect(tmpl).toContain("clientPostId");
    expect(tmpl).toContain("scheduledFor");
    expect(tmpl).toContain("platforms");
    expect(tmpl).toContain("dryRun");
  });

  it("posts-and-queues doc enumerates the queue slot contract", () => {
    const doc = readText("docs/posts-and-queues-layer.md");
    expect(doc).toContain("zernioQueue");
    expect(doc).toMatch(/"day":\s*"mon"/);
    expect(doc).toContain("queueId");
  });
});

describe("growthub-zernio-social-v1 — env example + setup scripts", () => {
  it(".env.example declares the Zernio env vars", () => {
    const env = readText(".env.example");
    expect(env).toContain("ZERNIO_API_KEY=your_zernio_api_key_here");
    expect(env).toContain("ZERNIO_API_URL=https://zernio.com/api/v1");
    expect(env).toContain("ZERNIO_PROFILE_ID=");
    expect(env).toContain("ZERNIO_TIMEZONE=");
    expect(env).toContain("ANTHROPIC_API_KEY=");
  });

  it("verify-env.mjs script exists and enforces the Zernio key format", () => {
    const script = readText("setup/verify-env.mjs");
    expect(script).toContain("^sk_[0-9a-fA-F]{64}$");
    expect(script).toContain("Authorization: `Bearer");
    expect(script).toContain("/profiles");
    expect(script).toContain("ZERNIO_API_KEY");
  });

  it("check-deps.sh requires node, curl, and git", () => {
    const script = readText("setup/check-deps.sh");
    expect(script).toContain("command -v node");
    expect(script).toContain("command -v curl");
    expect(script).toContain("command -v git");
  });
});

describe("growthub-zernio-social-v1 — agent law", () => {
  it("CLAUDE.md declares the worker id and 10-step workflow", () => {
    const claude = readText(`workers/${WORKER_ID}/CLAUDE.md`);
    expect(claude).toContain(`Worker ID:** \`${WORKER_ID}\``);
    expect(claude).toContain("STEP 0 — Environment gate");
    expect(claude).toContain("STEP 4 — Ask the 4-question gate");
    expect(claude).toContain("STEP 8 — Phase 3: Scheduling manifest");
    expect(claude).toContain("STEP 10 — Log the deliverable");
  });

  it("CLAUDE.md enumerates all /zernio subcommands", () => {
    const claude = readText(`workers/${WORKER_ID}/CLAUDE.md`);
    for (const cmd of [
      "/zernio campaign",
      "/zernio calendar",
      "/zernio captions",
      "/zernio schedule",
      "/zernio queue",
      "/zernio analytics",
      "/zernio inbox",
      "/zernio proposal",
      "/zernio platforms",
      "/zernio quick",
    ]) {
      expect(claude, `missing command ${cmd}`).toContain(cmd);
    }
  });

  it("skills.md references the Zernio manifest shape and idempotency rule", () => {
    const skills = readText("skills.md");
    expect(skills).toContain("zernioSchedulingManifest");
    expect(skills).toContain("Idempotency-Key");
    expect(skills).toContain("dryRun");
  });
});

describe("growthub-zernio-social-v1 — secret hygiene", () => {
  it("kit payload contains no real-looking sk_ Zernio keys (only the placeholder)", () => {
    // Recursively scan the kit, excluding binary / lockfile locations
    const violations: string[] = [];
    const walk = (currentDir: string) => {
      for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
        const full = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(md|mjs|json|sh|txt)$/i.test(entry.name)) continue;
        const text = fs.readFileSync(full, "utf8");
        // Match literal sk_ + 64 hex chars (a real key). Accept discussion
        // of the shape ("sk_" + 64 hex characters) but flag any actual 64-hex body.
        const literal = text.match(/sk_[0-9a-fA-F]{64}/g);
        if (literal) {
          violations.push(`${path.relative(KIT_ROOT, full)}: ${literal.join(", ")}`);
        }
      }
    };
    walk(KIT_ROOT);
    expect(violations, `leaked real-looking Zernio keys:\n${violations.join("\n")}`).toHaveLength(0);
  });

  it(".env.example contains only placeholders (no production keys)", () => {
    const env = readText(".env.example");
    expect(env).toMatch(/ZERNIO_API_KEY=your_zernio_api_key_here/);
    expect(env).toMatch(/ANTHROPIC_API_KEY=your_anthropic_key_here/);
    expect(env).not.toMatch(/sk_[0-9a-fA-F]{64}/);
    expect(env).not.toMatch(/sk-ant-[A-Za-z0-9_\-]{20,}/);
  });
});
