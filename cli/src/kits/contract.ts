/**
 * Kit Contract Type System
 *
 * Canonical types for the Growthub Agent Worker Kit capability packaging system.
 *
 * A kit is a versioned capability bundle — a portable, deployable artifact that
 * owns its agent contract, workflow contract, assets, and execution assumptions.
 *
 * Schema versions:
 *   v1 — Original worker kit export schema (list, inspect, download, path)
 *   v2 — Capability packaging schema (adds type, execution mode, compatibility,
 *         install metadata, activation modes)
 */

// ---------------------------------------------------------------------------
// Kit capability taxonomy
// ---------------------------------------------------------------------------

export type KitCapabilityType = "worker" | "workflow" | "output" | "ui";

export type KitExecutionMode = "export" | "install" | "mount" | "run";

export type KitActivationMode = "export" | "install" | "mount" | "run";

// ---------------------------------------------------------------------------
// Compatibility
// ---------------------------------------------------------------------------

export interface KitCompatibility {
  cliMinVersion?: string;
  platformMinVersion?: string;
  requiredCapabilities?: string[];
}

// ---------------------------------------------------------------------------
// Install metadata (future logical install state)
// ---------------------------------------------------------------------------

export interface KitInstallMetadata {
  installable: boolean;
  scopeDefault?: "user" | "project";
  postInstallHint?: string;
}

// ---------------------------------------------------------------------------
// UI metadata (future UI surface registration)
// ---------------------------------------------------------------------------

