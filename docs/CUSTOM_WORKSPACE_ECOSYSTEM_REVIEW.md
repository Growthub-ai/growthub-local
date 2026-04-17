# Custom Workspace Ecosystem — Review & Roadmap

Scope: `@growthub/cli` v0.4.2 + `create-growthub-local` v0.2.2. Grounded in the code
under `cli/src/kits/`, `cli/src/starter/`, `cli/assets/worker-kits/`, and
`docs/kernel-packets/`. No aspirational claims — everything below maps to a file
path or is explicitly called out as a gap.

---

## 1. What actually shipped — custom-workspace primitives

### 1.1 The starter is a real Vite kit, not a scaffold shell

`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/studio/` is a full
Vite 5 + React 18 app with `dev`, `build`, `preview`, and `serve` scripts. It
ships source only — no frozen `dist/` — so `growthub starter init --out <path>`
gives the user a runnable workspace after one `npm install && npm run build`.

The starter is registered in `cli/src/kits/catalog.ts` with
`family: "studio", executionMode: "export", activationModes: ["export"]` — it is
not special-cased. Any worker kit could follow the same path tomorrow.

### 1.2 Kit Factory + Fork Adapter Core are the real "super-powerful primitives"

Landed in commit `2a543a9`. Two modules, both small, both composable:

- `cli/src/kits/core/factory/` — `createStudioKitConfig`, `createWorkflowKitConfig`,
  `createOperatorKitConfig`, `createOpsKitConfig`, each producing a
  `ForkAdapterCoreConfig` with sensible defaults per family.
- `cli/src/kits/core/adapter-core/` — six contract validators:
  `ProviderOperationContract`, `EnvironmentGateContract`, `SetupPathContract`,
  `ForkInspectionContract`, `RuntimeSurfaceContract`, `OutputContract`, plus
  builders (`buildMuapiProviderContract`, `buildStudioRuntimeSurfaceContract`,
  `buildStudioOutputContract`) and parsers (`parseEnvFile`, `runEnvGate`).

These are the moving parts that turn "bundled directory" into "self-describing
unit with provider, env, setup, inspection, runtime, and output contracts."
Every kit family now reduces to picking a factory and overriding slots.

### 1.3 Kernel packet = three files in the fork, not a wire format

The on-disk state of a fork lives under `.growthub-fork/`:

- `fork.json`         — `KitForkRegistration` (forkId, kitId, path, createdAt)
- `policy.json`       — `KitForkPolicy` (untouchable paths, autoApprove,
                        remoteSyncMode, etc.)
- `trace.jsonl`       — append-only `KitForkTraceEvent` log

That triple is the "kernel packet" — the three files make the fork
self-describing and portable. The term is architectural metaphor (documented in
`docs/kernel-packets/`), not a runtime type.

### 1.4 Self-healing fork sync = detect → plan → apply, all policy-aware

`cli/src/kits/fork-sync.ts`:

- `detectKitForkDrift()` — read-only diff against the frozen upstream asset
  tree. Classifies critical paths (`kit.json`, `package.json`, `.env.example`),
  flags user-modified files, detects custom skills under `skills/`,
  `custom-skills/`, `custom/`, `agents/custom/`, `workflows/custom/`.
- `buildKitForkHealPlan()` — emits action list: `add_file`,
  `update_package_json_deps`, `patch_manifest`, `add_custom_skill`,
  `skip_user_modified`. Policy gates: `untouchablePaths` never touched,
  `confirmBeforeChange` requires approval, `autoApprove: "additive"` auto-runs
  only additive changes.
- `fork-sync-agent.ts` — foreground / background / dry-run execution; every
  checkpoint emits a trace event.

### 1.5 Native GitHub, no third-party SDK

`cli/src/github/client.ts` + `cli/src/integrations/github-resolver.ts` resolve a
token from (a) local PAT / device-flow result under `~/.growthub/github/` or
(b) the hosted Growthub bridge (credential minted on demand, never persisted).
The token is consumed for `createFork`, remote push (`growthub/heal-*` branch),
and draft PR open — `remoteSyncMode: "pr"`.

### 1.6 Service status is a real probe grid

