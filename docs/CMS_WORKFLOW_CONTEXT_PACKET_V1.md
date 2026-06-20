# CMS Workflow Context Packet — v1

The hand-authored worker-kit contract surfaces (`SKILL.md`, `CLAUDE.md`,
`runtime-assumptions.md`, helper scripts, output standards) work because they
give an agent a closed operating frame: a single read order, a fixed input
contract, hard production rules, explicit stop conditions. The
[custom workspace starter kit](../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/)
is the canonical reference.

CMS workflows have all the same primitives — capability manifests, agent
manifests, workflow graphs, node input/output schemas, knowledge bindings,
brand-kit bindings, workspace policy, fork session memory, fork trace — but
no equivalent operating frame. An agent starts with a pile of capabilities and
has to *infer* the operating procedure.

The **CMS Workflow Context Packet** is the generated equivalent of the
hand-authored kit operator contract for hosted CMS workflows.

It is composed entirely from existing primitives. Nothing new is invented.

## Mental model

| Worker kit (hand-authored)        | CMS workflow (generated)                  |
| --------------------------------- | ----------------------------------------- |
| `workers/<op>/CLAUDE.md` Role     | `packet.agent.role` + `operations`        |
| `Required startup` section        | `packet.startupSequence`                  |
| `runtime-assumptions.md`          | `packet.runtimeAssumptions`               |
| `Input contract` section          | `packet.nodes[*].inputSchema` projection  |
| `Output artifacts` section        | `packet.artifactPolicy`                   |
| `Non-negotiable production rules` | `packet.runtimeAssumptions` + `selfEval`  |
| `Troubleshooting`                 | `packet.stopConditions`                   |
| `Fork integration`                | `packet.workspace` + `traceTail`          |
| `templates/self-eval.md` cycles   | `packet.selfEval` (`maxRetries: 3`)       |
| `templates/project.md`            | `packet.projectMd` (excerpted)            |

See the [universal kit contract](./WORKER_KIT_CONTRACT_V1.md) and
[skills + MCP discovery](./SKILLS_MCP_DISCOVERY.md) for the kit-side surface
the packet mirrors.

## CLI usage

```
growthub workflow context <workflowId> [--agent <slug>]
                                       [--workspace <path> | --fork-id <id>]
                                       [--trace-tail <n>]
                                       [--json] [--pretty] [--strict]
```

| Flag             | Default          | Purpose                                                                |
| ---------------- | ---------------- | ---------------------------------------------------------------------- |
| `--agent`        | auto-select      | Scope packet to a specific agent slug.                                 |
| `--workspace`    | `process.cwd()`  | Override the workspace path used to read fork policy and project.md.   |
| `--fork-id`      | —                | Resolve the workspace from a registered fork id (overrides workspace). |
| `--trace-tail`   | `20`             | Number of trace events to surface in `traceTail`.                      |
| `--json`         | TTY-dependent    | Emit the packet as JSON. Default for non-TTY stdout.                   |
| `--pretty`       | `false`          | Pretty-print JSON output (only meaningful with `--json`).              |
| `--strict`       | `false`          | Exit non-zero when an error-severity stop condition is present.        |

Exit codes:

| Code | Meaning                                                                     |
| ---- | --------------------------------------------------------------------------- |
| 0    | Packet emitted (with or without warn-severity stop conditions).             |
| 1    | Unrecoverable input error (missing workflow id, unknown fork id, etc.).     |
| 2    | `--strict` was set and the packet contains an error-severity stop condition. |

## Canonical packet shape

