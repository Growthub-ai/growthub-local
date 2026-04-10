import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  downloadBundledKit,
  inspectBundledKit,
  listBundledKits,
  resolveKitPath,
  validateBundledKitAssetRoot,
  validateKitDirectory,
} from "../kits/service.js";
import {
  normalizeManifest,
  normalizeBundleManifest,
  isManifestV2,
  isManifestV1,
  type KitManifestV1,
  type KitManifestV2,
  type BundleManifestV1,
} from "../kits/contract.js";

const ORIGINAL_ENV = { ...process.env };

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function listRelativeFiles(rootDir: string): string[] {
  const files: string[] = [];
  const walk = (currentDir: string) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      files.push(path.relative(rootDir, fullPath).split(path.sep).join("/"));
    }
  };
  walk(rootDir);
  return files.sort();
}

function readZipEntryNames(zipPath: string): string[] {
  const data = fs.readFileSync(zipPath);
  const endSignature = 0x06054b50;
  let endOffset = -1;

  for (let index = data.length - 22; index >= 0; index -= 1) {
    if (data.readUInt32LE(index) === endSignature) {
      endOffset = index;
      break;
    }
  }

  if (endOffset < 0) {
    throw new Error(`End of central directory not found in ${zipPath}`);
  }

  const totalEntries = data.readUInt16LE(endOffset + 10);
  const centralDirectoryOffset = data.readUInt32LE(endOffset + 16);
  const names: string[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    expect(data.readUInt32LE(offset)).toBe(0x02014b50);
    const nameLength = data.readUInt16LE(offset + 28);
    const extraLength = data.readUInt16LE(offset + 30);
    const commentLength = data.readUInt16LE(offset + 32);
    const name = data.toString("utf8", offset + 46, offset + 46 + nameLength);
    names.push(name);
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return names.sort();
}

function copyKitAssets(destRoot: string): void {
  const sourceRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../assets/worker-kits/creative-strategist-v1",
  );
  fs.cpSync(sourceRoot, destRoot, { recursive: true });
}

describe("worker kit service", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("lists the single bundled v1 creative strategist kit with type metadata", () => {
    const kits = listBundledKits();
    expect(kits).toHaveLength(1);
    expect(kits[0]).toMatchObject({
      id: "creative-strategist-v1",
      bundleId: "creative-strategist-v1",
      briefType: "video-creative-brief",
      type: "worker",
      executionMode: "export",
      activationModes: ["export"],
    });
  });

  it("inspects the kit with capability metadata and default export paths", () => {
    const paperclipHome = makeTempDir("paperclip-home-");
    process.env.PAPERCLIP_HOME = paperclipHome;

    const info = inspectBundledKit("creative-strategist-v1");

    expect(info.type).toBe("worker");
    expect(info.executionMode).toBe("export");
    expect(info.activationModes).toEqual(["export"]);
    expect(info.schemaVersion).toBe(2);
    expect(info.publicExampleBrandPaths).toEqual(["brands/solawave/brand-kit.md"]);
    expect(info.exportFolderPath).toBe(
      path.resolve(paperclipHome, "kits", "exports", "growthub-agent-worker-kit-creative-strategist-v1"),
    );
    expect(info.requiredPaths).toContain("brands/solawave/brand-kit.md");
  });

  it("downloads both the expanded folder and zip and keeps zip contents aligned", () => {
    const outDir = makeTempDir("worker-kit-out-");
    const result = downloadBundledKit("creative-strategist-v1", outDir);

    expect(fs.existsSync(result.folderPath)).toBe(true);
    expect(fs.existsSync(result.zipPath)).toBe(true);
    expect(listRelativeFiles(result.folderPath)).toContain("brands/solawave/brand-kit.md");
    expect(listRelativeFiles(result.folderPath)).not.toContain("brands/clarifion/brand-kit.md");

    const folderFiles = listRelativeFiles(result.folderPath);
    const zipEntries = readZipEntryNames(result.zipPath);
    const expectedZipEntries = folderFiles.map((relativePath) =>
      path.posix.join("growthub-agent-worker-kit-creative-strategist-v1", relativePath),
    );

    expect(zipEntries).toEqual(expectedZipEntries);
  });

  it("resolves the default materialized path without downloading", () => {
    const paperclipHome = makeTempDir("paperclip-home-");
    process.env.PAPERCLIP_HOME = paperclipHome;

    const resolvedPath = resolveKitPath("creative-strategist-v1");
    expect(resolvedPath).toBe(
      path.resolve(paperclipHome, "kits", "exports", "growthub-agent-worker-kit-creative-strategist-v1"),
    );
    expect(fs.existsSync(resolvedPath)).toBe(false);
  });

  it("fails validation before export when a manifest path is broken", () => {
    const tempRoot = makeTempDir("worker-kit-broken-");
    copyKitAssets(tempRoot);

    const manifestPath = path.resolve(tempRoot, "kit.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      frozenAssetPaths: string[];
    };
    manifest.frozenAssetPaths = [...manifest.frozenAssetPaths, "templates/missing-file.md"];
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    expect(() =>
      validateBundledKitAssetRoot(tempRoot, { kitId: "creative-strategist-v1" }),
    ).toThrow(/missing required path: templates\/missing-file\.md/);
  });
});

