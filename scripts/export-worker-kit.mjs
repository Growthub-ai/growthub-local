import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const kitsRoot = path.join(root, "cli", "assets", "worker-kits");
const zipTimestamp = new Date("2026-04-10T00:00:00.000Z");

function usage() {
  console.log(
    [
      "Usage:",
      "  node scripts/export-worker-kit.mjs <kit-id> [--out <dir>] [--qa]",
      "",
      "Example:",
      "  node scripts/export-worker-kit.mjs growthub-open-higgsfield-studio-v1 --out ~/growthub-worker-kit-exports --qa",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    kitId: "",
    outDir: path.join(process.env.HOME || root, "growthub-worker-kit-exports"),
    qa: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--") && !result.kitId) {
      result.kitId = arg;
      continue;
    }
    if (arg === "--out") {
      result.outDir = path.resolve(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--qa") {
      result.qa = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!result.kitId) {
    usage();
    throw new Error("Missing required <kit-id>.");
  }

  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isInside(parentDir, childDir) {
  const parent = path.resolve(parentDir);
  const child = path.resolve(childDir);
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listRelativeFiles(rootDir) {
  const files = [];
  const walk = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        files.push(path.relative(rootDir, fullPath).split(path.sep).join("/"));
      }
    }
  };
  walk(rootDir);
  return files.sort();
}

function assertRelativePathExists(rootDir, relativePath, label) {
  const fullPath = path.join(rootDir, relativePath);
  assert(fs.existsSync(fullPath), `${label} missing required path: ${relativePath}`);
}

function resolveKit(kitId) {
  const kitRoot = path.join(kitsRoot, kitId);
  assert(fs.existsSync(kitRoot), `Unknown kit '${kitId}'. Expected directory at ${kitRoot}`);

  const manifest = readJson(path.join(kitRoot, "kit.json"));
  assert(manifest.kit?.id === kitId, `Manifest kit.id mismatch for ${kitId}`);
  assert(manifest.executionMode === "export", `Kit ${kitId} must use executionMode=export`);
  assert(Array.isArray(manifest.bundles) && manifest.bundles.length > 0, `Kit ${kitId} must declare at least one bundle`);

  const bundleRef = manifest.bundles[0];
  const bundle = readJson(path.join(kitRoot, bundleRef.path));
  assert(bundle.bundle?.kitId === kitId, `Bundle kitId mismatch for ${kitId}`);

  return { kitRoot, manifest, bundle };
}

function validateKit(kitRoot, manifest, bundle) {
  assertRelativePathExists(kitRoot, manifest.entrypoint.path, "Entrypoint");
  assertRelativePathExists(kitRoot, manifest.agentContractPath, "Agent contract");
  assertRelativePathExists(kitRoot, manifest.brandTemplatePath, "Brand template");

  for (const assetPath of manifest.frozenAssetPaths ?? []) {
    assertRelativePathExists(kitRoot, assetPath, "Frozen asset");
  }

  for (const requiredPath of manifest.outputStandard?.requiredPaths ?? []) {
    assertRelativePathExists(kitRoot, requiredPath, "Output standard");
  }

  for (const assetPath of bundle.requiredFrozenAssets ?? []) {
    assertRelativePathExists(kitRoot, assetPath, "Bundle asset");
  }

  const allowedBrandPaths = new Set([
    manifest.brandTemplatePath,
    ...(manifest.publicExampleBrandPaths ?? []),
  ]);
  const brandKitFiles = listRelativeFiles(kitRoot).filter(
    (filePath) => filePath.startsWith("brands/") && filePath.endsWith("/brand-kit.md"),
  );
  const disallowed = brandKitFiles.filter((filePath) => !allowedBrandPaths.has(filePath));
  assert(disallowed.length === 0, `Bundled kit includes non-public brand kits: ${disallowed.join(", ")}`);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosTimeParts(date) {
  const year = Math.max(date.getUTCFullYear(), 1980);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = Math.floor(date.getUTCSeconds() / 2);

  return {
    dosTime: (hours << 11) | (minutes << 5) | seconds,
    dosDate: ((year - 1980) << 9) | (month << 5) | day,
  };
}

function buildStoredZip(entries) {
  const parts = [];
  const centralDirectoryParts = [];
  let offset = 0;
  const { dosTime, dosDate } = toDosTimeParts(zipTimestamp);

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const data = entry.data;
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30 + nameBuffer.length);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuffer.copy(localHeader, 30);

    parts.push(localHeader, data);

    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuffer.copy(centralHeader, 46);
    centralDirectoryParts.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralDirectoryParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, centralDirectory, endRecord]);
}

function exportKit(kitRoot, bundle, outDir) {
  fs.mkdirSync(outDir, { recursive: true });

  const folderPath = path.join(outDir, bundle.export.folderName);
  const zipPath = path.join(outDir, bundle.export.zipFileName);

  fs.rmSync(folderPath, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  fs.cpSync(kitRoot, folderPath, { recursive: true });

  const zipEntries = listRelativeFiles(folderPath).map((relativePath) => ({
    name: path.posix.join(bundle.export.folderName, relativePath),
    data: fs.readFileSync(path.join(folderPath, relativePath)),
  }));
  fs.writeFileSync(zipPath, buildStoredZip(zipEntries));

  return { folderPath, zipPath };
}

function runQa(folderPath, manifest, bundle) {
  assert(fs.existsSync(path.join(folderPath, "kit.json")), "Exported folder is missing kit.json");
  assert(fs.existsSync(path.join(folderPath, bundle.bundle ? "bundles" : "bundles")), "Exported folder is missing bundles directory");
  assert(fs.existsSync(path.join(folderPath, manifest.entrypoint.path)), "Exported folder is missing entrypoint");
  assert(fs.existsSync(path.join(folderPath, "runtime-assumptions.md")), "Exported folder is missing runtime assumptions");
  assert(fs.existsSync(path.join(folderPath, "docs", "provider-adapter-layer.md")), "Exported folder is missing provider adapter notes");
  assert(fs.existsSync(path.join(folderPath, "workers", "open-higgsfield-studio-operator", "CLAUDE.md")), "Exported folder is missing worker entrypoint");
}

try {
  const { kitId, outDir, qa } = parseArgs(process.argv);
  assert(
    !isInside(root, outDir),
    `Refusing to export inside the repo. Choose a folder outside ${root}`,
  );
  const { kitRoot, manifest, bundle } = resolveKit(kitId);
  validateKit(kitRoot, manifest, bundle);
  const { folderPath, zipPath } = exportKit(kitRoot, bundle, outDir);

  if (qa) {
    runQa(folderPath, manifest, bundle);
  }

  console.log(`Kit: ${kitId}`);
  console.log(`Expanded Folder: ${folderPath}`);
  console.log(`Zip File: ${zipPath}`);
  console.log(`QA: ${qa ? "passed" : "skipped"}`);
  console.log("");
  console.log("Next steps:");
  console.log(`1. Open a separate agent session and set Working Directory to: ${folderPath}`);
  console.log("2. In the Open Higgsfield browser or desktop app, enter your Muapi key from https://muapi.ai when prompted.");
  console.log("3. The exported kit already includes runtime and adapter docs for Muapi BYOK, browser/desktop flow, and local-fork inspection.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