```json
{
  "version": 1,
  "kind": "cms-workflow-context-packet",
  "generatedAt": "2030-01-01T00:00:00.000Z",
  "workflow": {
    "id": "creative-video-pipeline-v1",
    "name": "Creative Video Pipeline",
    "executionAuthority": "gh-app",
    "executionMode": "hosted",
    "source": "hosted"
  },
  "agent": {
    "slug": "creative-strategist-v1",
    "role": "orchestrator",
    "operations": ["inspect", "configure", "bind-workspace", "execute"],
    "bound": true
  },
  "workspace": {
    "path": "/path/to/fork",
    "forkRegistered": true,
    "forkId": "creative-strategist-v1-fork-abc1",
    "kitId": "creative-strategist-v1",
    "policy": {
      "autoApprove": "additive",
      "remoteSyncMode": "off",
      "interactiveConflicts": true,
      "untouchablePaths": [],
      "confirmBeforeChange": ["package.json", "kit.json"],
      "allowedScripts": [],
      "autoApproveDepUpdates": "additive"
    }
  },
  "startupSequence": [
    "Read .growthub-fork/project.md (workspace memory)",
    "Read bound agent manifest under .growthub-fork/agents/",
    "Read saved workflow nodes and edges",
    "Read capability manifest cache for each node slug's input/output schema",
    "Read .growthub-fork/policy.json (workspace policy)",
    "Inspect bridge diagnostics on the bound agent",
    "Only then prepare an execution payload"
  ],
  "runtimeAssumptions": [
    "Hosted workflows execute under execution authority 'gh-app'",
    "Bridge bearer tokens are never exposed to browser or client surfaces",
    "Node inputs not declared in the manifest input schema must not be invented",
    "The workflow graph must not be mutated unless the operator was explicitly asked",
    "All material changes are appended to .growthub-fork/project.md and trace.jsonl"
  ],
  "nodes": [
    {
      "nodeId": "n1",
      "slug": "video-generation",
      "family": "video",
      "executionKind": "hosted-execute",
      "executionStrategy": "direct",
      "declaredBindings": { "prompt": "…", "brandKitId": "bk-1" },
      "requiredBindings": ["brandKitId"],
      "outputTypes": ["video"],
      "allowedInputs": ["prompt", "brandKitId", "referenceImages"],
      "providerHints": { "preferredProvider": "vertex" },
      "unknownSlug": false,
      "upstreamNodeIds": []
    }
  ],
  "bindings": {
    "knowledge": [],
    "brandKits": [],
    "variables": [{ "key": "video-generation.prompt", "value": "…", "scope": "node" }],
    "triggers": []
  },
  "capabilityRefs": [
    {
      "slug": "video-generation",
      "displayName": "Video Generation",
      "family": "video",
      "executionKind": "hosted-execute",
      "requiredBindings": ["brandKitId"],
      "outputTypes": ["video"],
      "manifestExcerpt": { "slug": "video-generation", "displayName": "Video Generation", "family": "video", "executionKind": "hosted-execute" }
    }
  ],
  "artifactPolicy": {
    "captureOutputs": true,
    "allowedArtifactKinds": ["image", "video", "pdf", "json", "text", "audio"],
    "viewerWidget": "artifact-viewer"
  },
  "selfEval": {
    "criteria": [
      "All node inputs match the declared input schema",
      "Required bindings are present on every node",
      "Outputs are captured as artifacts under the workspace artifact root",
      "A trace entry is appended after every material change",
      "Stop conditions reported by the packet have been resolved or acknowledged"
    ],
    "maxRetries": 3
  },
  "stopConditions": [],
  "traceTail": [],
  "projectMd": null,
  "sources": {
    "manifestEnvelope": { "kind": "cache", "fetchedAt": "…", "capabilityCount": 47 },
    "agent": { "kind": "local", "fetchedAt": "…", "bindingPath": "…/.growthub-fork/agents/creative-strategist-v1.json" },
    "savedWorkflow": { "kind": "hosted", "fetchedAt": "…" },
    "workspacePolicy": { "kind": "local", "path": "…/.growthub-fork/policy.json" },
    "projectMd": { "kind": "missing" },
    "trace": { "kind": "missing", "entryCount": 0 }
  }
}
```

## Source-of-truth primitives

The packet is composed from existing primitives only. It never invents data.

