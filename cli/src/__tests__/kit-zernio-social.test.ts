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
  it("ships the five Zernio docs (including the exported Growthub UI shell guide)", () => {
    expect(fs.existsSync(path.join(KIT_ROOT, "docs/zernio-api-integration.md"))).toBe(true);
    expect(fs.existsSync(path.join(KIT_ROOT, "docs/platform-coverage.md"))).toBe(true);
    expect(fs.existsSync(path.join(KIT_ROOT, "docs/ai-caption-layer.md"))).toBe(true);
    expect(fs.existsSync(path.join(KIT_ROOT, "docs/posts-and-queues-layer.md"))).toBe(true);
    expect(fs.existsSync(path.join(KIT_ROOT, "docs/growthub-agentic-social-platform-ui-shell.md"))).toBe(true);
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

  it("growthub UI shell doc defines the exported workspace launch and validation flow", () => {
    const doc = readText("docs/growthub-agentic-social-platform-ui-shell.md");
    expect(doc).toContain("The user exports this worker kit from the CLI.");
    expect(doc).toContain("the user works inside the exported folder");
    expect(doc).toContain("studio/");
    expect(doc).toContain("npm install");
    expect(doc).toContain("npm run dev");
    expect(doc).toContain("VITE_ZERNIO_API_URL");
    expect(doc).toContain("VITE_ZERNIO_API_KEY");
    expect(doc).toContain("VITE_ZERNIO_PROFILE_ID");
    expect(doc).toContain("comment-automations");
  });

  it("growthub UI shell doc is registered as a frozen + required asset", () => {
    const manifest = JSON.parse(readText("kit.json"));
    const bundle = JSON.parse(readText(`bundles/${KIT_ID}.json`));
    expect(manifest.frozenAssetPaths).toContain("docs/growthub-agentic-social-platform-ui-shell.md");
    expect(bundle.requiredFrozenAssets).toContain("docs/growthub-agentic-social-platform-ui-shell.md");
  });
});

