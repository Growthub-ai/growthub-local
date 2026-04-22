/**
 * Hosted Execution Client — Type Shim
 *
 * Phase 2 of CMS SDK v1: these types are now sourced from the public
 * `@growthub/api-contract` package. Local `Hosted*` aliases are preserved
 * so existing CLI consumers need no churn.
 *
 * Do not add new types here — extend the relevant `@growthub/api-contract`
 * module instead.
 */

export type {
  ExecuteWorkflowInput as HostedExecuteWorkflowInput,
  ExecuteNodePayload as HostedExecuteNodePayload,
  ExecuteWorkflowResult as HostedExecuteWorkflowResult,
  NodeResult as HostedNodeResult,
  ExecutionArtifactRef as HostedExecutionArtifactRef,
} from "@growthub/api-contract/execution";

export type {
  ProviderAssemblyInput as HostedProviderAssemblyInput,
  ProviderAssemblyResult as HostedProviderAssemblyResult,
  ProviderRecord as HostedProviderRecord,
} from "@growthub/api-contract/providers";

export type { Profile as HostedProfile } from "@growthub/api-contract/profile";

export type { CapabilityRecord as HostedCapabilityRecord } from "@growthub/api-contract/capabilities";