`cli/src/commands/status.ts` runs 8 probes (10 with `--super-admin`), emits a
non-zero exit code on failure so CI can gate on it. Useful today.

---

## 2. Low-hanging fruit — highest value / immediate utility

Ordered by **ratio of user impact to implementation distance**, not by calendar.
Nothing here is UX polish; each item unlocks capability the primitives already
imply.

### 2.1 Finish the remote heal PR loop end-to-end

The policy flag `remoteSyncMode: "branch" | "pr"` exists, `createFork` +
`setOrigin` work, and the heal planner knows how to stage commits. What's
missing is a single verified path from `growthub kit fork heal --remote` to an
open draft PR against the user's upstream fork — with a rendered PR body that
inlines the drift report and the trace event IDs. Today the pieces exist; the
glue and the "one command, one PR" demo do not. High utility because it closes
the loop on the marketing claim ("one-click remote heal sync") and is almost
entirely wiring.

### 2.2 `growthub kit fork diff` as a first-class read-only verb

`detectKitForkDrift()` already produces everything needed for a unified diff
view per file + a dep-change table. Exposing it as its own command (separate
from `status` and `heal --dry-run`) gives users a safe, low-commitment way to
*just see* what changed upstream without engaging the heal flow at all. The
output can be rendered as a patch (machine-readable) or a summary (human).
Likely 30–80 LOC on top of the existing detector.

### 2.3 `policy doctor` — validate + explain the current fork's policy

Users who hand-edit `.growthub-fork/policy.json` will eventually produce
invalid combinations (`autoApprove: "all"` + `confirmBeforeChange: ["kit.json"]`
is inconsistent; globs with no matches silently do nothing). A `growthub kit
fork policy doctor <fork-id>` that validates the schema, resolves globs against
the actual tree, and prints *what would happen* for the next heal is the
fork-sync equivalent of `tsc --noEmit`. Uses only primitives already in
`fork-policy.ts`.

### 2.4 Trace log → exportable, queryable JSONL

`.growthub-fork/trace.jsonl` is already append-only and structured. Two
additions unlock it:

- `growthub kit fork trace <fork-id> [--since <iso>] [--type heal_applied]`
  — stream-filter the log. 40 LOC.
