# CMS Node Bridge — GrowthHub ↔ OpenMontage

This document describes the adapter layer that bridges GrowthHub CMS node outputs into the OpenMontage production pipeline.

---

## Overview

GrowthHub's CMS exposes video and image generation as hosted execution nodes. These nodes produce output URLs (video clips, images, audio) that can feed directly into OpenMontage's composition engine. The bridge is a **cognitive adapter** — the agent reads this mapping and applies it during pipeline execution. There is no code-level integration; the agent is the integration layer.

---

## Architecture

```
GrowthHub CMS                          OpenMontage
─────────────                          ───────────
                                       
CMS Capability Registry ──→ Agent discovers available nodes
       │                              
       ↓                              
CMS Node Execution ──→ Agent triggers hosted execution
       │                              
       ↓                              
Output URLs ──→ Agent feeds URLs as source assets
       │                     │
       ↓                     ↓
                    OpenMontage Pipeline Stage
                    (assets / edit / compose)
                             │
                             ↓
                    Remotion / FFmpeg Composition
                             │
                             ↓
                    Final Video Output
```

---

## CMS Capability Registry

The CMS capability registry (`cli/src/runtime/cms-capability-registry/`) exposes node primitives:

```typescript
interface CmsCapabilityNode {
  slug: string;                    // e.g., "video-generation"
  family: CapabilityFamily;        // "video" | "image" | "slides" | "text" | "data" | "ops"
  executionKind: string;           // "hosted-execute"
  executionBinding: {
    type: "mcp_tool_call";
    strategy: "direct" | "sequential-with-persistence" | "async_operation";
  };
  requiredBindings: string[];      // Provider keys needed
  outputTypes: string[];           // e.g., ["video_url", "image_url"]
  enabled: boolean;
}
```

The agent queries the registry to discover which nodes are available:

```
Query: { family: "video", enabledOnly: true }
Query: { family: "image", enabledOnly: true }
```

---

## Node Family → OpenMontage Stage Mapping

| CMS Family | Output Type | OpenMontage Stage | Integration |
|---|---|---|---|
| `video` | Video URL | `assets` | Download → source clip for composition |
| `image` | Image URL | `assets` | Download → scene image for Remotion animation |
| `text` | String | `script` | Direct use as script content |
| `slides` | Slide assets | `assets` | Scene images extracted from slides |

---

## Execution Flow

### 1. Discovery

Agent queries the CMS capability registry during Step 6 (provider selection):

```
Available CMS nodes:
- video-generation (family: video, hosted-execute)
- image-generation (family: image, hosted-execute)
```

### 2. Input Binding Preparation

For each scene that will use a CMS node, the agent prepares input bindings from the scene plan:

```
CMS Node: image-generation
Inputs: { prompt: "...", aspect_ratio: "16:9", style: "photorealistic" }
```

### 3. Hosted Execution

The agent triggers execution via the hosted execution client. Results include output URLs:

```
Result: { status: "completed", outputUrl: "https://cdn.growthub.ai/gen/abc123.png" }
```

### 4. Asset Integration

Output URLs are recorded in the asset tracking sheet and fed into the OpenMontage pipeline:

- **Video URLs** → downloaded as source clips → timeline assembly via FFmpeg or Remotion
- **Image URLs** → downloaded as scene images → animated composition via Remotion

### 5. Composition

OpenMontage handles all post-production:
- Scene ordering and timeline assembly
- Transition effects (crossfade, zoom, wipe)
- Audio mixing (narration + music)
- Subtitle burn-in (word-level timing)
- Color grading
- Final render to target platform spec

---

## When to Bridge vs When to Use Direct Providers

| Scenario | Recommendation |
|---|---|
| User has GrowthHub session, no direct API keys | Bridge via CMS nodes |
| User prefers unified GrowthHub billing | Bridge via CMS nodes |
| CMS node matches the required generation type | Bridge via CMS nodes |
| User has direct API keys and wants lower latency | Use direct providers |
| Required tool/model is not available as a CMS node | Use direct providers |
| Local-fork mode with full tool access | Use direct providers (faster) |

---

## Adapter Contract

The bridge adapter handles:

| Operation | Description |
|---|---|
| `DISCOVER_NODES` | Query CMS capability registry for available nodes |
| `PREPARE_BINDINGS` | Map scene plan inputs to CMS node input schema |
| `EXECUTE_NODE` | Trigger hosted execution and poll for results |
| `COLLECT_OUTPUTS` | Gather output URLs from execution results |
| `ROUTE_TO_PIPELINE` | Feed output URLs into the appropriate OpenMontage pipeline stage |

The agent performs all of these operations as part of the standard 10-step workflow. No separate adapter code is needed — the agent IS the adapter.
