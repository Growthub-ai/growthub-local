import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandHomePrefix, resolvePaperclipHomeDir } from "../config/home.js";
import { BUNDLED_KIT_CATALOG, type BundledKitCatalogEntry } from "./catalog.js";
import {
  type KitManifest,
  type KitManifestV2,
  type BundleManifest,
  type BundleManifestV2,
  type KitValidationResult,
  type KitValidationError,
  type KitCapabilityType,
  type KitActivationMode,
  SUPPORTED_SCHEMA_VERSIONS,
  KIT_CAPABILITY_TYPES,
  KIT_ACTIVATION_MODES,
  normalizeManifest,
  normalizeBundleManifest,
  isManifestV2,
} from "./contract.js";

const LATEST_SCHEMA_VERSION = 2;
const ZIP_TIMESTAMP = new Date("2026-04-09T00:00:00.000Z");
const ALLOWED_PUBLIC_BRAND_PATHS = new Set([
  "brands/_template/brand-kit.md",
  "brands/solawave/brand-kit.md",
]);

// ---------------------------------------------------------------------------
// Resolved types (internal)
// ---------------------------------------------------------------------------

interface ResolvedBundledKit {
  catalogEntry: BundledKitCatalogEntry;
  assetRoot: string;
  manifest: KitManifestV2;
  bundleManifest: BundleManifestV2;
}

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------

export interface KitListItem {
  id: string;
  version: string;
  name: string;
  description: string;
  type: KitCapabilityType;
  executionMode: string;
  activationModes: KitActivationMode[];
  bundleId: string;
  bundleVersion: string;
  briefType: string;
}

export interface KitInspectResult extends KitListItem {
  entrypointPath: string;
  agentContractPath: string;
  brandTemplatePath: string;
  publicExampleBrandPaths: string[];
  frozenAssetCount: number;
  requiredFrozenAssetCount: number;
  outputRoot: string;
  exportFolderName: string;
  exportFolderPath: string;
  exportZipName: string;
  exportZipPath: string;
  requiredPaths: string[];
  compatibility: Record<string, unknown>;
  schemaVersion: number;
}