describe("kit contract types", () => {
  it("normalizes a v1 manifest to v2 with default capability type", () => {
    const v1: KitManifestV1 = {
      schemaVersion: 1,
      kit: {
        id: "test-kit",
        version: "1.0.0",
        name: "Test Kit",
        description: "A test kit",
        sourceRepo: "test-repo",
      },
      entrypoint: { workerId: "test-worker", path: "CLAUDE.md" },
      workerIds: ["test-worker"],
      agentContractPath: "CLAUDE.md",
      brandTemplatePath: "brands/_template/brand-kit.md",
      frozenAssetPaths: ["CLAUDE.md"],
      outputStandard: { type: "working-directory", requiredPaths: ["CLAUDE.md"] },
      bundles: [{ id: "test-bundle", version: "1.0.0", path: "bundles/test.json" }],
    };

    expect(isManifestV1(v1)).toBe(true);
    expect(isManifestV2(v1)).toBe(false);

    const normalized = normalizeManifest(v1);
    expect(normalized.schemaVersion).toBe(2);
    expect(normalized.kit.type).toBe("worker");
    expect(normalized.executionMode).toBe("export");
    expect(normalized.activationModes).toEqual(["export"]);
    expect(normalized.compatibility).toEqual({});
    expect(normalized.provenance).toEqual({ sourceRepo: "test-repo" });
  });

  it("passes through a v2 manifest unchanged", () => {
    const v2: KitManifestV2 = {
      schemaVersion: 2,
      kit: {
        id: "test-kit",
        version: "1.0.0",
        name: "Test Kit",
        description: "A test kit",
        type: "workflow",
      },
      entrypoint: { workerId: "test-worker", path: "CLAUDE.md" },
      workerIds: ["test-worker"],
      agentContractPath: "CLAUDE.md",
      brandTemplatePath: "brands/_template/brand-kit.md",
      frozenAssetPaths: ["CLAUDE.md"],
      outputStandard: { type: "working-directory", requiredPaths: ["CLAUDE.md"] },
      bundles: [{ id: "test-bundle", version: "1.0.0", path: "bundles/test.json" }],
      executionMode: "install",
      activationModes: ["export", "install"],
      compatibility: { cliMinVersion: "0.3.35" },
    };

    expect(isManifestV2(v2)).toBe(true);
    const normalized = normalizeManifest(v2);
    expect(normalized).toBe(v2);
  });

  it("normalizes a v1 bundle manifest to v2", () => {
    const v1: BundleManifestV1 = {
      schemaVersion: 1,
      bundle: { id: "test", version: "1.0.0", kitId: "test-kit", workerId: "worker" },
      briefType: "video-creative-brief",
      requiredFrozenAssets: [],
      optionalPresets: [],
      export: { folderName: "test-folder", zipFileName: "test.zip" },
    };

    const normalized = normalizeBundleManifest(v1);
    expect(normalized.schemaVersion).toBe(2);
    expect(normalized.activationModes).toEqual(["export"]);
  });
});