describe("growthub-zernio-social-v1 — cross-platform setup + local-adapter surface", () => {
  it("ships setup.mjs as the cross-platform one-command bootstrap", () => {
    const setup = readText("setup/setup.mjs");
    // Host detection + per-OS next-step printing
    expect(setup).toContain("platform()");
    expect(setup).toContain("darwin");
    expect(setup).toContain("win32");
    // Reuses existing primitives, does not reinvent
    expect(setup).toContain("verify-env.mjs");
    expect(setup).toMatch(/copyFileSync|\.env\.example/);
    // Supported CLI flags
    expect(setup).toContain("--skip-deps");
    expect(setup).toContain("--skip-verify");
    expect(setup).toContain("--yes");
  });

  it("ships check-deps.mjs as the Windows-parity dep checker", () => {
    const deps = readText("setup/check-deps.mjs");
    // Cross-platform `which` shim
    expect(deps).toContain("where");
    expect(deps).toContain("which");
    // Still enforces Node 18+
    expect(deps).toMatch(/>=\s*18|nodeMajor/);
    // Does not require curl (since Node has fetch())
    expect(deps).toContain("fetch");
  });

  it("ships install-mcp.mjs that prints per-IDE MCP config JSON", () => {
    const mcp = readText("setup/install-mcp.mjs");
    // Advertises the four IDE surfaces we cover
    expect(mcp).toContain("Claude Desktop");
    expect(mcp).toContain("Claude Code");
    expect(mcp).toContain("Cursor");
    expect(mcp).toContain("Generic MCP-compatible IDE");
    // Cross-platform config paths
    expect(mcp).toContain("claude_desktop_config.json");
    expect(mcp).toContain("mcp.json");
    // Installer is print-only — must reference the upstream install command, not execute it
    expect(mcp).toContain("pip install zernio-sdk[mcp]");
    expect(mcp).toContain("ZERNIO_API_KEY");
  });

  it("docs/local-adapters.md documents every local IDE surface", () => {
    const adapters = readText("docs/local-adapters.md");
    for (const ide of [
      "Claude Code",
      "Claude Desktop",
      "Codex",
      "Cursor",
      "Gemini",
      "OpenCode",
      "Qwen",
      "Open Agents",
    ]) {
      expect(adapters, `missing IDE mention: ${ide}`).toContain(ide);
    }
    // Layers + anti-patterns
    expect(adapters).toContain("Working Directory");
    expect(adapters).toContain("pip install zernio-sdk[mcp]");
    expect(adapters).toContain("npx clawhub@latest install zernio-api");
    expect(adapters).toContain("ServerAdapterModule");
    expect(adapters).toMatch(/does\s*\*\*not\*\*|does NOT/i);
  });

  it("kit.json + bundle register every new setup + adapters asset", () => {
    const manifest = JSON.parse(readText("kit.json"));
    const bundle = JSON.parse(readText(`bundles/${KIT_ID}.json`));
    for (const rel of [
      "setup/setup.mjs",
      "setup/check-deps.mjs",
      "setup/install-mcp.mjs",
      "docs/local-adapters.md",
    ]) {
      expect(manifest.frozenAssetPaths, `missing in frozenAssetPaths: ${rel}`).toContain(rel);
      expect(bundle.requiredFrozenAssets, `missing in requiredFrozenAssets: ${rel}`).toContain(rel);
    }
  });

  it("zernio-api-integration doc documents plans + the extended capability surface", () => {
    const doc = readText("docs/zernio-api-integration.md");
    // Plans table
    expect(doc).toContain("Plans and Quotas");
    expect(doc).toContain("Free");
    expect(doc).toContain("Accelerate");
    expect(doc).toContain("Unlimited");
    // Expanded capability surface
    for (const resource of ["Contacts", "Broadcasts", "Sequences", "Automations", "Webhooks"]) {
      expect(doc, `missing capability: ${resource}`).toContain(resource);
    }
    expect(doc).toContain("account.connected");
    expect(doc).toContain("post.recycled");
    // Primitives table
    expect(doc).toContain("Claude Code skill");
    expect(doc).toContain("Official MCP server");
  });

  it("QUICKSTART advertises the one-command bootstrap and per-OS paths", () => {
    const q = readText("QUICKSTART.md");
    expect(q).toContain("node setup/setup.mjs");
    expect(q).toContain("macOS");
    expect(q).toContain("Windows");
    expect(q).toContain("Linux");
    expect(q).toContain("%USERPROFILE%");
    expect(q).toContain("docs/local-adapters.md");
  });
});

