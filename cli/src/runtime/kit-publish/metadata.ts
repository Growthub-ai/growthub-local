/**
 * Kit Publish — metadata builder.
 *
 * Produces a `CommunityKitPublishMetadata` artifact from a local kit directory.
 * This is local-first: no hosted Growthub required to generate publish metadata.
 * The artifact can be submitted to awesome-growthub-kits or shared directly.
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types (local convention — docs/KIT_PUBLISH_CONTRACT_V1.md)
// ---------------------------------------------------------------------------

export interface KitPublishValidation {
  skillsValidate: boolean;
  kitHealth: boolean;
  workerKitCheck: boolean;
  errors: string[];
  warnings: string[];
}

export interface CommunityKitPublishMetadata {
  version: 1;
  kind: "growthub-community-kit-publish";
  kitId: string;
  name: string;
  description: string;
  kitVersion: string;
  repository?: string;
  license: string;
  categories: string[];
  requiresBridge: boolean;
  supportsForkSync: boolean;
  sdkSurfaces: string[];
  family: string;
  entrypoints: Array<{ workerId: string; path: string }>;
  validation: KitPublishValidation;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Category inference
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  creative: ["creative", "video", "image", "studio", "higgsfield", "montage", "hyperframes"],
  agency: ["agency", "portal", "client"],
  marketing: ["marketing", "seo", "email", "geo", "gtm"],
  social: ["social", "postiz", "zernio"],
  ops: ["ops", "crm", "twenty", "workspace", "custom"],
  "ai-website": ["website", "cloner"],
  "self-improving": ["self-improving", "improving"],
};

function inferCategories(kitId: string, description: string): string[] {
  const text = `${kitId} ${description}`.toLowerCase();
  const found: string[] = [];
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) found.push(cat);
  }
  return found.length > 0 ? found : ["general"];
}

// ---------------------------------------------------------------------------
// Kit manifest reader
// ---------------------------------------------------------------------------

interface RawKitJson {
  kit?: {
    id?: string;
    name?: string;
    description?: string;
    version?: string;
    family?: string;
  };
  entrypoint?: { workerId?: string; path?: string };
  workerIds?: string[];
  agentContractPath?: string;
  provenance?: { sourceRepo?: string };
  compatibility?: Record<string, unknown>;
}

function readKitJson(kitRoot: string): RawKitJson | null {
  const kitJsonPath = path.resolve(kitRoot, "kit.json");
  try {
    return JSON.parse(fs.readFileSync(kitJsonPath, "utf8")) as RawKitJson;
  } catch {
    return null;
  }
}

function detectLicense(kitRoot: string): string {
  for (const candidate of ["LICENSE", "LICENSE.md", "LICENSE.txt"]) {
    if (fs.existsSync(path.resolve(kitRoot, candidate))) return "MIT";
  }
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(kitRoot, "package.json"), "utf8"),
    ) as { license?: string };
    if (pkg.license) return pkg.license;
  } catch { /* ignore */ }
  return "MIT";
}

function detectRepository(kitRoot: string): string | undefined {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(kitRoot, "package.json"), "utf8"),
    ) as { repository?: string | { url?: string } };
    if (typeof pkg.repository === "string") return pkg.repository;
    if (typeof pkg.repository?.url === "string") return pkg.repository.url;
  } catch { /* ignore */ }
  return undefined;
}

// ---------------------------------------------------------------------------
// Validation helpers (lightweight on-disk checks)
// ---------------------------------------------------------------------------

function runLightweightValidation(kitRoot: string, kitJson: RawKitJson): KitPublishValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!kitJson.kit?.id) errors.push("kit.id missing");
  if (!kitJson.kit?.name) errors.push("kit.name missing");
  if (!kitJson.kit?.description) errors.push("kit.description missing");
  if (!kitJson.kit?.version) errors.push("kit.version missing");

  // Check six governed-workspace primitives
  const skillMd = path.resolve(kitRoot, "SKILL.md");
  if (!fs.existsSync(skillMd)) errors.push("SKILL.md missing (primitive #1)");

  const projectMdTemplate = path.resolve(kitRoot, "templates", "project.md");
  if (!fs.existsSync(projectMdTemplate)) warnings.push("templates/project.md missing (primitive #3 — recommended)");

  const selfEvalTemplate = path.resolve(kitRoot, "templates", "self-eval.md");
  if (!fs.existsSync(selfEvalTemplate)) warnings.push("templates/self-eval.md missing (primitive #4 — recommended)");

  const helpersDir = path.resolve(kitRoot, "helpers");
  if (!fs.existsSync(helpersDir)) warnings.push("helpers/ missing (primitive #6 — recommended)");

  const skillsDir = path.resolve(kitRoot, "skills");
  if (!fs.existsSync(skillsDir)) warnings.push("skills/ missing (primitive #5 — recommended)");

  const agentContractPath = kitJson.agentContractPath ?? kitJson.entrypoint?.path;
  if (agentContractPath && !fs.existsSync(path.resolve(kitRoot, agentContractPath))) {
    errors.push(`agentContractPath not found: ${agentContractPath}`);
  }

  const kitHealthOk = errors.length === 0;
  const skillsValidateOk = !errors.some((e) => e.includes("SKILL.md"));

  return {
    skillsValidate: skillsValidateOk,
    kitHealth: kitHealthOk,
    workerKitCheck: kitHealthOk && warnings.length === 0,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildPublishMetadataOptions {
  kitRoot: string;
  repositoryOverride?: string;
}

export interface BuildPublishMetadataResult {
  metadata: CommunityKitPublishMetadata;
  valid: boolean;
}

export function buildPublishMetadata(
  options: BuildPublishMetadataOptions,
): BuildPublishMetadataResult {
  const { kitRoot } = options;
  const kitJson = readKitJson(kitRoot);

  if (!kitJson?.kit?.id) {
    throw new Error(
      `kit.json not found or missing kit.id at ${kitRoot}. ` +
      `Run: growthub kit validate ${kitRoot}`,
    );
  }

  const kit = kitJson.kit;
  const validation = runLightweightValidation(kitRoot, kitJson);
  const categories = inferCategories(kit.id ?? "", kit.description ?? "");
  const requiresBridge = Boolean(
    fs.existsSync(path.resolve(kitRoot, "workspace.dependencies.json")) ||
    (kit.description ?? "").toLowerCase().includes("bridge"),
  );

  const entrypoints: Array<{ workerId: string; path: string }> = [];
  if (kitJson.entrypoint?.workerId && kitJson.entrypoint?.path) {
    entrypoints.push({
      workerId: kitJson.entrypoint.workerId,
      path: kitJson.entrypoint.path,
    });
  }

  const metadata: CommunityKitPublishMetadata = {
    version: 1,
    kind: "growthub-community-kit-publish",
    kitId: kit.id ?? "",
    name: kit.name ?? "",
    description: kit.description ?? "",
    kitVersion: kit.version ?? "0.0.0",
    repository: options.repositoryOverride ?? detectRepository(kitRoot),
    license: detectLicense(kitRoot),
    categories,
    requiresBridge,
    supportsForkSync: true,
    sdkSurfaces: ["worker-kits", "skills", "health"],
    family: kit.family ?? "studio",
    entrypoints,
    validation,
    generatedAt: new Date().toISOString(),
  };

  return {
    metadata,
    valid: validation.errors.length === 0,
  };
}
