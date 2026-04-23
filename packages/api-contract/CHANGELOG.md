# @growthub/api-contract

## 1.2.0-alpha.1

Additive minor. Introduces the public Skill manifest surface used by the
CLI skill catalog, worker-kit `SKILL.md` entries, and the Claude Code
`.claude/skills/*` tree. Pure type-only; no existing export shape changes.

### Added

- `skills`: `SkillManifest`, `SkillNode`, `SkillCatalog`, `SkillHelperRef`,
  `SkillSubSkillRef`, `SkillSelfEval`, `SkillSessionMemory`, `SkillSource`.
- `SKILL_MANIFEST_VERSION` literal `1` sentinel.
- `./skills` subpath export in `package.json`.

### Architectural anchor

Every field beyond `name` and `description` is optional so the nine
existing `.claude/skills/*/SKILL.md` files and all new kit-level
`SKILL.md` files validate under a single contract:

- `helpers[]`  — safe-shell tool layer (primitive #6)
- `subSkills[]` — nested `skills/<slug>/SKILL.md` pointers (primitive #5)
- `selfEval`   — `criteria[]` + `maxRetries` (primitive #4)
- `sessionMemory` — default `.growthub-fork/project.md` (primitive #3)
- `mcpTools[]` — declarative MCP routing vocabulary (safe-action layer)

`SkillNode` projects a manifest onto the `CapabilityNode` shape so the
discovery hub can surface skills alongside capability rows using the same
consumer ergonomics.

## 1.0.0-alpha.1

Initial CMS SDK v1 contract package (Phase 1).

Type-only public surface that freezes the existing `growthub-local` CLI truth into one stable public contract. No runtime behavior.

### Added

- `capabilities`: `CapabilityFamily`, `CapabilityExecutionKind`, `CapabilityNode`, `CapabilityRecord`, `CapabilityQuery`, `CapabilityRegistryMeta`, `CAPABILITY_FAMILIES`, execution binding + tokens.
- `execution`: `ExecuteWorkflowInput`, `ExecuteWorkflowResult`, `ExecuteNodePayload`, `NodeResult`, `ExecutionArtifactRef`, status unions, summary.
- `providers`: `ProviderAssemblyInput`, `ProviderAssemblyResult`, `ProviderRecord`, `ProviderAssemblyHints`.
- `profile`: `Profile`, `ExecutionDefaults`, `Entitlement`, `GatedCapabilityRef`.
- `events`: `ExecutionEvent` union, per-event shapes (`node_start`, `node_complete`, `node_error`, `credit_warning`, `progress`, `complete`, `error`), `isExecutionEvent` guard.
- `manifests`: `CapabilityManifestEnvelope`, `CapabilityManifest`, `ManifestProvenance`, `ManifestDriftReport`, `CapabilityExecutionHints`.
- `schemas`: `NodeInputSchema`, `NodeOutputSchema`, `NodeInputField` union (text, long-text, number, boolean, select, array, json, url, file, url-or-file), `NodeInputAttachment`.
- `API_CONTRACT_VERSION` literal `1` sentinel.
