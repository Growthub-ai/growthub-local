/**
 * Hosted Execution Client — Type Definitions (re-export shim)
 *
 * Canonical definitions live in `@growthub/api-contract/execute` and
 * `@growthub/api-contract/capabilities`. This shim preserves the CLI's
 * existing import paths.
 */

export type {
  HostedExecuteWorkflowInput,
  HostedExecuteWorkflowResult,
  HostedExecuteNodePayload,
  HostedNodeResult,
  HostedExecutionArtifactRef,
  HostedExecuteWorkflowSummary,
  HostedProviderAssemblyInput,
  HostedProviderAssemblyResult,
  HostedProviderRecord,
  HostedProfile,
  HostedProfileExecutionDefaults,
  ExecuteWorkflowStreamEvent,
  NodeStartEvent,
  NodeCompleteEvent,
  NodeErrorEvent,
  WorkflowStartEvent,
  WorkflowCompleteEvent,
  WorkflowErrorEvent,
} from "@growthub/api-contract/execute";

export type { HostedCapabilityRecord } from "@growthub/api-contract/capabilities";
