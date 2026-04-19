# Growthub Substrate Roadmap

Derived from the v0.7.0 architecture. No arbitrary timelines — each item is a
direct prerequisite for the one that follows it. The sequence is load-bearing.

---

## Architecture ground truth at v0.7.0

Six co-designed merges sealed the substrate into a complete loop:

```
L1  Identity + credential relay         (#58, #60, #77)
L2  Typed composable primitives         (#61, #65, #71, #81, #83)
L3  Local intelligence + compute        (#64)
L4  Fork substrate quad                 (#87, #99)
       fork.json   identity
       policy.json operator contract
       trace.jsonl append-only history
       authority.json hosted attestation
L5  Agent-driven environment composition (#92, #97)
L6  Cryptographic capability gates       (#99)
```

The arch can now bear load. Every item below is a consequence of that fact,
not a new direction.

---

## The compounding sequence

### 1 — Authority Issuer Pairing (`growthub account connect`)

**What:** Wire the `growthub account connect` CLI command. Exchange the hosted
session token for an ed25519 issuer record. Write the issuer to
`~/.growthub/authority/issuers.json`. Issue the first `AuthorityEnvelope` for
every fork already registered on the operator's machine.

**Why this is first:** The `hasAuthorityCapability` gate is fully implemented
at L6 but permanently returns `false` because the issuer registry starts empty.
Every fork born through the Source Import pipeline is locked at
`origin: "operator-local"` forever. Closing this gap turns L6 from a
structural promise into a live gate. Nothing in items 2–8 activates without it.

**What it unlocks:** Items 2 through 8 all depend on a fork that can be
attested. This is the master key.

---

### 2 — Born-Attested Forks

**What:** At the end of `materializeImportPlan`, immediately request an
`AuthorityEnvelope` from the hosted plane and write `authority.json` before the
job completes. Forks are born already attested, not registered-then-pending.

**Depends on:** Item 1 — the issuer must be paired before the hosted plane can
produce a valid envelope.

**Why this compounds:** Every fork created from this point has a verifiable
capability set from birth. Downstream activation modes (item 3) can
unconditionally gate on `hasAuthorityCapability` without handling the
`operator-local` fallback path as a production concern.

---

### 3 — Kit Install Activation Mode (first runnable kit)

**What:** Implement the `install` activation mode for one kit — the natural
candidate is `growthub-custom-workspace-starter-v1` because it is already the
bootstrapping primitive. `growthub kit install <kit-id>` reads the kit manifest,
checks `hasAuthorityCapability("script-execution")` on the target fork, then
executes the kit's install entrypoint inside that fork's environment.

**Depends on:** Item 2 — `script-execution` capability must be live and
attestation-backed before any install entrypoint runs.

**Why this compounds:** Kits are currently `export`-only. Every `executionMode`
in the type system beyond `export` is dead code. Shipping `install` for one kit
proves the activation shape is correct, unlocks the remaining 9 kits by pattern,
and makes the L2 primitives load-bearing for real operator workflows rather than
just structured metadata.

---

### 4 — Fork Diff (heal plan as human-readable diff)

**What:** Add `growthub kit fork diff <fork-id>`. Run `detectKitForkDrift` and
`buildKitForkHealPlan` without applying anything. Render the plan as a
structured diff: protected paths, pending changes, user-modified files skipped,
remote sync intent.

**Depends on:** Item 3 — operators need real installed kits with real drift
before fork visibility becomes operationally meaningful rather than illustrative.

**Why this compounds:** The heal plan engine exists and runs, but operators
cannot inspect it before they commit to applying it. Adding visibility here
makes the Self-Healing Fork Sync Agent's decision surface legible at the moment
it matters most — just before a destructive write. It also forces the heal plan
serialization format to be stable, which item 5 depends on for audit.

---

### 5 — Enterprise Issuer Registration

**What:** Add `growthub authority add-issuer --kind enterprise --pubkey <path>
--org <name>`. Import an enterprise-controlled ed25519 public key into the
issuer registry. The operator's fork authority checks now validate against the
enterprise key, not just the hosted plane's key. The `enterprise-managed`
capability is unlocked as a first-class gate.

