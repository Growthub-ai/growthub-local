# @growthub/api-contract

Growthub API v1 — canonical typed contract shared by the CLI, hosted server, and external adapter authors.

This package is the single source of truth for:

- **Capabilities** — `CmsCapabilityNode`, families, query types, provenance
- **Pipelines** — `DynamicRegistryPipeline`, validation, execution packages
- **Execution** — `HostedExecuteWorkflowInput/Result`, streaming event union
- **Provider** — `ProviderOperationContract`, required/optional operations
- **Manifest** — `CapabilityManifestEnvelope`, drift detection
- **Metrics** — registry / execution / policy / fleet / authority shapes
- **Routes** — canonical v1 path names and headers

## Why this exists

Before v1 these types lived in multiple places (`cli/src/runtime/**`, ad-hoc server DTOs). With v1 each type has exactly one home. The CLI, server, and external SDK packages all import from here.

## Stability

v1 is additive-only. Breaking changes ship as v2 in a new entry point.

## Usage

```ts
import type {
  CmsCapabilityNode,
  HostedExecuteWorkflowInput,
  CapabilityManifestEnvelope,
} from "@growthub/api-contract";

import { GROWTHUB_API_ROUTES } from "@growthub/api-contract/routes";
```
