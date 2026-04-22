# CMS SDK v1 — Phase 3: Schema-Driven Node Contracts on the Wire

**Status:** Shipped in this branch.

Phase 3 lifts today's hidden `input_template` / `output_mapping` metadata
onto formal `NodeInputSchema` / `NodeOutputSchema` payloads (frozen in
`@growthub/api-contract` v1) and makes one codepath drive every surface:
interactive CLI, non-interactive bindings, agent-native JSON, and hosted
execution dispatch.

---

## Intent

> "One renderer, one validator across CLI, hosted UI, harness, and agent.
> Every new node becomes immediately human-fillable and agent-operable
> with zero per-node adapter code."

Every `CapabilityManifest` produced by the Phase 2 envelope producer is
stamped with an `inputSchema` and `outputSchema` derived from the existing
`input_template` and `output_mapping`. Downstream surfaces no longer
branch on "have schema / don't have schema" — schemas are always present.

---

## What ships

### New runtime modules

```
cli/src/runtime/cms-node-contracts/
  schema-enrich.ts        # input_template → NodeInputSchema
  schema-validator.ts     # NodeInputSchema → ContractValidationResult
  schema-renderer.ts      # interactive | non-interactive | agent-json
  attachment-lift.ts      # UrlOrFileField → NodeInputAttachment
  bindings-store.ts       # fork-scoped saved bindings + drift
```

### Schema enrichment

Per-family heuristic table drives `providerNeutralIntent`:

- `prompt` / `negative-prompt` → long-text, `textarea`
- `seed` / `count` / `duration` → number
- `model` / `style` / `quality` → dropdown
- `api_key` → password
- `reference_image` / `reference_video` / `reference_audio` / `image_url` → `url-or-file`
- `document` / `attachment` / `pdf` → file

Output mapping maps to the v1 `NodeOutputFieldType` taxonomy (`text`,
`long-text`, `number`, `boolean`, `array`, `object`, `image`, `video`,
`slides`, `audio`, `file`, `unknown`).

### One validator, every surface

`validateAgainstSchema(schema, bindings, { requiredBindings })` returns a
`ContractValidationResult` that mirrors the existing CLI contract shape —
no surface needs to branch on validator source.

### One renderer, three modes

```ts
renderSchema(schema, {
  mode: "interactive" | "non-interactive" | "agent-json",
  seedBindings,
  nonInteractivePayload,
  interactivePrompt,
});
```

- `interactive` — drives a TTY prompt via an injected adapter (no UX deps in the module)
- `non-interactive` — merges a bindings JSON over defaults
- `agent-json` — emits the schema for agent planning and awaits a reply

### Pipeline-level validation

`validatePipelineAgainstSchemas(pipeline, manifestsBySlug)` pre-validates
every node's bindings against its manifest's `inputSchema` before
compilation. Missing schemas are skipped (additive-only rule preserved).

### Bindings store (personalization + versioning)

Saved bindings live inside the fork substrate:

```
<forkPath>/.growthub-fork/bindings/<slug>/<name>.json
```

Each record carries `schemaVersion`, `manifestFetchedAt`, `savedAt`, the
field values, and an optional note. Drift against a newer schema is
surfaced via `compareRecordToSchema(record, schema)`.

Cross-machine handoff rides the existing fork-sync agent — no new
transport.

---

## Sub-branch: `growthub workflow schema …`

Human surface and agent-native surface share one codepath. Every
subcommand honors `--json`, `--stdin`, `--bindings-file`, or `--agent-json`.

```bash
growthub workflow schema show   <slug> [--host <url>] [--json]
growthub workflow schema validate <slug> --bindings-file <path> [--host <url>] [--json]
growthub workflow schema fill   <slug> [--bindings-file <path>] [--stdin] [--agent-json] [--out <path>]
growthub workflow schema run    <slug> [--bindings-file <path>] [--stdin] [--host <url>] [--json]
growthub workflow schema save   <slug> --name <name> --fork <path> [--bindings-file <path>] [--note <note>]
growthub workflow schema load   <slug> --name <name> --fork <path> [--host <url>] [--json]
growthub workflow schema list   --fork <path> [--slug <slug>] [--json]
growthub workflow schema delete <slug> --name <name> --fork <path>
growthub workflow schema export <slug> --out <path> [--fork <path>] [--host <url>]
growthub workflow schema import <path> --fork <path> [--json]
```

### Command responsibilities

- `show` — render the schema card, or emit agent JSON.
- `validate` — bindings file vs. schema + required bindings; exit 0/1.
- `fill` — interactive prompt for humans, JSON-in for agents, file-out for both.
- `run` — validate → lift attachments → dispatch through hosted execution. Streams `ExecutionEvent` via the existing hosted execution client.
- `save` / `load` / `list` / `delete` — fork-local personalization.
- `export` / `import` — cross-team portable schema bundle (manifest + saved bindings).

---

## Composability and enterprise versioning

| Need | Primitive reused | How |
| --- | --- | --- |
| Caching | `~/.growthub/...` home convention | `config/manifest-home.ts` (new) |
| Cross-machine sync | `fork-sync-agent` protected-paths + additive apply | `manifest.json` + `bindings/` become additional synced artifacts |
| Versioning | `API_CONTRACT_VERSION` + envelope `fetchedAt` + `.prev` rotation | Drift report is the version diff |
| Re-sharing | Fork substrate + export/import bundle | `schema export` / `schema import` write through existing fork transport |
| Audit | `trace.jsonl` append-only | New lifecycle event strings |
| Multiple operators / machines | Fork as portable artifact | `manifest.json` + `bindings/` travel with the fork |
| Offline-safe gating | Fork Authority Protocol (`authority.json`) | `Entitlement` / `GatedCapabilityRef` from `api-contract/profile` (tracked; deferred) |

---

## Agent parity

Every human subcommand has a JSON-native twin through one codepath:

- `workflow schema show <slug> --json` — agent reads the schema
- `workflow schema fill <slug> --agent-json` — agent gets the schema + seed
- `workflow schema run <slug> --stdin --json` — agent sends bindings, reads NDJSON

No adapter code per node. No parallel command tree for agents.

---

## Tests

- `schema-enrich.test.ts` — family heuristics, field typing
- `schema-validator.test.ts` — required / type / select / array, plus the
  exact video-duration / text-token / text-model cases from the v1 user guide
- `schema-renderer.test.ts` — all three modes
- `attachment-lift.test.ts` — url vs. path, missing files, non-file fields
- `bindings-store.test.ts` — save/load/list/delete round trip + drift preview
- `compile-schema-validation.test.ts` — pipeline-level validation

45 new tests, all green.

---

## What remains out of scope (v1 guardrails)

- No chat lane, environment management lane, or enterprise dashboard surfaces.
- No imperative local-extension runtime hooks — extensions stay declarative.
- No widening of hosted route topology.
- No rewrites of existing workflow / pipeline code paths — all additive.
