# CMS Node Manifest Registry

The CMS capability registry is the production-grade source of truth for which
CMS-backed node primitives are available to a given fork. It is:

- **Hosted-authoritative** — the hosted Growthub app publishes the canonical
  list via `GET /api/cli/capabilities`.
- **Locally cached** — the CLI persists the last-known-good manifest under
  `~/.paperclip/manifests/<host>.capabilities.json` so discovery works
  offline and the first call on a fresh shell is instant.
- **Locally extensible** — operators may register additional nodes inside
  `<forkPath>/.growthub-fork/capabilities/*.json`. These are merged into the
  view with local-overrides-hosted precedence and are always tagged with
  `provenance.source = "local-extension"`.
- **Drift-aware** — every envelope carries a deterministic `registryHash`
  that the CLI compares across refreshes; `growthub capability diff` prints
  added / removed / mutated slugs.

## Envelope

The hosted endpoint and the on-disk cache both use this shape
(`@growthub/api-contract/manifest`):

```ts
interface CapabilityManifestEnvelope {
  version: 1;
  meta: {
    sourceUrl: string;
    publishedAt?: string;
    fetchedAt: string;
    registryHash: string;           // sha256 over the sorted node list
    nodeCount: number;
    enabledCount: number;
    familyCounts: Partial<Record<CapabilityFamily, number>>;
    suggestedTtlSeconds?: number;
  };
  nodes: CmsCapabilityNode[];
  signature?: { algorithm: "ed25519"; publicKeyId: string; signature: string };
}
```

The hash is computed over the sorted node list with operator-scoped fields
(provenance, `enabled`) stripped, so a fork moved between machines does not
produce a new hash.

## Local extensions

Drop a file like this into `<forkPath>/.growthub-fork/capabilities/`:

```jsonc
{
  "version": 1,
  "active": true,
  "note": "Experimental veo-3 adapter for the in-house video team.",
  "node": {
    "slug": "video-gen-veo3-local",
    "displayName": "Veo 3 (local adapter)",
    "icon": "🎬",
    "family": "video",
    "category": "media_generation",
    "nodeType": "tool_execution",
    "executionKind": "provider-assembly",
    "executionBinding": { "type": "mcp_tool_call", "strategy": "async_operation" },
    "executionTokens": {
      "tool_name": "veo3_submit",
      "input_template": { "prompt": "", "aspectRatio": "16:9" },
      "output_mapping": { "videos": "$.artifacts[*].url" }
    },
    "requiredBindings": ["veo3.api_key"],
    "outputTypes": ["video"],
    "enabled": true,
    "experimental": true,
    "visibility": "authenticated"
  }
}
```

Then install it:

```bash
growthub capability register ./veo3.json
growthub capability list --family video
```

Local extensions are always tagged and their `provenance.filePath` points
back to disk so agents and operators can tell what's hosted vs what's local.

## Drift

```bash
growthub capability refresh   # rewrites cache, prints drift
growthub capability diff      # prints drift without touching interactive menus
growthub capability clear-cache
```

Drift severities: `none`, `node-added`, `node-removed`, `node-mutated`,
`hash-mismatch`.

## Production rules

1. The hosted manifest is the source of truth. Local extensions are
   advisory — the authority layer may still gate a local slug.
2. Provenance is never ambiguous: every rendered node carries its
   `source`, `manifestHash`, and (for local extensions) `filePath`.
3. Cache falls back to stale content when hosted is unreachable so
   discovery never fails closed.
4. The envelope hash is deterministic across machines; forks moved
   between operators do not produce false drift.
