# Growthub Substrate Roadmap

Derived from verified code audit against v0.7.0. Each item is a confirmed
absent implementation that is a direct prerequisite for the one that follows.

---

## What is already fully implemented (not roadmap items)

- Authority issuer registry: read/write/CRUD, ed25519 sign/verify (`fork-authority.ts`)
- Enterprise issuer add: `growthub kit fork authority issuer add --kind enterprise`
- Fork Sync Agent: drift detection, heal plans, apply, background jobs
- Source Import Agent: probe → security → plan → confirmation → materialize → fork registration
- `growthub auth login` / `auth logout` / `auth whoami`
- Fleet view/drift/drift-summary/policy/approvals/agent-plan

---

## The compounding sequence

### 1 — Hosted Plane Issuer Pairing (auto-populate registry on auth login)

**What's missing:** `growthub auth login` completes and writes a session token,
but the hosted plane has no endpoint that responds with an ed25519 public key
to auto-populate `~/.growthub/authority/issuers.json`. The comment in
`fork-authority.ts:27` marks this explicitly as future: `"future: via
\`growthub account connect\`"`. The issuer add command exists and the registry
infrastructure works — what's absent is the server route that generates/issues
a `growthub-hosted` issuer record and the CLI call that writes it after login.

**Why this is first:** `describePolicyAttestation` returns
`{ origin: "operator-local" }` when the registry is empty. Every fork sits
permanently at `operator-local` unless an operator manually runs the issuer add
command with a key they sourced themselves. The hosted-plane capability gate
(`hasAuthorityCapability`) is structurally complete but never activates in a
default operator environment.

**What it unlocks:** Attestation calls in item 2 have an issuer to sign against.

---

### 2 — Born-Attested Forks (materializeImportPlan writes authority.json)

**What's missing:** `materializeImportPlan` runs 10 steps — registers the fork,
writes `policy.json`, writes the trace, writes `source-import.json` — and
returns. It never imports or calls anything from `fork-authority.ts`. No
`authority.json` is written. Forks created through Source Import are born with
no authority state.

**Depends on:** Item 1 — a hosted issuer must be registered before the
materialization step can request a valid envelope to write.

**What it unlocks:** Forks born attested have a live capability set from the
start. The `script-execution` gate in item 3 can fire correctly on a fork that
was just created, not only on forks an operator manually attested after the
fact.

---

### 3 — Kit Install Activation Mode (first runnable kit)

**What's missing:** `KitExecutionMode` and `KitActivationMode` define
`"install" | "mount" | "run"` as valid values. Every kit manifest schema
accepts them. The service layer reads and exposes `activationModes` on list
and inspect results. There is no function anywhere in the codebase that
actually executes a kit's install entrypoint — no `execSync`, `spawnSync`, or
equivalent keyed off these modes. All 10 bundled kits are `export`-only at
runtime despite the type system being ready.

**Depends on:** Item 2 — install entrypoints need `script-execution` capability
gating. A fork born attested (item 2) can have that gate evaluated correctly
before anything runs.

**What it unlocks:** Kits become runnable, not just distributable. The worker
kit layer (L2) moves from structured metadata to actual operator infrastructure.
Items 4 and 5 both require real installed forks with real state to be useful.

---

### 4 — Fork Diff (heal plan as inspectable diff before apply)

**What's missing:** `detectKitForkDrift` and `buildKitForkHealPlan` are
implemented and called by the sync agent. There is no CLI command that runs
them in read-only mode and renders the result. `growthub kit fork diff <fork-id>`
does not exist. The `heal` subcommand applies immediately with a confirmation
prompt but does not show a structured render of what will change, what is
protected, and what user-modified files are being skipped.

**Depends on:** Item 3 — operators need real installed forks with real local
modifications before a diff surface has anything meaningful to show.

**What it unlocks:** Fork state becomes inspectable before it changes. This is
also a forcing function: it requires the heal plan serialization format to
stabilize, which item 5 depends on for the bundle format to be stable.

---

### 5 — Fork Bundle (signed cross-operator handoff)

**What's missing:** No command packages all four quad files (`fork.json`,
`policy.json`, `trace.jsonl`, `authority.json`) plus frozen assets into a
portable artifact, and no command imports and verifies one. The `kit download`
command exports a canonical kit zip but carries no fork-specific state. A fork
bundle is a different primitive: it captures a customized, attested fork
environment for transfer to another operator, who verifies the envelope
signature against their issuer registry before registering.

**Depends on:** Item 4 — portable forks need stable, inspectable internal state.
A bundle whose heal plan format can change arbitrarily after export is not
safely importable.

**What it unlocks:** Two operators with no shared session can hand a fork to
each other and the receiver can verify — offline, from the artifact alone —
exactly what the fork is authorized to do. Cross-org collaboration becomes a
governed act rather than a file copy.

---

### 6 — Hosted Intelligence Backend (backendType: "hosted" with real routing)

**What's missing:** `backendType: "hosted"` is read from config and preserved
through normalization. In `provider.ts` it only suppresses two Ollama-specific
fallback behaviors (`localhost:8080 → 11434` failover, `try-next-model` retry
logic). There is no hosted model endpoint URL, no hosted authentication, and no
code path that routes differently for hosted mode. An operator who sets
`backendType: "hosted"` gets a plain POST to whatever `config.endpoint` they
configured — no different from local mode with a custom URL.

**Depends on:** Item 5 — operators who receive fork bundles from other orgs may
not have a local Ollama instance. Without meaningful hosted routing, the
intelligence flows (planner, recommender, summarizer, normalizer) silently fail
for those operators, making fork portability incomplete.

**What it unlocks:** The full substrate — installed, attested, diff-visible,
portable forks — is functional regardless of local hardware. Operators without
local GPU are not second-class.

---

### 7 — Fleet Attestation Sweep

**What's missing:** `growthub fleet` registers six subcommands: `view`, `drift`,
`drift-summary`, `policy`, `approvals`, `agent-plan`. There is no `attest`
subcommand. No command walks all registered forks, reads their `authority.json`,
evaluates each against the issuer registry, and surfaces a fleet-wide authority
report. `growthub fleet drift` covers sync drift; authority state is invisible
at fleet scope.

**Depends on:** Items 1–6 — the sweep reports truth only when forks are
genuinely attested (items 1–2), running real activation modes (item 3), have
inspectable drift state (item 4), may be imported bundles from other operators
(item 5), and may be running on hosted intelligence (item 6). Before that, a
sweep over a default install reports only `operator-local` for every fork, which
is not actionable.

**What it unlocks:** Fleet-level authority visibility: `attested | expired |
revoked | operator-local | missing` per fork, with batch re-attestation as a
follow-on operation. The management surface for a substrate that is now fully
operational end-to-end.

---

## The loop

```
hosted plane issues issuer key on login      (item 1)
    ↓
forks born with authority.json attested      (item 2)
    ↓
kits activate with capability gates live     (item 3)
    ↓
fork drift is inspectable before apply       (item 4)
    ↓
forks move across org boundaries as bundles  (item 5)
    ↓
compute availability gaps close              (item 6)
    ↓
fleet authority state is visible + managed   (item 7)
```
