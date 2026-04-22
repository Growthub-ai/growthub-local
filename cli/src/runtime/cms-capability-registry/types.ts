/**
 * CMS Capability Registry — Type Shim
 *
 * Phase 2 of CMS SDK v1: these types are now sourced from the public
 * `@growthub/api-contract` package. Local `Cms*` aliases are preserved so
 * existing CLI consumers need no churn.
 *
 * Do not add new types here — extend `@growthub/api-contract/capabilities`
 * instead.
 */

export type {
  CapabilityFamily,
  CapabilityExecutionKind,
  CapabilityQuery,
  CapabilityRegistryMeta,
  CapabilityNodeType as CmsNodeType,
  CapabilityVisibility as CmsVisibility,
  CapabilityExecutionBinding as CmsExecutionBinding,
  CapabilityExecutionTokens as CmsExecutionTokens,
  CapabilityNode as CmsCapabilityNode,
  CapabilityConnectorNode as CmsConnectorNode,
} from "@growthub/api-contract/capabilities";

export { CAPABILITY_FAMILIES } from "@growthub/api-contract/capabilities";