describe("kit validate command", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("validates a valid kit directory as VALID", () => {
    const tempRoot = makeTempDir("worker-kit-valid-");
    copyKitAssets(tempRoot);

    const result = validateKitDirectory(tempRoot);
    expect(result.valid).toBe(true);
    expect(result.kitId).toBe("creative-strategist-v1");
    expect(result.schemaVersion).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it("reports error when kit.json is missing", () => {
    const tempRoot = makeTempDir("worker-kit-no-manifest-");

    const result = validateKitDirectory(tempRoot);
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe("kit.json");
  });

  it("reports error when kit.json has invalid JSON", () => {
    const tempRoot = makeTempDir("worker-kit-bad-json-");
    fs.writeFileSync(path.resolve(tempRoot, "kit.json"), "{ not valid json }");

    const result = validateKitDirectory(tempRoot);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("not valid JSON");
  });

  it("reports error for unsupported schema version", () => {
    const tempRoot = makeTempDir("worker-kit-bad-version-");
    fs.writeFileSync(
      path.resolve(tempRoot, "kit.json"),
      JSON.stringify({ schemaVersion: 99, kit: { id: "test" } }),
    );

    const result = validateKitDirectory(tempRoot);
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe("schemaVersion");
  });

  it("reports errors when required kit fields are missing", () => {
    const tempRoot = makeTempDir("worker-kit-missing-fields-");
    fs.writeFileSync(
      path.resolve(tempRoot, "kit.json"),
      JSON.stringify({ schemaVersion: 1, kit: { id: "test-kit" } }),
    );

    const result = validateKitDirectory(tempRoot);
    expect(result.valid).toBe(false);
    const fieldNames = result.errors.map((e) => e.field);
    expect(fieldNames).toContain("kit.version");
    expect(fieldNames).toContain("kit.name");
    expect(fieldNames).toContain("kit.description");
  });

  it("reports v2-specific errors when schema is v2 but type is missing", () => {
    const tempRoot = makeTempDir("worker-kit-v2-no-type-");
    copyKitAssets(tempRoot);

    const manifestPath = path.resolve(tempRoot, "kit.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    const kitBlock = manifest.kit as Record<string, unknown>;
    delete kitBlock.type;
    delete manifest.activationModes;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = validateKitDirectory(tempRoot);
    expect(result.valid).toBe(false);
    const fieldNames = result.errors.map((e) => e.field);
    expect(fieldNames).toContain("kit.type");
    expect(fieldNames).toContain("activationModes");
  });

  it("reports errors when schema v2 execution modes are invalid", () => {
    const tempRoot = makeTempDir("worker-kit-v2-bad-modes-");
    copyKitAssets(tempRoot);

    const manifestPath = path.resolve(tempRoot, "kit.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.executionMode = "banana";
    manifest.activationModes = ["export", "banana"];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = validateKitDirectory(tempRoot);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "executionMode", message: expect.stringContaining("banana") }),
        expect.objectContaining({ field: "activationModes", message: expect.stringContaining("banana") }),
      ]),
    );
  });

  it("reports error when frozen asset is missing on disk", () => {
    const tempRoot = makeTempDir("worker-kit-missing-asset-");
    copyKitAssets(tempRoot);

    const manifestPath = path.resolve(tempRoot, "kit.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      frozenAssetPaths: string[];
    };
    manifest.frozenAssetPaths = [...manifest.frozenAssetPaths, "nonexistent/file.md"];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = validateKitDirectory(tempRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("nonexistent/file.md"))).toBe(true);
  });

  it("reports error when bundle kitId does not match kit id", () => {
    const tempRoot = makeTempDir("worker-kit-bundle-mismatch-");
    copyKitAssets(tempRoot);

    const bundlePath = path.resolve(tempRoot, "bundles/creative-strategist-v1.json");
    const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8")) as {
      bundle: { kitId: string };
    };
    bundle.bundle.kitId = "wrong-kit-id";
    fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));

    const result = validateKitDirectory(tempRoot);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("wrong-kit-id"))).toBe(true);
  });

  it("warns when a v1 kit could upgrade to v2", () => {
    const tempRoot = makeTempDir("worker-kit-v1-warn-");
    copyKitAssets(tempRoot);

    // Downgrade to v1
    const manifestPath = path.resolve(tempRoot, "kit.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.schemaVersion = 1;
    const kitBlock = manifest.kit as Record<string, unknown>;
    delete kitBlock.type;
    delete manifest.executionMode;
    delete manifest.activationModes;
    delete manifest.compatibility;
    delete manifest.provenance;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = validateKitDirectory(tempRoot);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.message.includes("v2"))).toBe(true);
  });
});
