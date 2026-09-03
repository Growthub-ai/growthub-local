# @growthub/cli

## 0.14.30

### Patch Changes

- Adds a reusable, keyless Workspace control-plane ingress verifier to the
  exported custom-workspace starter. Customer proxies can authorize exact,
  short-lived Vercel OIDC identities on the narrow governed Workspace action
  allowlist while preserving their existing browser-session boundary and
  failing closed for unrelated routes, invalid claims, or incomplete trust
  configuration.
- Adds cryptographic allowlist tests, exported dependency metadata, deployment
  guidance, and frozen-asset coverage. No customer identity, credential, or
  bearer token is shipped in the starter.

## 0.14.28

### Patch Changes

- Adds the inference evidentiary backbone to the exported custom-workspace
  starter's governed control plane
  (`docs/INFERENCE_EVIDENTIARY_BACKBONE_V1.md`):
- Receipt DAG lineage: `parent_receipt_id`/`span_kind` on inference requests,
  Merkle child-receipt hashes on parent receipts, fail-closed
  `child_receipt_missing` when a declared child workflow call never ingests a
  receipt, executor binding headers on awaiting-tool-result turns, and a
  chained `receiptDag` across multi-step custom-model workflow variants.
- Signed cache envelopes: every completion-cache entry is HMAC-signed with a
  workspace/credential-derived key and carries model/adapter/schema/workflow
  identity plus a credential-bound `cache_version`; tampered, rotated, or
  epoch-invalidated entries are a MISS, never served. Governed invalidation
  supports exact-key tombstones, model/schema/workflow epoch bumps, and
  feedback-driven poisoning that marks the semantic neighborhood UNRELIABLE
  (`CACHE_BYPASS_POISONED`) with the correction receipt linked back.
- Multi-tier economic routing: `max_cost_cents` budget gating with a 50%
  local buffer, log-prob-derived confidence against `min_quality_score`,
  cloud quality-fallback capped by the remaining budget, honest
  `QUALITY_UNMET` flagging when fallback is unaffordable, and a
  `routing_decision` receipt block. Confidence is never fabricated: a runtime
  without log-probs reports `unavailable`/`UNVERIFIED`.
- Deterministic streaming redaction: an incremental FSM/regex middleware
  (SSN, email, phone, Luhn-validated cards) between the adapter stream and
  the client stream, with a boundary carry buffer so a match can never split
  across chunks; receipts carry offset+hash redaction events only, and the
  cache stores the redacted response exclusively.
- Inference manifest handshake: the tested draft run persists signed
  manifests (composite SHA over base model + allowed adapters + schema);
  `POST /api/workspace/workflow/publish` blocks with a field-level diff when
  the live API Registry identity drifted from the proven manifest, stores the
  manifests on the published row (publish-owned; PATCH-forgery is
  policy-blocked), and the gateway rejects a pool serving a different
  composite SHA at invocation time (`manifest_verified` in the receipt).
- Updates `@growthub/api-contract` to `1.7.0` for the lineage, cache
  envelope, routing decision, redaction, and manifest vocabulary.

## 0.14.27

### Patch Changes

- Adds the governed inference control plane to the exported custom-workspace
  starter and routes it through the existing custom-model `sandbox-run` lane.
- Adds verified base-GGUF and LoRA-GGUF identities, request-time adapter
  selection over supervised llama-server process pools, and receipts that bind
  the served alias and artifact SHA-256 values.
- Adds bounded exact completion caching, optional embedding-backed semantic
  caching, and native llama.cpp prompt-prefix reuse with explicit
  `HIT`/`MISS`/`COLD_START`/`BYPASS` evidence.
- Adds versioned JSON Schema enforcement and final AJV validation, with the
  full schema contract hash bound into the model-tag proof.
- Adds OpenAPI-backed tool-call validation and correlated, redacted tool-result
  continuation receipts; external execution remains owned by the governed API
  Registry/executor rather than llama.cpp.
- Adds W3C trace-context propagation and OTLP/HTTP span export while preserving
  workspace source-record receipts as the durable governance evidence.
- Adds prefill-, decode-, and unified-role pools plus phase evidence. Stock
  llama.cpp still performs both phases on the selected process because this
  release does not claim a stable native prefill-to-decode KV-state handoff;
  configurations that require native disaggregation fail closed.
- Updates `@growthub/api-contract` to `1.6.0` for the public inference request,
  response, and verification-receipt vocabulary.

## 0.14.16

### Patch Changes

- Adds the validated Agent Native Scheduler input profile to the exported Growthub Local workspace starter.
- Reuses the existing authenticated API Request thin bridge while exposing non-secret Codex task and timezone read-back through workspace and MCP views.
- Enables Codex only; Claude Code cloud and Gemini remain visible but disabled until separately validated.
- Ships the complete draft-to-scheduled image-generation QA evidence set and byte-first `--4:5` media guidance.

## 0.8.0

### Minor Changes

Adds the `growthub skills` command surface and the session-memory scaffold primitive. Everything is additive — no existing command, flag, or behaviour changes.