**Depends on:** Item 4 — enterprise operators managing fleets of installed,
drift-visible kits need their own issuance authority. Without stable,
inspectable fork state (item 4), enterprise governance has nothing concrete to
attest against.

**Why this compounds:** `AuthorityIssuerKind: "enterprise"` is already in the
type system. This is the implementation of a type that is already load-bearing
in the governance spec. It makes the hosted plane optional for operators who
need to own their key material, which is a structural requirement for regulated
industries.

---

### 6 — Fork Bundle (cross-operator handoff)

**What:** Add `growthub kit fork bundle export <fork-id>` and
`growthub kit fork bundle import <bundle.tar.gz>`. The export packages all four
quad files (`fork.json`, `policy.json`, `trace.jsonl`, `authority.json`) plus
the kit's frozen asset set into a signed tarball. The import verifies the
envelope signature against the receiving operator's issuer registry before
registering.

**Depends on:** Item 5 — enterprise issuers make the authority provenance in an
exported bundle trustworthy across org boundaries. Without enterprise key
support, a cross-operator bundle import degrades to a trust-on-first-use
pattern.

**Why this compounds:** Two operators with different orgs can now hand a fork to
each other and the receiver can verify — offline, from the artifact alone —
what the fork is allowed to do. This is the first primitive that makes
collaboration across operator boundaries a governed act rather than a file copy.

---

### 7 — Hosted Intelligence Backend

**What:** Implement `backendType: "hosted"` in
`cli/src/runtime/native-intelligence/provider.ts`. When the operator's machine
has no Ollama endpoint reachable, route the four intelligence flows (planner,
normalizer, recommender, summarizer) through the hosted plane's inference relay.
The same `NativeIntelligenceBackend` contract applies regardless of routing.

**Depends on:** Item 6 — operators who receive fork bundles from other orgs may
not have local GPU. Without hosted intelligence routing, the composition flows
that depend on the planner/recommender break silently for those operators.
Bundle portability (item 6) makes hosted intelligence a correctness requirement,
not just a convenience.

**Why this compounds:** Local compute was the original thesis (L3). Hosted
routing as a fallback closes the availability gap without changing the contract.
The operator's fork substrate — now installed, attested, enterprise-governed,
and transferable — is fully functional regardless of hardware. This is the step
that makes the system accessible to the operator segment without local GPUs,
which is most operators.

---

### 8 — Fleet Attestation Sweep

**What:** Add `growthub fleet attest --sweep`. Walk all registered forks across
all operator workspaces, read their `authority.json`, evaluate each against the
issuer registry, and surface a fleet-wide attestation report:
`attested | expired | revoked | operator-local | missing`. Include
`--re-attest` flag to batch-request renewal for expired envelopes via the
hosted plane or the enterprise issuer.

**Depends on:** Items 1–7 — the sweep is only operationally useful when forks
are genuinely attested (item 1–2), running real kit activation modes (item 3),
have inspectable drift state (item 4), may be enterprise-issued (item 5),
potentially imported from other operators (item 6), and may be running on
hosted inference (item 7). The sweep is the management surface for a substrate
that is now fully operational end-to-end.

**Why this is last:** Fleet-level visibility is the natural ceiling of a
complete loop, not a starting point. It reads real state from a real system. A
sweep over empty issuer registries, export-only kits, and `operator-local`
authority origins reports nothing actionable. Here, it reports the truth.

---

## The loop, completed

```
operator issues authority            (item 1)
    ↓
forks born already attested          (item 2)
    ↓
kits activate with capability gates  (item 3)
    ↓
drift becomes inspectable            (item 4)
    ↓
enterprise governs its own keys      (item 5)
    ↓
forks move across org boundaries     (item 6)
    ↓
compute availability gaps close      (item 7)
    ↓
fleet state is visible and managed   (item 8)
```

Each step is a direct consequence of the architecture already shipped. None
requires a new substrate primitive. The floor was sealed at v0.7.0.
