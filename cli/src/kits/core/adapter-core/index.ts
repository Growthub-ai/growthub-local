/**
 * Fork Adapter Core — Barrel Export
 *
 * Single import surface for all adapter-core modules.
 * Import from here in factory definitions and validation runners.
 */

export type {
  ProviderOperationContract,
  EnvironmentGateContract,
  SetupPathContract,
  ForkInspectionContract,
  RuntimeSurfaceContract,
  OutputContract,
  ForkAdapterCoreConfig,
} from "./contracts.js";

export {
  parseEnvFile,
  runEnvGate,
  formatEnvGateResult,
} from "./env-gate.js";
export type { EnvGateResult } from "./env-gate.js";

export {
  validateSetup,
  validateEnvExample,
} from "./setup-validation.js";
export type { SetupValidationResult } from "./setup-validation.js";

export {
  resolveForkRoot,
  inspectFork,
  assertForkFileExists,
} from "./fork-inspector.js";
export type {
  ForkInspectionResult,
  ForkFileMetadata,
  ForkVerificationStatus,
} from "./fork-inspector.js";

export {
  validateProviderContract,
  buildMuapiProviderContract,
  buildProviderContract,
} from "./provider-adapter.js";
export type { ProviderAdapterValidationResult } from "./provider-adapter.js";

export {
  validateRuntimeSurfaceContract,
  buildStudioRuntimeSurfaceContract,
  formatSurfaceSelectionNote,
} from "./runtime-surface.js";
export type { RuntimeSurfaceValidationResult } from "./runtime-surface.js";

export {
  validateOutputContract,
  buildStudioOutputContract,
} from "./output-contract.js";
export type { OutputContractValidationResult } from "./output-contract.js";
