/**
 * Runtime — Dynamic Registry Pipeline Extension
 *
 * Barrel export for the 5 linked submodules that extend growthub-local
 * so agents can discover, bind, assemble, validate, and execute CMS-backed
 * dynamic node pipelines locally using the same core primitives GH MAX
 * already uses in production.
 *
 * Submodules:
 *   1. hosted-execution-client  — CLI → hosted execution bridge
 *   2. cms-capability-registry  — CMS node primitive discovery
 *   3. dynamic-registry-pipeline — pipeline assembly & validation
 *   4. machine-capability-resolver — machine/user/org binding resolution
 *   5. artifact-contracts       — standardized pipeline output artifacts
 */

export {
  createHostedExecutionClient,
  HostedExecutionError,
  NoActiveSessionError,
  type HostedExecutionClient,
  type HostedExecuteWorkflowInput,
  type HostedExecuteWorkflowResult,
  type HostedProviderAssemblyInput,
  type HostedProviderAssemblyResult,
  type HostedProfile,
  type HostedCapabilityRecord,
} from "./hosted-execution-client/index.js";

export {
  createCmsCapabilityRegistryClient,
  CAPABILITY_FAMILIES,
  type CmsCapabilityRegistryClient,
  type CmsCapabilityNode,
  type CapabilityFamily,
  type CapabilityExecutionKind,
  type CapabilityQuery,
  type CapabilityRegistryMeta,
} from "./cms-capability-registry/index.js";

export {
  createPipelineBuilder,
  serializePipeline,
  deserializePipeline,
  type DynamicRegistryPipelineBuilder,
  type PipelineBuilderOptions,
  type DynamicRegistryPipeline,
  type DynamicRegistryPipelineNode,
  type PipelineExecutionMode,
  type PipelineValidationResult,
  type PipelineValidationIssue,
  type PipelineExecutionPackage,
  type SerializedPipeline,
} from "./dynamic-registry-pipeline/index.js";

export {
  createMachineCapabilityResolver,
  type MachineCapabilityResolver,
  type ResolvedCapabilityBinding,
  type MachineContext,
  type CapabilityResolutionResult,
} from "./machine-capability-resolver/index.js";

export {
  createArtifactStore,
  createArtifactManifest,
  type ArtifactStore,
  type CreateArtifactInput,
  type GrowthubArtifactManifest,
  type GrowthubArtifactType,
  type ArtifactExecutionContext,
  type ArtifactStatus,
  type ArtifactContentRef,
  type ArtifactQuery,
  type ArtifactStoreMeta,
} from "./artifact-contracts/index.js";
