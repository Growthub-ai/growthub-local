# Cross-Workspace Knowledge Orchestration Kernel Packet

Version: `v1`

This packet freezes the reusable primitive for cross-workspace knowledge orchestration: pipeline nodes that reference other workspaces, multi-workspace kit bundles, and a shared knowledge layer across the entire workforce.

Use it when you are:

- wiring a pipeline node that reads or writes knowledge from another workspace
- adding a new kit that bundles knowledge across multiple workspaces
- implementing or extending the post-run knowledge capture and sync flow
- connecting local knowledge bases to the hosted Growthub app knowledge layer

## Why This Packet Exists

The KB skill docs infrastructure (`kb_skill_docs`, `PaperclipSkillBundleV1`, `kb-skill-bundle`) is already stable in production and generates the knowledge artifacts that are core primitives for pipeline nodes and agent prompts. This packet extends that proven foundation in three additive directions without changing any existing contracts:

1. **Cross-workspace knowledge export/import** — a deterministic transport layer that serializes skill bundles and sends them to other local workspaces (identified by their workspace label or config path) or to the hosted Growthub app.
2. **Post-run knowledge capture** — every agent run can compound intelligence by appending structured knowledge items at the end of execution, writing to the local Postgres (Paperclip) DB and optionally syncing to the hosted app.
3. **Pipeline knowledge nodes** — `knowledge-export` and `knowledge-import` CMS-style node contracts that fit natively into the dynamic registry pipeline system.

## DB Duality — Local vs Hosted

- **Local runtime** (Paperclip) uses embedded Postgres (via `@paperclipai/db`, Drizzle) and stores `kb_skill_docs` per-company-id.
- **Hosted Growthub app** uses Supabase Postgres + Next.js Auth and stores knowledge in its own schema.
- The transport layer NEVER touches Supabase directly; it calls the existing hosted CLI endpoints (`/api/cli/profile`, `/api/providers/growthub-local/probe`) to relay knowledge items.

This duality is preserved throughout — no shared driver, no credential cross-contamination.

## Kernel Invariants

Every change in this domain must satisfy these invariants before merge:

- `KnowledgeSyncEnvelope` is schema-valid (Zod), signed with a `sha256` of content before transport
- All writes to local `kb_skill_docs` go through existing `createKbSkillDoc` / `updateKbSkillDoc` service functions — no direct table writes from transport layer
- Hosted knowledge relay uses only existing `hosted-client.ts` authenticated endpoints — no raw Supabase/BetterAuth calls anywhere in CLI
- `KnowledgeCaptureSummary` from native-intelligence is additive: it extends `ExecutionSummaryResult`, not replaces it
- Cross-workspace imports are idempotent: duplicate items (same `sha256` body) are silently skipped
- No CLI commands require the hosted session to be active for local-only workspace operations
- Post-run capture is opt-in via `--capture-knowledge` flag; default behavior is unchanged
- CI gates pass: `validate`, `smoke`, `verify`

## Surface Area Contract

Each new surface introduced by this packet follows the same shape as existing primitives:

### 1. Contract primitive
- `cli/src/runtime/knowledge-sync/types.ts` — `KnowledgeSyncEnvelope`, `WorkspaceKnowledgeRef`, `CrossWorkspaceKitBundle`, `KnowledgeSyncResult`

### 2. Transport primitive
- `cli/src/runtime/knowledge-sync/transport.ts` — serialize, deserialize, sign, verify envelope; local FS path resolution for sibling workspaces
- `cli/src/runtime/knowledge-sync/hosted-relay.ts` — relay envelope to hosted Growthub app via existing `hosted-client.ts` patterns

### 3. Post-run capture primitive
- `cli/src/runtime/knowledge-sync/capture.ts` — `captureAgentRunKnowledge`: reads artifacts + execution summary, produces structured `KbSkillDocPayload[]` items, writes to local DB via service functions

### 4. Pipeline node contracts
- `cli/src/runtime/knowledge-sync/pipeline-nodes.ts` — `KNOWLEDGE_EXPORT_NODE_CONTRACT` and `KNOWLEDGE_IMPORT_NODE_CONTRACT`: static `CmsCapabilityNode`-compatible objects for local pipeline assembly

### 5. Server route
- `server/src/routes/knowledge-sync.ts` — `POST /knowledge-sync/export` and `POST /knowledge-sync/import`: authenticated by existing board/agent bearer middleware; delegates to `kb-skill-docs` service functions

### 6. CLI command
- `cli/src/commands/knowledge.ts` — `growthub knowledge` hub with subcommands: `sync`, `export`, `import`, `capture`, `status`
- Registered under discovery hub via `registerKnowledgeCommands`

### 7. Shared bundle extension
- `packages/shared/src/kb-skill-bundle/cross-workspace.ts` — `buildCrossWorkspaceBundle`: combines skill bundles from multiple workspace refs into a single `KnowledgeSyncEnvelope`

### 8. Native intelligence extension
- `cli/src/runtime/native-intelligence/contract.ts` — additive `KnowledgeCaptureSummary` type extending `ExecutionSummaryResult`
- `cli/src/runtime/native-intelligence/capture-advisor.ts` — `adviseCaptureItems`: model-assisted (with deterministic fallback) suggestion of what to save from a run

## Packet Inputs

- workspace refs: labels, config paths, or `growthubWorkspaceLabel` from auth config
- run artifacts: `GrowthubArtifactManifest[]` from `artifact-contracts`
- execution summary: `ExecutionSummaryResult` from native-intelligence
- skill docs: `KbSkillDocPayload[]` from `kb-skill-docs` server service
- hosted session: `CliAuthSession` from `session-store` (optional — for hosted relay only)