export interface KitDownloadResult {
  folderPath: string;
  zipPath: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveBundledKitAssetsRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../../assets/worker-kits"),
    path.resolve(moduleDir, "../assets/worker-kits"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error("Could not locate bundled worker kit assets.");
}

function resolveRequestedOutputRoot(outDir?: string): string {
  if (outDir?.trim()) {
    return path.resolve(expandHomePrefix(outDir.trim()));
  }
  return path.resolve(resolvePaperclipHomeDir(), "kits", "exports");
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function assertRelativePathExists(assetRoot: string, relativePath: string, label: string): void {
  const fullPath = path.resolve(assetRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`${label} is missing required path: ${relativePath}`);
  }
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

// ---------------------------------------------------------------------------
// Manifest parsing — supports v1 and v2, normalizes to v2
// ---------------------------------------------------------------------------

function parseManifest(assetRoot: string): KitManifestV2 {
  const raw = readJsonFile<KitManifest>(path.resolve(assetRoot, "kit.json"));
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(raw.schemaVersion as 1 | 2)) {
    throw new Error(`Unsupported kit schema version for ${assetRoot}: ${raw.schemaVersion}`);
  }
  return normalizeManifest(raw);
}

function parseBundleManifest(assetRoot: string, manifest: KitManifestV2, bundleId: string): BundleManifestV2 {
  const bundleRef = manifest.bundles.find((item) => item.id === bundleId);
  if (!bundleRef) {
    throw new Error(`Kit ${manifest.kit.id} does not declare bundle ${bundleId}.`);
  }
  const raw = readJsonFile<BundleManifest>(path.resolve(assetRoot, bundleRef.path));
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(raw.schemaVersion as 1 | 2)) {
    throw new Error(
      `Unsupported bundle schema version for ${bundleRef.path}: ${raw.schemaVersion}`,
    );
  }
  return normalizeBundleManifest(raw);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateBundledKit(resolved: ResolvedBundledKit): void {
  const { assetRoot, manifest, bundleManifest } = resolved;

  if (manifest.kit.id !== resolved.catalogEntry.id) {
    throw new Error(
      `Bundled catalog mismatch: expected ${resolved.catalogEntry.id}, got ${manifest.kit.id}.`,
    );
  }

  if (bundleManifest.bundle.kitId !== manifest.kit.id) {
    throw new Error(
      `Bundle ${bundleManifest.bundle.id} points at ${bundleManifest.bundle.kitId}, expected ${manifest.kit.id}.`,
    );
  }

  if (bundleManifest.bundle.workerId !== manifest.entrypoint.workerId) {
    throw new Error(
      `Bundle ${bundleManifest.bundle.id} worker mismatch: ${bundleManifest.bundle.workerId} vs ${manifest.entrypoint.workerId}.`,
    );
  }

  assertRelativePathExists(assetRoot, manifest.entrypoint.path, "Kit manifest");
  assertRelativePathExists(assetRoot, manifest.agentContractPath, "Kit manifest");
  assertRelativePathExists(assetRoot, manifest.brandTemplatePath, "Kit manifest");

  for (const bundle of manifest.bundles) {
    assertRelativePathExists(assetRoot, bundle.path, "Kit manifest bundle");
  }

  for (const relativePath of manifest.frozenAssetPaths) {
    assertRelativePathExists(assetRoot, relativePath, "Kit manifest");
  }

  for (const requiredPath of manifest.outputStandard.requiredPaths) {
    assertRelativePathExists(assetRoot, requiredPath, "Output standard");
  }

  for (const relativePath of bundleManifest.requiredFrozenAssets) {
    assertRelativePathExists(assetRoot, relativePath, "Bundle manifest");
  }

  const kitPublicBrands = new Set(manifest.publicExampleBrandPaths ?? []);
  const bundlePublicBrands = new Set(bundleManifest.publicExampleBrandPaths ?? []);
  for (const brandPath of kitPublicBrands) {
    if (!bundlePublicBrands.has(brandPath)) {
      throw new Error(`Bundle ${bundleManifest.bundle.id} is missing declared public brand ${brandPath}.`);
    }
  }

  const bundledFiles = listRelativeFiles(assetRoot);
  const brandKitFiles = bundledFiles.filter((filePath) => filePath.startsWith("brands/") && filePath.endsWith("/brand-kit.md"));
  const disallowedBrandFiles = brandKitFiles.filter((filePath) => !ALLOWED_PUBLIC_BRAND_PATHS.has(filePath));
  if (disallowedBrandFiles.length > 0) {
    throw new Error(
      `Bundled kit ${manifest.kit.id} includes non-public brand kits: ${disallowedBrandFiles.join(", ")}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Generic kit directory validation (for `kit validate <path>`)
// ---------------------------------------------------------------------------

export function validateKitDirectory(kitPath: string): KitValidationResult {
  const errors: KitValidationError[] = [];
  const warnings: KitValidationError[] = [];
  let schemaVersion = 0;
  let kitId = "<unknown>";

  const kitJsonPath = path.resolve(kitPath, "kit.json");
  if (!fs.existsSync(kitJsonPath)) {
    errors.push({ field: "kit.json", message: "kit.json not found in kit directory" });
    return { valid: false, schemaVersion, kitId, errors, warnings };
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(kitJsonPath, "utf8")) as Record<string, unknown>;
  } catch {
    errors.push({ field: "kit.json", message: "kit.json is not valid JSON" });
    return { valid: false, schemaVersion, kitId, errors, warnings };
  }

  schemaVersion = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion as 1 | 2)) {
    errors.push({
      field: "schemaVersion",
      message: `Unsupported schema version ${schemaVersion}. Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`,
    });
    return { valid: false, schemaVersion, kitId, errors, warnings };
  }

  const kitBlock = raw.kit as Record<string, unknown> | undefined;
  if (!kitBlock || typeof kitBlock !== "object") {
    errors.push({ field: "kit", message: "Missing required 'kit' block" });
    return { valid: false, schemaVersion, kitId, errors, warnings };
  }

  kitId = typeof kitBlock.id === "string" ? kitBlock.id : "<unknown>";

  // Required string fields in kit block
  for (const field of ["id", "version", "name", "description"]) {
    if (typeof kitBlock[field] !== "string" || (kitBlock[field] as string).trim() === "") {
      errors.push({ field: `kit.${field}`, message: `Missing or empty required field 'kit.${field}'` });
    }
  }

  // Schema v2 specific fields
  if (schemaVersion === 2) {
    const kitType = kitBlock.type as string | undefined;
    if (!kitType || !KIT_CAPABILITY_TYPES.includes(kitType as KitCapabilityType)) {
      errors.push({
        field: "kit.type",
        message: `Invalid or missing kit.type. Expected one of: ${KIT_CAPABILITY_TYPES.join(", ")}`,
      });
    }

    const execMode = raw.executionMode as string | undefined;
    if (!execMode) {
      errors.push({ field: "executionMode", message: "Missing required field 'executionMode'" });
    }

    const activationModes = raw.activationModes as string[] | undefined;
    if (!Array.isArray(activationModes) || activationModes.length === 0) {
      errors.push({ field: "activationModes", message: "Missing or empty 'activationModes' array" });
    } else {
      for (const mode of activationModes) {
        if (!KIT_ACTIVATION_MODES.includes(mode as KitActivationMode)) {
          warnings.push({
            field: "activationModes",
            message: `Unknown activation mode '${mode}'`,
          });
        }
      }
    }
  } else {
    // v1 — warn about missing v2 fields
    warnings.push({ field: "schemaVersion", message: "Kit uses schema v1. Consider upgrading to v2 for capability metadata." });
  }

  // Entrypoint
  const entrypoint = raw.entrypoint as Record<string, unknown> | undefined;
  if (!entrypoint || typeof entrypoint !== "object") {
    errors.push({ field: "entrypoint", message: "Missing required 'entrypoint' block" });
  } else {
    if (typeof entrypoint.workerId !== "string") {
      errors.push({ field: "entrypoint.workerId", message: "Missing required field 'entrypoint.workerId'" });
    }
    if (typeof entrypoint.path !== "string") {
      errors.push({ field: "entrypoint.path", message: "Missing required field 'entrypoint.path'" });
    } else {
      const fullPath = path.resolve(kitPath, entrypoint.path as string);
      if (!fs.existsSync(fullPath)) {
        errors.push({ field: "entrypoint.path", message: `Entrypoint file not found: ${entrypoint.path}` });
      }
    }
  }

  // Agent contract
  if (typeof raw.agentContractPath !== "string") {
    errors.push({ field: "agentContractPath", message: "Missing required field 'agentContractPath'" });
  } else {
    const fullPath = path.resolve(kitPath, raw.agentContractPath as string);
    if (!fs.existsSync(fullPath)) {
      errors.push({ field: "agentContractPath", message: `Agent contract not found: ${raw.agentContractPath}` });
    }
  }

  // Brand template
  if (typeof raw.brandTemplatePath !== "string") {
    errors.push({ field: "brandTemplatePath", message: "Missing required field 'brandTemplatePath'" });
  } else {
    const fullPath = path.resolve(kitPath, raw.brandTemplatePath as string);
    if (!fs.existsSync(fullPath)) {
      errors.push({ field: "brandTemplatePath", message: `Brand template not found: ${raw.brandTemplatePath}` });
    }
  }

  // Frozen assets
  const frozenAssets = raw.frozenAssetPaths;
  if (!Array.isArray(frozenAssets)) {
    errors.push({ field: "frozenAssetPaths", message: "Missing required 'frozenAssetPaths' array" });
  } else {
    for (const assetPath of frozenAssets) {
      if (typeof assetPath !== "string") continue;
      const fullPath = path.resolve(kitPath, assetPath);
      if (!fs.existsSync(fullPath)) {
        errors.push({ field: "frozenAssetPaths", message: `Frozen asset not found: ${assetPath}` });
      }
    }
  }

  // Output standard
  const outputStandard = raw.outputStandard as Record<string, unknown> | undefined;
  if (!outputStandard || typeof outputStandard !== "object") {
    errors.push({ field: "outputStandard", message: "Missing required 'outputStandard' block" });
  } else {
    if (typeof outputStandard.type !== "string") {
      errors.push({ field: "outputStandard.type", message: "Missing required field 'outputStandard.type'" });
    }
    const requiredPaths = outputStandard.requiredPaths;
    if (!Array.isArray(requiredPaths)) {
      errors.push({ field: "outputStandard.requiredPaths", message: "Missing required 'outputStandard.requiredPaths' array" });
    } else {
      for (const reqPath of requiredPaths) {
        if (typeof reqPath !== "string") continue;
        const fullPath = path.resolve(kitPath, reqPath);
        if (!fs.existsSync(fullPath)) {
          errors.push({ field: "outputStandard.requiredPaths", message: `Required output path not found: ${reqPath}` });
        }
      }
    }
  }

  // Bundles
  const bundles = raw.bundles;
  if (!Array.isArray(bundles) || bundles.length === 0) {
    errors.push({ field: "bundles", message: "Missing or empty 'bundles' array" });
  } else {
    for (const bundleRef of bundles) {
      const ref = bundleRef as Record<string, unknown>;
      if (typeof ref.path !== "string") {
        errors.push({ field: "bundles[].path", message: "Bundle ref missing 'path' field" });
        continue;
      }
      const bundlePath = path.resolve(kitPath, ref.path as string);
      if (!fs.existsSync(bundlePath)) {
        errors.push({ field: "bundles[].path", message: `Bundle manifest not found: ${ref.path}` });
        continue;
      }

      // Validate bundle manifest
      try {
        const bundleRaw = JSON.parse(fs.readFileSync(bundlePath, "utf8")) as Record<string, unknown>;
        const bundleBlock = bundleRaw.bundle as Record<string, unknown> | undefined;
        if (!bundleBlock || typeof bundleBlock !== "object") {
          errors.push({ field: `bundle(${ref.id})`, message: "Bundle manifest missing 'bundle' block" });
        } else {
          if (bundleBlock.kitId !== kitId) {
            errors.push({
              field: `bundle(${ref.id}).kitId`,
              message: `Bundle kitId '${bundleBlock.kitId}' does not match kit id '${kitId}'`,
            });
          }
        }
        if (!bundleRaw.export || typeof bundleRaw.export !== "object") {
          errors.push({ field: `bundle(${ref.id}).export`, message: "Bundle manifest missing 'export' block" });
        }
      } catch {
        errors.push({ field: `bundle(${ref.id})`, message: `Bundle manifest at ${ref.path} is not valid JSON` });
      }
    }
  }

  return {
    valid: errors.length === 0,
    schemaVersion,
    kitId,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function loadResolvedBundledKit(
  assetRoot: string,
  catalogEntry: BundledKitCatalogEntry,
): ResolvedBundledKit {
  const manifest = parseManifest(assetRoot);
  const bundleManifest = parseBundleManifest(assetRoot, manifest, catalogEntry.defaultBundleId);
  const resolved = { catalogEntry, assetRoot, manifest, bundleManifest };
  validateBundledKit(resolved);
  return resolved;
}

export function validateBundledKitAssetRoot(
  assetRoot: string,
  input: { kitId: string; bundleId?: string },
): void {
  const catalogEntry: BundledKitCatalogEntry = {
    id: input.kitId,
    packageDirName: path.basename(assetRoot),
    defaultBundleId: input.bundleId ?? input.kitId,
    type: "worker",
    executionMode: "export",
    activationModes: ["export"],
  };
  loadResolvedBundledKit(assetRoot, catalogEntry);
}

function resolveBundledKit(kitId: string): ResolvedBundledKit {
  const catalogEntry = BUNDLED_KIT_CATALOG.find((entry) => entry.id === kitId);
  if (!catalogEntry) {
    throw new Error(
      `Unknown worker kit '${kitId}'. Available kits: ${BUNDLED_KIT_CATALOG.map((entry) => entry.id).join(", ")}`,
    );
  }

  const assetRoot = path.resolve(resolveBundledKitAssetsRoot(), catalogEntry.packageDirName);
  return loadResolvedBundledKit(assetRoot, catalogEntry);
}

// ---------------------------------------------------------------------------
// List / Inspect / Path / Download
// ---------------------------------------------------------------------------

function toListItem(resolved: ResolvedBundledKit): KitListItem {
  return {
    id: resolved.manifest.kit.id,
    version: resolved.manifest.kit.version,
    name: resolved.manifest.kit.name,
    description: resolved.manifest.kit.description,
    type: resolved.manifest.kit.type,
    executionMode: resolved.manifest.executionMode,
    activationModes: resolved.manifest.activationModes,
    bundleId: resolved.bundleManifest.bundle.id,
    bundleVersion: resolved.bundleManifest.bundle.version,
    briefType: resolved.bundleManifest.briefType,
  };
}

function resolveOutputPaths(resolved: ResolvedBundledKit, outDir?: string): KitDownloadResult & { outputRoot: string } {
  const outputRoot = resolveRequestedOutputRoot(outDir);
  const folderPath = path.resolve(outputRoot, resolved.bundleManifest.export.folderName);
  const zipPath = path.resolve(outputRoot, resolved.bundleManifest.export.zipFileName);
  return { outputRoot, folderPath, zipPath };
}

export function listBundledKits(): KitListItem[] {
  return BUNDLED_KIT_CATALOG.map((entry) => toListItem(resolveBundledKit(entry.id)));
}

export function inspectBundledKit(kitId: string, outDir?: string): KitInspectResult {
  const resolved = resolveBundledKit(kitId);
  const outputPaths = resolveOutputPaths(resolved, outDir);
  return {
    ...toListItem(resolved),
    entrypointPath: resolved.manifest.entrypoint.path,
    agentContractPath: resolved.manifest.agentContractPath,
    brandTemplatePath: resolved.manifest.brandTemplatePath,
    publicExampleBrandPaths: resolved.manifest.publicExampleBrandPaths ?? [],
    frozenAssetCount: resolved.manifest.frozenAssetPaths.length,
    requiredFrozenAssetCount: resolved.bundleManifest.requiredFrozenAssets.length,
    outputRoot: outputPaths.outputRoot,
    exportFolderName: resolved.bundleManifest.export.folderName,
    exportFolderPath: outputPaths.folderPath,
    exportZipName: resolved.bundleManifest.export.zipFileName,
    exportZipPath: outputPaths.zipPath,
    requiredPaths: resolved.manifest.outputStandard.requiredPaths,
    compatibility: resolved.manifest.compatibility as Record<string, unknown>,
    schemaVersion: resolved.manifest.schemaVersion,
  };
}

export function resolveKitPath(kitId: string, outDir?: string): string {
  const resolved = resolveBundledKit(kitId);
  return resolveOutputPaths(resolved, outDir).folderPath;
}

// ---------------------------------------------------------------------------
// ZIP builder
// ---------------------------------------------------------------------------

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosTimeParts(date: Date): { dosTime: number; dosDate: number } {
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

function buildStoredZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = [];
  const centralDirectoryParts: Buffer[] = [];
  let offset = 0;
  const { dosTime, dosDate } = toDosTimeParts(ZIP_TIMESTAMP);

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

function buildZipEntries(sourceRoot: string, exportFolderName: string): Array<{ name: string; data: Buffer }> {
  return listRelativeFiles(sourceRoot).map((relativePath) => ({
    name: path.posix.join(exportFolderName, relativePath),
    data: fs.readFileSync(path.resolve(sourceRoot, relativePath)),
  }));
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export function downloadBundledKit(kitId: string, outDir?: string): KitDownloadResult {
  const resolved = resolveBundledKit(kitId);
  const outputPaths = resolveOutputPaths(resolved, outDir);

  fs.mkdirSync(outputPaths.outputRoot, { recursive: true });
  fs.rmSync(outputPaths.folderPath, { recursive: true, force: true });
  fs.cpSync(resolved.assetRoot, outputPaths.folderPath, { recursive: true });

  const zipBuffer = buildStoredZip(
    buildZipEntries(outputPaths.folderPath, resolved.bundleManifest.export.folderName),
  );
  fs.writeFileSync(outputPaths.zipPath, zipBuffer);

  return {
    folderPath: outputPaths.folderPath,
    zipPath: outputPaths.zipPath,
  };
}
