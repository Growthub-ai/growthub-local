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
} from "../kits/service.js";

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

describe("worker kit service", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("lists the single bundled v1 creative strategist kit", () => {
    const kits = listBundledKits();
    expect(kits).toHaveLength(1);
    expect(kits[0]).toMatchObject({
      id: "creative-strategist-v1",
      bundleId: "creative-strategist-v1",
      briefType: "video-creative-brief",
    });
  });

  it("inspects the kit with the public solawave example and default export paths", () => {
    const paperclipHome = makeTempDir("paperclip-home-");
    process.env.PAPERCLIP_HOME = paperclipHome;

    const info = inspectBundledKit("creative-strategist-v1");

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
    const sourceRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../assets/worker-kits/creative-strategist-v1",
    );

    fs.cpSync(sourceRoot, tempRoot, { recursive: true });

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