describe("growthub-zernio-social-v1 — hosted-saas kernel packet alignment", () => {
  const REPO_ROOT = path.resolve(KIT_ROOT, "../../../..");
  const PACKET_PATH = path.join(REPO_ROOT, "docs/kernel-packets/KERNEL_PACKET_HOSTED_SAAS_KIT.md");

  function readPacket(): string {
    return fs.readFileSync(PACKET_PATH, "utf8");
  }

  it("the kernel packet exists on disk", () => {
    expect(fs.existsSync(PACKET_PATH), `missing ${PACKET_PATH}`).toBe(true);
  });

  it("is registered in docs/kernel-packets/README.md registry", () => {
    const registry = fs.readFileSync(path.join(REPO_ROOT, "docs/kernel-packets/README.md"), "utf8");
    expect(registry).toContain("Hosted SaaS Kit Kernel Packet");
    expect(registry).toContain("KERNEL_PACKET_HOSTED_SAAS_KIT.md");
  });

  it("is linked from the top-level README.md docs list", () => {
    const readme = fs.readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
    expect(readme).toContain("Hosted SaaS Kit Kernel Packet");
    expect(readme).toContain("docs/kernel-packets/KERNEL_PACKET_HOSTED_SAAS_KIT.md");
  });

  it("is cross-linked from the Custom Workspace packet as a specialization", () => {
    const parent = fs.readFileSync(path.join(REPO_ROOT, "docs/kernel-packets/KERNEL_PACKET_CUSTOM_WORKSPACES.md"), "utf8");
    expect(parent).toContain("Specializations");
    expect(parent).toContain("KERNEL_PACKET_HOSTED_SAAS_KIT.md");
  });

  it("declares v1 version + relationship + invariants + anti-patterns + procedure + reference", () => {
    const packet = readPacket();
    expect(packet).toMatch(/Version:\s*`v1`/);
    expect(packet).toContain("Relationship to Other Packets");
    expect(packet).toContain("Kernel Invariants");
    expect(packet).toContain("Surface Area Contract");
    expect(packet).toContain("Anti-Patterns");
    expect(packet).toContain("Packet Procedure");
    expect(packet).toContain("Reference Implementation");
    expect(packet).toContain("Definition Of Done");
  });

  it("encodes the three bets as enforceable invariants", () => {
    const packet = readPacket();
    // Bet 1 — Package, don't wrap
    expect(packet).toContain("IDE-agnostic entrypoint");
    expect(packet).toContain("workers/<worker-id>/CLAUDE.md");
    // Bet 2 — IDE-agnostic via Working Directory
    expect(packet).toContain("Working Directory");
    expect(packet).toContain("server/src/adapters/registry.ts");
    expect(packet).toContain("No new registry entry");
    // Bet 3 — Thin over thick, always additive
    expect(packet).toContain("No SDK installed");
    expect(packet).toContain("Agent-only mode is first-class");
    expect(packet).toContain("Idempotency is part of the output contract");
    expect(packet).toContain("Secret hygiene is a test");
    expect(packet).toContain("Provider primitives stay opt-in");
  });

  it("names growthub-zernio-social-v1 as the canonical reference implementation", () => {
    const packet = readPacket();
    expect(packet).toContain("growthub-zernio-social-v1");
    expect(packet).toContain("canonical v1 reference");
  });

  it("growthub-meta README points to the kernel packet", () => {
    const meta = readText("growthub-meta/README.md");
    expect(meta).toContain("Hosted SaaS Kit Kernel Packet");
    expect(meta).toContain("canonical reference implementation");
  });
});

describe("growthub-zernio-social-v1 — growthub UI shell surfacing", () => {
  it("QUICKSTART.md advertises the growthub-ui-shell execution mode and links the exported UI-shell doc", () => {
    const quickstart = readText("QUICKSTART.md");
    expect(quickstart).toContain("growthub-ui-shell");
    expect(quickstart).toContain("docs/growthub-agentic-social-platform-ui-shell.md");
    expect(quickstart).toContain("studio/");
  });

  it("skills.md quick-reference table lists the growthub UI-shell doc", () => {
    const skills = readText("skills.md");
    expect(skills).toContain("docs/growthub-agentic-social-platform-ui-shell.md");
    expect(skills).toContain("Growthub Agentic UI shell");
  });

  it("operator CLAUDE.md instructs reading the UI-shell doc when the request targets the exported workspace", () => {
    const claude = readText(`workers/${WORKER_ID}/CLAUDE.md`);
    expect(claude).toContain("docs/growthub-agentic-social-platform-ui-shell.md");
    expect(claude).toContain("Growthub social UI shell");
  });

  it("growthub-meta/README.md documents the exported workspace truth", () => {
    const meta = readText("growthub-meta/README.md");
    expect(meta).toContain("Exported Workspace Truth");
    expect(meta).toContain("studio/");
    expect(meta).toContain("exporting this workspace cleanly");
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

  it("ships the studio-side .env.example inside the exported UI shell", () => {
    expect(fs.existsSync(path.join(KIT_ROOT, "studio/.env.example"))).toBe(true);
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