| Field                              | Source                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `workflow.*`                       | `cli/src/runtime/saved-workflows/index.ts` (hosted-first, local fallback) |
| `agent.binding`                    | `<workspacePath>/.growthub-fork/agents/<slug>.json`                      |
| `agent.manifest`                   | `cli/src/runtime/growthub-bridge-client/index.ts#inspectHostedAgentManifest` |
| `nodes[*].inputSchema`/`requiredBindings` | `@growthub/api-contract/manifests` capability projection           |
| `workspace.policy`                 | `cli/src/kits/fork-policy.ts#readKitForkPolicy`                          |
| `projectMd`                        | `cli/src/skills/session-memory.ts#readSessionMemory`                     |
| `traceTail` (fork stream)          | `cli/src/kits/fork-trace.ts#tailKitForkTrace`                            |
| `sources.manifestEnvelope`         | `cli/src/runtime/cms-manifest-cache/index.ts#readManifestCache`          |

The `traceTail.stream` discriminator (`"fork"` vs `"pipeline"`) is reserved
for v1.x: today only fork trace is surfaced; pipeline-trace events
(`@growthub/api-contract/pipeline-trace`) will land additively when a hosted
trace endpoint is wired in.

## Stop conditions

| Code                            | Severity | Meaning                                                          |
| ------------------------------- | -------- | ---------------------------------------------------------------- |
| `workflow-not-found`            | error    | Workflow id did not match any saved workflow.                    |
| `manifest-cache-missing`        | error    | No capability manifest cache on disk.                            |
| `manifest-cache-stale`          | warn     | Cached manifest is older than 24 h.                              |
| `bridge-auth-unavailable`       | error    | Authenticated bridge access is required and not present.         |
| `agent-not-bound`               | error/warn | Agent could not be resolved (or auto-select was ambiguous).    |
| `unknown-node-slug`             | error    | Saved workflow references a slug not in the manifest.            |
| `missing-binding`               | error    | Manifest's `requiredBindings` key is absent on the node.         |
| `schema-mismatch`               | warn     | Declared binding key is not in the manifest input schema.        |
| `execution-authority-mismatch`  | error    | Saved workflow and agent binding disagree on execution authority. |
| `workspace-not-governed`        | warn     | Workspace path is not registered as a kit fork.                  |

## Versioning

- **`v1.x`** — additive fields, additional stop-condition codes,
  additional runtime assumptions. Never breaking.
- **`v2`** — breaking changes to `kind`, the field set, or the meaning of
  any existing field. Bumps the `version` literal to `2`.

## Promotion criteria

The packet types live in `cli/src/runtime/cms-workflow-context/types.ts`
and are intentionally **not** part of `@growthub/api-contract` v1.

Promotion to the public SDK happens when:

1. Two real consumers exist outside the CLI (e.g. a hosted UI surface or
   an external harness) and operate against the packet.
2. Two consecutive `v1.x` releases ship without breaking changes.
3. The packet schema gains a runtime validator (zod or equivalent) under
   `packages/shared/src/validators/`.

Until then, treat the packet as an internal CLI emitter contract.

## Non-goals

- The packet does not execute, mutate, or invent data.
- The packet does not produce trace events (it only reads them).
- The packet does not fall back to ad-hoc heuristics when sources are
  missing — instead it surfaces a precise stop condition.
- The packet is not a replacement for hand-authored `CLAUDE.md` operator
  contracts in worker kits. Kits remain the source pattern; the packet is
  the generated equivalent for hosted CMS workflows.

## Related

- [`docs/WORKER_KIT_CONTRACT_V1.md`](./WORKER_KIT_CONTRACT_V1.md) — universal kit contract
- [`docs/SKILLS_MCP_DISCOVERY.md`](./SKILLS_MCP_DISCOVERY.md) — six-primitive discovery layer
- [`docs/CMS_SDK_V1.md`](./CMS_SDK_V1.md) — public api-contract surface
- [`docs/CMS_SDK_V1_USER_GUIDE.md`](./CMS_SDK_V1_USER_GUIDE.md) — practical usage
- [`docs/PIPELINE_KIT_CONTRACT_V1.md`](./PIPELINE_KIT_CONTRACT_V1.md) — multi-stage kits
- [`docs/PIPELINE_TRACE_CONVENTION_V1.md`](./PIPELINE_TRACE_CONVENTION_V1.md) — stage-boundary events