- **`growthub skills list [--json] [--root <path>]`** — enumerate every `SKILL.md` reachable from the cwd. Walks `.claude/skills/*`, `cli/assets/worker-kits/*/SKILL.md`, nested `<kit>/skills/*/SKILL.md`, and optional project-root `SKILL.md`.
- **`growthub skills validate [--json]`** — strict shape check: frontmatter bounds (`name` ≤ 64 chars, `description` ≤ 1024 chars), helper + sub-skill path existence, `selfEval.maxRetries` within recommended 1..10.
- **`growthub skills session init [--fork <path>] [--kit <id>] [--json]`** — seed `.growthub-fork/project.md` from the kit's `templates/project.md`. No-op on kits that do not ship the template. Traces a `skills_scaffolded` event when seeded inside a registered fork.
- **`growthub skills session show [--fork <path>] [--body] [--json]`** — print the session-memory head of a fork.
- **Discovery hub**: `📇 Skills Catalog` lane added under the existing Memory & Knowledge / Connect Growthub layout.
- **Greenfield + source-import**: `growthub starter init` and `growthub starter import-{repo,skill}` now scaffold `.growthub-fork/project.md` from the kit's `templates/project.md` when present. Additive trace event `skills_scaffolded`.
- **Fork trace**: new additive event types `skills_scaffolded` and `self_eval_recorded` in the `KitForkTraceEventType` union.
- **SDK pin**: `@growthub/api-contract` bumped to `1.2.0-alpha.1` — adds the `./skills` subpath export (`SkillManifest`, `SkillNode`, `SkillCatalog`, helper refs, sub-skill refs, `SkillSelfEval`, `SkillSessionMemory`, `SkillSource`, `SKILL_MANIFEST_VERSION`).

### Worker-kit primitive layer (v1.2)

Every worker kit under `cli/assets/worker-kits/*` now ships the six architectural primitives — `SKILL.md`, `templates/project.md`, `templates/self-eval.md`, `helpers/README.md`, `skills/README.md` — with the starter kit (`growthub-custom-workspace-starter-v1`) carrying the user-facing narrative doc at `docs/governed-workspace-primitives.md`. `scripts/export-worker-kit.mjs --qa` now asserts this shape on every exported kit.

Reference implementations land in `creative-strategist-v1`: `helpers/grep-hooks.sh` + `helpers/extract-muse-frames.sh` + `skills/frame-analysis/SKILL.md` (sub-skill pattern).

## 0.3.1

### Patch Changes

- Stable release preparation for 0.3.1
- Updated dependencies
  - @paperclipai/adapter-utils@0.3.1
  - @paperclipai/adapter-claude-local@0.3.1
  - @paperclipai/adapter-codex-local@0.3.1
  - @paperclipai/adapter-cursor-local@0.3.1
  - @paperclipai/adapter-gemini-local@0.3.1
  - @paperclipai/adapter-openclaw-gateway@0.3.1
  - @paperclipai/adapter-opencode-local@0.3.1
  - @paperclipai/adapter-pi-local@0.3.1
  - @paperclipai/db@0.3.1
  - @paperclipai/shared@0.3.1
  - @paperclipai/server@0.3.1

## 0.3.0

### Minor Changes

- Stable release preparation for 0.3.0

### Patch Changes

- Updated dependencies [6077ae6]
- Updated dependencies
  - @paperclipai/shared@0.3.0
  - @paperclipai/adapter-utils@0.3.0
  - @paperclipai/adapter-claude-local@0.3.0
  - @paperclipai/adapter-codex-local@0.3.0
  - @paperclipai/adapter-cursor-local@0.3.0
  - @paperclipai/adapter-openclaw-gateway@0.3.0
  - @paperclipai/adapter-opencode-local@0.3.0
  - @paperclipai/adapter-pi-local@0.3.0
  - @paperclipai/db@0.3.0
  - @paperclipai/server@0.3.0

## 0.2.7

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/shared@0.2.7
  - @paperclipai/adapter-utils@0.2.7
  - @paperclipai/db@0.2.7
  - @paperclipai/adapter-claude-local@0.2.7
  - @paperclipai/adapter-codex-local@0.2.7
  - @paperclipai/adapter-openclaw@0.2.7
  - @paperclipai/server@0.2.7

## 0.2.6

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/shared@0.2.6
  - @paperclipai/adapter-utils@0.2.6
  - @paperclipai/db@0.2.6
  - @paperclipai/adapter-claude-local@0.2.6
  - @paperclipai/adapter-codex-local@0.2.6
  - @paperclipai/adapter-openclaw@0.2.6
  - @paperclipai/server@0.2.6

## 0.2.5

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/shared@0.2.5
  - @paperclipai/adapter-utils@0.2.5
  - @paperclipai/db@0.2.5
  - @paperclipai/adapter-claude-local@0.2.5
  - @paperclipai/adapter-codex-local@0.2.5
  - @paperclipai/adapter-openclaw@0.2.5
  - @paperclipai/server@0.2.5

## 0.2.4

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/shared@0.2.4
  - @paperclipai/adapter-utils@0.2.4
  - @paperclipai/db@0.2.4
  - @paperclipai/adapter-claude-local@0.2.4
  - @paperclipai/adapter-codex-local@0.2.4
  - @paperclipai/adapter-openclaw@0.2.4
  - @paperclipai/server@0.2.4

## 0.2.3

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/shared@0.2.3
  - @paperclipai/adapter-utils@0.2.3
  - @paperclipai/db@0.2.3
  - @paperclipai/adapter-claude-local@0.2.3
  - @paperclipai/adapter-codex-local@0.2.3
  - @paperclipai/adapter-openclaw@0.2.3
  - @paperclipai/server@0.2.3

## 0.2.2

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/shared@0.2.2
  - @paperclipai/adapter-utils@0.2.2
  - @paperclipai/db@0.2.2
  - @paperclipai/adapter-claude-local@0.2.2
  - @paperclipai/adapter-codex-local@0.2.2
  - @paperclipai/adapter-openclaw@0.2.2
  - @paperclipai/server@0.2.2

## 0.2.1

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/shared@0.2.1
  - @paperclipai/adapter-utils@0.2.1
  - @paperclipai/db@0.2.1
  - @paperclipai/adapter-claude-local@0.2.1
  - @paperclipai/adapter-codex-local@0.2.1
  - @paperclipai/adapter-openclaw@0.2.1
  - @paperclipai/server@0.2.1
