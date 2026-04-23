/**
 * @growthub/api-contract — public entry point (CMS SDK v1)
 *
 * One contract, many surfaces.
 *
 * This package freezes the existing growthub-local CLI truth into a
 * single stable public surface for capabilities, manifests, provider
 * assembly, execution payloads, streaming events, and hosted profile.
 *
 * Phase 1 of the CMS SDK v1 plan is intentionally type-only: CLI
 * imports can migrate onto these contracts without any runtime
 * behavior change.
 *
 * See individual modules for narrow imports:
 *
 *   - `@growthub/api-contract/capabilities`
 *   - `@growthub/api-contract/execution`
 *   - `@growthub/api-contract/providers`
 *   - `@growthub/api-contract/profile`
 *   - `@growthub/api-contract/events`
 *   - `@growthub/api-contract/manifests`
 *   - `@growthub/api-contract/schemas`
 */

// Capabilities
export type {
  CapabilityFamily,
  CapabilityExecutionKind,
  CapabilityNodeType,
  CapabilityVisibility,
  CapabilityExecutionStrategy,
  CapabilityExecutionBinding,
  CapabilityExecutionTokens,
  CapabilityRecord,
  CapabilityNode,
  CapabilityQuery,
  CapabilityRegistrySource,
  CapabilityRegistryMeta,
} from "./capabilities.js";
export { CAPABILITY_FAMILIES } from "./capabilities.js";

// Execution
export type {
  ExecutionMode,
  ExecuteNodePayload,
  ExecuteWorkflowInput,
  ExecuteWorkflowResult,
  WorkflowExecutionStatus,
  NodeExecutionStatus,
  NodeResult,
  ExecutionArtifactRef,
  WorkflowExecutionSummary,
} from "./execution.js";

// Providers
export type {
  ProviderStatus,
  ProviderRecord,
  ProviderAssemblyInput,
  ProviderAssemblyStatus,
  ProviderAssemblyResult,
  ProviderAssemblyHints,
} from "./providers.js";

// Profile
export type {
  PreferredExecutionMode,
  ExecutionDefaults,
  Entitlement,
  GatedCapabilityRef,
  Profile,
} from "./profile.js";

// Events
export type {
  ExecutionEventType,
  NodeStartEvent,
  NodeCompleteEvent,
  NodeErrorEvent,
  CreditWarningEvent,
  ProgressEvent,
  CompleteEvent,
  ErrorEvent,
  ExecutionEvent,
} from "./events.js";
export { isExecutionEvent } from "./events.js";

// Manifests
export type {
  ManifestOriginType,
  ManifestProvenance,
  CapabilityExecutionHints,
  CapabilityManifest,
  ManifestDriftMarker,
  ManifestDriftReport,
  CapabilityManifestEnvelope,
} from "./manifests.js";

// Schemas
export type {
  NodeInputUiHint,
  NodeInputProviderNeutralIntent,
  NodeInputExecutionModeHints,
  TextField,
  LongTextField,
  NumberField,
  BooleanField,
  SelectOption,
  SelectField,
  ArrayField,
  JsonField,
  UrlField,
  FileField,
  UrlOrFileField,
  NodeInputField,
  NodeOutputFieldType,
  NodeOutputField,
  NodeInputSchema,
  NodeOutputSchema,
  NodeInputAttachment,
} from "./schemas.js";

// Skills (primitive discovery surface — SKILL.md manifest, helpers,
// sub-skills, self-eval, session memory, MCP routing vocabulary)
export type {
  SkillHelperRef,
  SkillSubSkillRef,
  SkillSelfEval,
  SkillSessionMemory,
  SkillSource,
  SkillManifest,
  SkillNode,
  SkillCatalog,
} from "./skills.js";
export { SKILL_MANIFEST_VERSION } from "./skills.js";

// Version sentinel — surfaces may read this to confirm they are talking
// to the v1 contract surface. Additive changes keep this literal `1`.
export const API_CONTRACT_VERSION = 1 as const;