## Packet Procedure

### P1. Contract + Type Freeze

- Create `cli/src/runtime/knowledge-sync/types.ts` with all envelope and ref types
- Create `packages/shared/src/kb-skill-bundle/cross-workspace.ts`
- Extend `packages/shared/src/types/` with `knowledge-sync.ts`
- All types are Zod-validated where they cross process boundaries

### P2. Transport Layer

- Create `cli/src/runtime/knowledge-sync/transport.ts`
- Create `cli/src/runtime/knowledge-sync/hosted-relay.ts`
- Create `cli/src/runtime/knowledge-sync/capture.ts`
- Create `cli/src/runtime/knowledge-sync/pipeline-nodes.ts`
- Create `cli/src/runtime/knowledge-sync/index.ts`

### P3. Server Route

- Create `server/src/routes/knowledge-sync.ts`
- Mount in `server/src/app.ts` under existing GTM/API prefix

### P4. CLI Command

- Create `cli/src/commands/knowledge.ts` with `registerKnowledgeCommands`
- Register in `cli/src/index.ts` within `registerSharedCommands`
- Add "Knowledge Sync" to the discovery hub options

### P5. Native Intelligence Extension

- Extend `cli/src/runtime/native-intelligence/contract.ts` with `KnowledgeCaptureSummary`
- Create `cli/src/runtime/native-intelligence/capture-advisor.ts`
- Export from `cli/src/runtime/native-intelligence/index.ts`

### P6. Deterministic Validation

Run:

```bash
node scripts/check-worker-kits.mjs
bash scripts/check-cross-workspace-knowledge-kernel.sh
bash scripts/pr-ready.sh
```

### P7. Release + Ship Confirmation

- Merge PR after checks are green
- Run release workflow (stable publish)
- Confirm npm remote versions match merged versions

## Files to Create (New)

| Path | Purpose |
|------|---------|
| `cli/src/runtime/knowledge-sync/types.ts` | All envelope, ref, and result types |
| `cli/src/runtime/knowledge-sync/transport.ts` | Local FS serialize/deserialize/sign |
| `cli/src/runtime/knowledge-sync/hosted-relay.ts` | Hosted relay via existing auth client |
| `cli/src/runtime/knowledge-sync/capture.ts` | Post-run knowledge capture primitive |
| `cli/src/runtime/knowledge-sync/pipeline-nodes.ts` | Static pipeline node contracts |
| `cli/src/runtime/knowledge-sync/index.ts` | Module re-exports |
| `cli/src/commands/knowledge.ts` | CLI command surface |
| `server/src/routes/knowledge-sync.ts` | Server API routes |
| `packages/shared/src/types/knowledge-sync.ts` | Shared Zod-validated types |
| `packages/shared/src/kb-skill-bundle/cross-workspace.ts` | Multi-workspace bundle builder |
| `cli/src/runtime/native-intelligence/capture-advisor.ts` | Model-assisted capture advisor |
| `scripts/check-cross-workspace-knowledge-kernel.sh` | Packet validation script |
| `docs/kernel-packets/KERNEL_PACKET_CROSS_WORKSPACE_KNOWLEDGE.md` | This packet |

## Files to Edit (Existing — Additive Only)

| Path | Change |
|------|--------|
| `packages/shared/src/kb-skill-bundle/index.ts` | Export `cross-workspace.ts` additions |
| `packages/shared/src/types/index.ts` | Export `knowledge-sync.ts` types |
| `cli/src/runtime/native-intelligence/contract.ts` | Add `KnowledgeCaptureSummary` type |
| `cli/src/runtime/native-intelligence/index.ts` | Export `capture-advisor.ts` |
| `cli/src/index.ts` | Register `registerKnowledgeCommands`, add discovery entry |
| `server/src/app.ts` | Mount `knowledgeSyncRoutes` |
| `docs/kernel-packets/README.md` | Add this packet to registry |

## Backwards Compatibility Guarantees

- All existing `kb_skill_docs` REST endpoints are unchanged
- All existing `PaperclipSkillBundleV1` types and builders are unchanged
- `appendPaperclipSkillsToPrompt` / `buildSkillsPromptAttachmentFromOrderedDocs` are unchanged
- Pipeline `assemble` / `validate` / `execute` commands are unchanged
- Existing `native-intelligence` provider interface is unchanged; `KnowledgeCaptureSummary` is additive
- `worktree.ts` DB/config isolation is unchanged; knowledge sync reads existing config to resolve sibling workspace paths

## Canonical Commands

```bash
growthub knowledge status
growthub knowledge export --workspace <label>
growthub knowledge import --workspace <label>
growthub knowledge capture --run-id <id>
growthub knowledge sync
bash scripts/check-cross-workspace-knowledge-kernel.sh
bash scripts/pr-ready.sh
```

## Definition Of Done

A cross-workspace knowledge change is done only when:

- packet validation script passes locally
- all new CLI commands appear in `growthub knowledge --help`
- `KnowledgeSyncEnvelope` roundtrips correctly (serialize → sign → verify → deserialize)
- local-only operations work without a hosted session
- hosted relay requires an active session and falls back gracefully when unavailable
- post-run capture writes correctly to `kb_skill_docs` via service functions
- pipeline node contracts are discoverable via the existing `createCmsCapabilityRegistryClient` mock
- no existing tests are broken
- PR checks are green
- merge lands in `main`
