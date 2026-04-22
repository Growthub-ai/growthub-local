/**
 * CMS Capability Registry — Type Definitions (re-export shim)
 *
 * Canonical definitions live in `@growthub/api-contract/capabilities`.
 * This file is kept as an import alias so existing CLI imports continue
 * to work unchanged while the contract package is the source of truth.
 */

export type {
  CapabilityFamily,
  CapabilityExecutionKind,
  CmsNodeType,
  CmsVisibility,
  CmsExecutionBinding,
  CmsExecutionTokens,
  CmsCapabilityNode,
  CmsConnectorNode,
  CapabilityQuery,
  CapabilityRegistryMeta,
  CapabilitySource,
  CapabilityProvenance,
  HostedCapabilityRecord,
} from "@growthub/api-contract/capabilities";

export { CAPABILITY_FAMILIES } from "@growthub/api-contract/capabilities";