export interface KitUIMetadata {
  icon?: string;
  color?: string;
  category?: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export interface KitProvenance {
  sourceRepo?: string;
  frozenAt?: string;
  frozenBy?: string;
  checksum?: string;
}

// ---------------------------------------------------------------------------
// Kit manifest — schema version 2
// ---------------------------------------------------------------------------

export type KitFamily = "studio" | "workflow" | "operator" | "ops";
export const KIT_FAMILIES: KitFamily[] = ["studio", "workflow", "operator", "ops"];

export interface KitIdentity {
  id: string;
  version: string;
  name: string;
  description: string;
  type: KitCapabilityType;
  family?: KitFamily;
  visibility?: string;
  sourceRepo?: string;
}

export interface KitEntrypoint {
  workerId: string;
  path: string;
}

export interface KitBundleRef {
  id: string;
  version: string;
  path: string;
}

export interface KitOutputStandard {
  type: string;
  description?: string;
  requiredPaths: string[];
}

export interface KitManifestV2 {
  schemaVersion: 2;
  kit: KitIdentity;
  entrypoint: KitEntrypoint;
  workerIds: string[];
  agentContractPath: string;
  brandTemplatePath: string;
  publicExampleBrandPaths?: string[];
  frozenAssetPaths: string[];
  outputStandard: KitOutputStandard;
  bundles: KitBundleRef[];
  executionMode: KitExecutionMode;
  activationModes: KitActivationMode[];
  compatibility: KitCompatibility;
  install?: KitInstallMetadata;
  ui?: KitUIMetadata;
  provenance?: KitProvenance;
}

// ---------------------------------------------------------------------------
// Kit manifest — schema version 1 (backward compat)
// ---------------------------------------------------------------------------

export interface KitManifestV1 {
  schemaVersion: 1;
  kit: {
    id: string;
    version: string;
    name: string;
    description: string;
    visibility?: string;
    sourceRepo?: string;
  };
  entrypoint: KitEntrypoint;
  workerIds: string[];
  agentContractPath: string;
  brandTemplatePath: string;
  publicExampleBrandPaths?: string[];
  frozenAssetPaths: string[];
  outputStandard: KitOutputStandard;
  bundles: KitBundleRef[];
}

// ---------------------------------------------------------------------------
// Union type — any supported manifest version
// ---------------------------------------------------------------------------

export type KitManifest = KitManifestV1 | KitManifestV2;

// ---------------------------------------------------------------------------
// Bundle manifest — schema version 2
// ---------------------------------------------------------------------------

export interface BundleIdentity {
  id: string;
  version: string;
  kitId: string;
  workerId: string;
}

export interface BundleExportSpec {
  folderName: string;
  zipFileName: string;
}

export interface BundleManifestV2 {
  schemaVersion: 2;
  bundle: BundleIdentity;
  briefType: string;
  publicExampleBrandPaths?: string[];
  requiredFrozenAssets: string[];
  optionalPresets: string[];
  export: BundleExportSpec;
  activationModes?: KitActivationMode[];
}

// ---------------------------------------------------------------------------
// Bundle manifest — schema version 1 (backward compat)
// ---------------------------------------------------------------------------

export interface BundleManifestV1 {
  schemaVersion: 1;
  bundle: BundleIdentity;
  briefType: string;
  publicExampleBrandPaths?: string[];
  requiredFrozenAssets: string[];
  optionalPresets: string[];
  export: BundleExportSpec;
}

export type BundleManifest = BundleManifestV1 | BundleManifestV2;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isManifestV2(manifest: KitManifest): manifest is KitManifestV2 {
  return manifest.schemaVersion === 2;
}

export function isManifestV1(manifest: KitManifest): manifest is KitManifestV1 {
  return manifest.schemaVersion === 1;
}

export function isBundleManifestV2(manifest: BundleManifest): manifest is BundleManifestV2 {
  return manifest.schemaVersion === 2;
}

// ---------------------------------------------------------------------------
// Normalization — lift v1 to v2 shape for uniform processing
// ---------------------------------------------------------------------------

export function normalizeManifest(manifest: KitManifest): KitManifestV2 {
  if (isManifestV2(manifest)) return manifest;

  return {
    schemaVersion: 2,
    kit: {
      ...manifest.kit,
      type: "worker",
    },
    entrypoint: manifest.entrypoint,
    workerIds: manifest.workerIds,
    agentContractPath: manifest.agentContractPath,
    brandTemplatePath: manifest.brandTemplatePath,
    publicExampleBrandPaths: manifest.publicExampleBrandPaths,
    frozenAssetPaths: manifest.frozenAssetPaths,
    outputStandard: manifest.outputStandard,
    bundles: manifest.bundles,
    executionMode: "export",
    activationModes: ["export"],
    compatibility: {},
    provenance: manifest.kit.sourceRepo ? { sourceRepo: manifest.kit.sourceRepo } : undefined,
  };
}

export function normalizeBundleManifest(manifest: BundleManifest): BundleManifestV2 {
  if (isBundleManifestV2(manifest)) return manifest;

  return {
    schemaVersion: 2,
    bundle: manifest.bundle,
    briefType: manifest.briefType,
    publicExampleBrandPaths: manifest.publicExampleBrandPaths,
    requiredFrozenAssets: manifest.requiredFrozenAssets,
    optionalPresets: manifest.optionalPresets,
    export: manifest.export,
    activationModes: ["export"],
  };
}

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface KitValidationError {
  field: string;
  message: string;
}

export interface KitValidationResult {
  valid: boolean;
  schemaVersion: number;
  kitId: string;
  errors: KitValidationError[];
  warnings: KitValidationError[];
}

// ---------------------------------------------------------------------------
// Supported schema versions
// ---------------------------------------------------------------------------

export const SUPPORTED_SCHEMA_VERSIONS = [1, 2] as const;

export const KIT_CAPABILITY_TYPES: readonly KitCapabilityType[] = [
  "worker",
  "workflow",
  "output",
  "ui",
] as const;

export const KIT_EXECUTION_MODES: readonly KitExecutionMode[] = [
  "export",
  "install",
  "mount",
  "run",
] as const;

export const KIT_ACTIVATION_MODES: readonly KitActivationMode[] = [
  "export",
  "install",
  "mount",
  "run",
] as const;