- A documented schema (each event type's `detail` shape) so external tools
  (Datadog, a dashboard, an LLM summarizer) can ingest it without reverse
  engineering. Purely documentation work; the events are already stable.

This turns the trace log from a forensic artifact into an operational feed.

### 2.5 Kit Factory: a `createKitFromManifest()` path

Today the four factories (`createStudioKitConfig`, `createWorkflowKitConfig`,
`createOperatorKitConfig`, `createOpsKitConfig`) are invoked by *kit authors in
TypeScript*. A third-party contributor who wants to add their own kit must
write a TS module and re-bundle the CLI. If the factories accepted a declarative
`kit.json` (schema v2 already has `family`, `executionMode`, `capabilities`),
the same contribution could land as a single JSON file. The validators are
ready; what's missing is the JSON → factory-args adapter.

### 2.6 `growthub starter init --from <existing-fork>` for upstream-drift reset

Right now, init only scaffolds from the bundled `growthub-custom-workspace-
starter-v1` kit. A variant that takes an existing (possibly drifted) fork and
re-initializes it against a newer upstream — preserving the custom-skills
detection logic — would give users a *nuclear option* heal: "regenerate my
workspace from scratch against new upstream, then re-apply my custom skills."
Composes existing functions (`copyBundledKitSource`, the custom-skill
detector). No new primitives required.

### 2.7 Fleet ops: aggregate drift for teams running N forks

`cli/src/commands/fleet.ts` exists but is minimal per the Explore pass. An
aggregate view — "you have 12 forks registered, 3 are drifted critical, 2 have
unresolved conflicts" — is cheap because each fork already self-describes. The
primitive is `forEach(registeredFork, detectKitForkDrift) → summarize`. The
value is visible the moment a single user (or team) has more than two forks.

### 2.8 Service status: JSON mode + probe selection

`growthub status` prints a grid. Adding `--json` (structured output) and
`--probe <name>` (run one probe) makes it scriptable — CI pipelines could gate
on "is the hosted bridge reachable" without running all ten probes. Trivial
change; unlocks automation.

### 2.9 Deterministic kit checksums published in manifest v2

`KitProvenance.checksum` already exists in schema v2 but is optional. Making it
required at bundle time (computed in `scripts/pr-ready.sh` or CI) lets the fork
sync agent *prove* its upstream baseline in every trace event. That turns
"trust me, this was the upstream" into "here's the hash that was frozen at
build time." Enables offline verification; prevents drift-confusion bugs.

### 2.10 A minimal "what's new upstream" prompt on `status`

When the CLI detects the installed version differs from the version the fork
was registered against, `growthub kit fork status <id>` should print a single
line: "upstream kit moved from v1.3.0 → v1.5.0; X files changed, Y dep bumps;
run `heal --dry-run` to preview." The version data is already in
`fork.json` + bundled kit manifest; this is just surfacing it.

---

## 3. Emergent behaviors, mental model, roadmap

### 3.1 What just happened — the pattern over the last few merges

Reading the commit stream `0724a34..52c82e6`, three shifts stack cleanly:

1. **From "bundle of kits" to "kit as a contract."** Schema v2 (`072b324`) +
   Kit Factory / Adapter Core (`2a543a9`) stopped treating kits as directory
   blobs and started treating them as typed, validated objects with declared
   provider, env, setup, runtime, and output contracts. The runtime can now
   reason about a kit without opening a single source file.

2. **From "clone the repo" to "fork one primitive."** The Custom Workspace
   Starter (`08184de`) + Fork Sync Agent (`710282f`, `93a9a7c`, `fa22eac`)
   collapsed the unit of customization from *the whole repo* to *one kit*.
   Every starter init produces a self-describing `.growthub-fork/` packet that
   is independently syncable, policy-gated, and audit-logged.

3. **From "bring your own auth" to "native integration with bridge."** Device
   flow + PAT + hosted bridge (`27d3770`, `93a9a7c`) made GitHub a first-party
   integration. The fork sync loop now has a credible remote push path without
   external SDK dependencies.

The **emergent property** is that these three shifts compose into something
none of them promised individually: *a fork can now describe itself, diff
itself against upstream, heal itself under a user-declared policy, and publish
the result to GitHub — all from commands that live in one CLI.*

### 3.2 The mental model

Think of the ecosystem as four concentric rings:

```
                                   ┌──────────────────────────────┐
                                   │  Fleet (many forks, N users) │
                                   │  status aggregation, drift   │
                                   │  summaries, agent-led heal   │
                                   └──────────────┬───────────────┘
                                                  │
                              ┌───────────────────▼───────────────────┐
                              │  Fork packet (per-kit, per-user)      │
                              │  .growthub-fork/{fork,policy,trace}   │
                              │  registered / syncable / auditable    │
                              └───────────────────┬───────────────────┘
                                                  │
                          ┌───────────────────────▼───────────────────────┐
                          │  Kit (schema v2 manifest + frozen assets)     │
                          │  capabilities, family, execution mode, bundle │
                          │  produced by Kit Factory, validated by        │
                          │  Adapter Core contracts                       │
                          └───────────────────────┬───────────────────────┘
                                                  │
                                  ┌───────────────▼───────────────┐
                                  │  Runtime (scripts/runtime-    │
                                  │  control.sh, server + ui)     │
                                  │  dev / status / url           │
                                  └───────────────────────────────┘
```

- **Runtime ring** is where the user actually runs code (`up-main`, `up-pr`).
- **Kit ring** is where something becomes reusable — manifest v2 makes it
  inspectable.
- **Fork packet ring** is where customization becomes durable without losing
  upgradability. This is the primitive that didn't exist six weeks ago.
- **Fleet ring** is where *teams* of forks become legible. This ring is
  sketched but not filled in.

Each outer ring depends on all inner rings being contract-stable. That's why
schema v2, the heal trace log, and the probe grid all showed up in the same
window — they're the stability commitments the outer rings need.

### 3.3 The thesis the code is making

> *A mature kit ecosystem is one where a user can fork any capability, declare
> how much of the future they're willing to accept automatically, and stay
> current without reading a diff.*

The primitives shipped make that possible for the first time. Earlier versions
of the CLI made you pick between *cloning upstream* (and losing your
customizations on every update) and *forking a copy* (and going stale). The
fork packet + policy + heal plan resolve that as a first-class mode.

Extended to agentic infrastructure: the policy is the *control plane*. A user
tells the fork packet "additive changes OK, touch my `skills/` at your peril,
push as draft PR, never force" — and the agent operates inside that contract.
The "done-for-you experience with full customization control plane" isn't a
slogan; it's literally what `policy.json` encodes.

### 3.4 Roadmap — grouped by readiness, not time

**A. Ready to ship (pieces exist, glue missing).**
Close the remote heal PR loop (2.1). Ship `fork diff` as its own verb (2.2).
Expose `status --json` / probe selection (2.8). Surface the "what's new
upstream" line (2.10). These are wiring tasks; every primitive is in the tree.

**B. Unlocks contributor leverage.**
`createKitFromManifest()` JSON path (2.5). Required deterministic checksums in
manifest v2 (2.9). The moment these land, a kit contribution is a pull request
to a single JSON file, not a TypeScript patch. That changes who can add a kit.

**C. Unlocks the fleet ring.**
Fleet aggregation view (2.7). Trace log export + documented schema (2.4). Once
trace events are ingestible, a dashboard becomes a reasonable next primitive
rather than a rewrite — every fork already emits the data.

**D. Unlocks agent autonomy.**
`policy doctor` (2.3). Starter `--from existing-fork` reset path (2.6). These
give the agent the confidence signals it needs to run unattended: "I can
validate the contract I'm operating under," and "I have a nuclear rebuild when
drift is too large to heal incrementally."

**E. Platform direction, not next ticket.**
- *Policy templates.* Today every fork gets the same seed. Over time, teams
  will want *named policies* ("strict", "permissive", "CI-safe") that kits
  can ship with and forks can adopt. The structure already supports this;
  distribution does not.
- *Kit marketplace signal, not catalog.* With manifest v2 + provenance +
  checksum, a remote index of community kits becomes possible. The CLI
  discovery menu becomes a client to that index rather than a hardcoded list.
  That is where the outer edge of the mental model points — and it is *not*
  close, because the trust and signing story isn't written yet.

### 3.5 Where to be careful

- **Kernel packet terminology.** Two meanings in use: (a) the three on-disk
  files in `.growthub-fork/`, (b) the architectural spec under
  `docs/kernel-packets/`. Treat the docs as the contract, the files as the
  runtime instance. Confusing the two will bite contributors.
- **"Additive" is load-bearing.** `autoApprove: "additive"` is the default and
  the reason unattended heal is safe. Any change that loosens "additive"
  semantics (e.g., auto-approving a file *replacement* that happens to be
  small) breaks the safety guarantee the whole policy model rests on.
- **Trace log is append-only by invariant, not by filesystem.** Nothing
  physically prevents a rogue process from rewriting `trace.jsonl`. If trace
  events ever become the basis for fleet billing or compliance, they need a
  hash chain or external sink. Today, fine; later, deliberate decision.

---

## References

- Starter: `cli/src/starter/init.ts`, `cli/src/commands/starter.ts`,
  `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/`
- Fork sync: `cli/src/kits/fork-sync.ts`, `cli/src/kits/fork-sync-agent.ts`,
  `cli/src/kits/fork-policy.ts`, `cli/src/kits/fork-trace.ts`,
  `cli/src/kits/fork-registry.ts`, `cli/src/kits/fork-types.ts`
- Kit factory + adapter core: `cli/src/kits/core/factory/`,
  `cli/src/kits/core/adapter-core/`
- Schema v2: `cli/src/kits/contract.ts`
- GitHub: `cli/src/github/client.ts`,
  `cli/src/integrations/github-resolver.ts`, `cli/src/kits/fork-remote.ts`
- Status: `cli/src/commands/status.ts`
- Catalog: `cli/src/kits/catalog.ts`
- Runtime: `scripts/runtime-control.sh`
- Kernel packet specs: `docs/kernel-packets/`
