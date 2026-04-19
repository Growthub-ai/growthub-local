# Growthub Substrate Roadmap

The v0.7.0 architecture is sealed. L1–L6 are production-stable. The fork
substrate quad is complete. The three strategic outcomes (agent-composed
environments, enterprise-managed fleets, offline cross-operator handoff) are
now structurally achievable without further substrate work.

This roadmap is about what you build ON the substrate — not more substrate.
Each item is a direct product consequence of the architecture that exists.

---

## 1 — Fork Bundle (the portable distribution unit)

The fork substrate quad (fork.json + policy.json + trace.jsonl + authority.json)
is a complete, verifiable description of an operator environment. Nothing today
packages these four files — plus the kit's frozen asset set — into a portable
artifact that a second operator can verify, import, and run from.

`growthub kit fork bundle export <fork-id>` produces a signed tarball. The
authority envelope inside it carries the capability set. The receiving operator
runs `growthub kit fork bundle import <bundle.tar.gz>`, which verifies the
envelope signature against their issuer registry and registers the fork. No
shared session. No shared server. Cryptographic verification from the artifact
alone.

This is the atomic distribution unit. Every item that follows uses it.

---

## 2 — Fork Handoff Protocol (peer-to-peer governed transfer)

The fork bundle (item 1) enables two operators to exchange environments. The
handoff protocol makes that exchange governed: the sender proposes custody
transfer, the receiver inspects the bundle's authority and policy before
accepting, and both operators' traces record the event.

`growthub kit fork transfer request <fork-id> --to <operator>` opens a transfer.
`growthub kit fork transfer accept <bundle>` completes it. The trace event
`custody_transferred` is appended on both sides.

Builds on item 1 because the bundle is the transport. The protocol adds
governance: explicit consent, both-party audit trail, authority re-attestation
at the moment of acceptance so the receiving operator's hosted plane signs the
fork's capability set under their identity.

What it unlocks: the cross-operator collaboration use case that v0.7.0 made
cryptographically possible is now accessible as a first-class operator workflow.

---

## 3 — Kit Registry (capability discovery at scale)

Right now kits are bundled locally (10 kits) or imported from GitHub repos or
skills.sh skills via Source Import. A first-party kit registry URL is the third
source type — a catalog of discoverable, forkable, composable capability units
that operators can pull without knowing the specific GitHub path.

`growthub kit search <query>` → scores against the registry catalog.
`growthub starter init --kit <registry-slug>` → Source Import pipeline against
a registry entry.

Builds on item 1 because the bundle format is the registry's distribution
artifact. Operators don't just discover kits — they receive them as verified
bundles that import the same way local forks do. The registry is a catalog of
forkable, authority-backed capability units.

What it unlocks: the kit ecosystem scales beyond 10 bundled kits. The operator
experience transitions from "pick from what's here" to "find what you need."

---

## 4 — Scheduled Fork Operations (self-managing environments)

The heal cycle, sync, and attestation renewal all require manual triggering.
At scale — enterprise fleets, operators with many forks, registry-sourced kits
that update frequently — manual triggers stop working.

A scheduled operations layer runs fork sync, drift detection, and authority
renewal on a configurable cadence. `policy.json` already carries
`remoteSyncMode: "off" | "branch" | "pr"` — this is the fork's declared intent
for when to run. Scheduled operations is the engine that executes that intent
without requiring the operator to type a command.

Builds on item 3 because the registry creates a class of kits that update
frequently. An operator who forks a registry kit needs their fork to track
upstream automatically, not manually. The scheduled layer turns the Self-Healing
Fork Sync Agent from a command the operator runs into a background process
that runs on their behalf.

What it unlocks: the Self-Healing Fork Sync Agent becomes genuinely autonomous.
`policy.json` becomes a live contract, not a configuration file that requires
manual invocation to take effect.

---

## 5 — Certified Workspace Commerce (the economic layer)

A workspace (multi-kit, pre-attested fork bundle) is now a complete, portable,
cryptographically-certified environment. The infrastructure to sell one is
already present: the authority envelope is the certificate, the bundle is the
artifact, the policy is the usage contract, the trace is the audit log.

What's missing is the commercial wrapper: a workspace listing on a marketplace,
a purchase that triggers bundle delivery, and an operator experience that goes
from "buy" to "running in a governed environment" in one step.

`growthub starter init --workspace <marketplace-slug>` → receives the pre-built
bundle → imports it → authority is re-attested under the buyer's identity → they
are running in a certified environment with a known capability set, auditable
history, and policy that the seller declared.

Builds on item 4 because certified workspaces that sell as products need to
self-manage. A customer who buys a workspace and never sees a manual sync/heal
command is a customer who sees a product, not a kit. Scheduled operations
(item 4) is what makes a purchased workspace feel like a product rather than
infrastructure.

What it unlocks: the operator's fork is now a commercial artifact. Capability
producers (kit authors, workspace builders) have a distribution channel. The
substrate becomes a platform with an economic layer.

---

## The compounding chain

```
fork bundle as atomic distribution unit    (item 1)
    ↓
governed peer-to-peer handoff protocol     (item 2)
    ↓
registry catalogs forkable capabilities    (item 3)
    ↓
scheduled operations make forks autonomous (item 4)
    ↓
workspace becomes a commercial product     (item 5)
```

None of these require new substrate primitives. The floor was sealed at
v0.7.0. Every item above is a product built on that floor.
