---
name: growthub-kit-fork-authority
description: Register, inspect, heal, and attach hosted-authority attestations to forked worker kits via `growthub kit fork` and `growthub kit fork authority`. Use when the user asks to register a fork, check drift, heal a fork, or manage ed25519-signed authority envelopes and trusted issuers.
---

# Growthub Kit Fork + Fork Authority Protocol

Source of truth: `cli/src/commands/kit-fork.ts`, `cli/src/kits/fork-authority.ts`.

Docs: `docs/CMS_SDK_V1.md` references fork authority; `CHANGELOG` notes under v0.7.0 "Fork Authority Protocol — hosted attestations as explicit schema" (PR #99).

## Mental model

A **fork** is a customized worker kit directory that an operator tracks for sync/drift. A **fork-authority attestation** is an ed25519-signed envelope stored at `.growthub-fork/authority.json` inside the fork, which an operator can attach so downstream tooling treats the fork as hosted-blessed (trusted by a configured issuer).

Three attestation origins:

- `operator-local` — default, operator-local policy in effect
- `authority-attested` — signed envelope present, trusted issuer
- `authority-revoked` — envelope revoked locally

## Command surface — `growthub kit fork`

Top-level (registered in `cli/src/commands/kit.ts`; also available as alias `growthub kit fork-sync`):

| Command | Purpose |
|---|---|
| `growthub kit fork` | Interactive Fork Sync Agent hub |
| `growthub kit fork register <path>` | Register a fork directory for sync tracking |
| `growthub kit fork list` | List registered forks with drift + policy summary |
| `growthub kit fork status <fork-id>` | Detect drift, show policy evaluation, heal plan preview |
| `growthub kit fork heal <fork-id>` | Apply a safe non-destructive heal |
| `growthub kit fork jobs` | List background fork-sync jobs; watch / tail a job |
| `growthub kit fork history` | Export fork operation history from `trace.jsonl` |
| `growthub kit fork deregister <fork-id>` | Remove registration (does not delete the fork directory) |

## Authority subcommands — `growthub kit fork authority`

| Command | Purpose |
|---|---|
| `growthub kit fork authority status <fork-id>` | Show current authority attestation state |
| `growthub kit fork authority attest <fork-id> <envelope-path>` | Attach a signed authority envelope |
| `growthub kit fork authority revoke <fork-id>` | Revoke the local authority attestation |
| `growthub kit fork authority issuer list` | List trusted issuers from local registry |
| `growthub kit fork authority issuer add <issuer-id> <pubkey>` | Add or replace a trusted issuer |
| `growthub kit fork authority issuer remove <issuer-id>` | Remove a trusted issuer |

Local trust root lives alongside fork state under `$PAPERCLIP_HOME` (override with `PAPERCLIP_HOME` env). Never commit issuer secrets to the repo.

## Environment resolution

Use the first available entrypoint (`REPO` = repo root):

1. `growthub kit fork …`
2. `node "$REPO/cli/dist/index.js" kit fork …`
3. `bash "$REPO/scripts/demo-cli.sh" cli -- kit fork …`

## Standard register → status → heal flow

```bash
# 1. Register a fork directory
growthub kit fork register "/path/to/forked/kit"

# 2. Check drift and the heal plan preview
growthub kit fork status <fork-id>

# 3. Apply a safe non-destructive heal
growthub kit fork heal <fork-id>

# 4. Watch the job queue (if heal scheduled async work)
growthub kit fork jobs
```

## Standard attest → verify → revoke flow

```bash
# Trust the issuer first (local trust root)
growthub kit fork authority issuer add growthub-prod <base64-ed25519-pubkey>

# Attach a signed envelope issued by that issuer
growthub kit fork authority attest <fork-id> "/path/to/envelope.json"

# Verify attestation state
growthub kit fork authority status <fork-id>
# → authority-attested

# Later, revoke locally if needed
growthub kit fork authority revoke <fork-id>
```

## Authority envelope shape (referenced by `fork-authority.ts`)

An envelope is a JSON document with:

- issuer id (must match a trusted issuer in the local registry)
- signed payload binding the fork's identity to the attestation
- ed25519 signature
- timestamp + expiration

`hasAuthorityCapability()` downstream helpers gate trust on verified envelopes. Do not fabricate envelopes — the signature must verify against a trusted issuer's public key.

## Telemetry events (PostHog)

Emitted by the CLI during fork operations:

- `fork_registered`
- `fork_sync_preview_started`
- `fork_sync_heal_applied`
- `authority_attested`
- `authority_revoked`

Opt out with `GROWTHUB_TELEMETRY_DISABLED=true`. No source, secrets, or private URLs are sent.

## Non-negotiable rules

1. Work in a feature branch or worktree when editing fork contents — never directly on `main`.
2. Before destructive git operations inside a fork, run `bash scripts/guard.sh check-command "<command>"`.
3. Never trust an envelope whose issuer is not in the local trust root.
4. Do not auto-revoke when `status` reports `authority-attested` — confirm with the operator first.
5. Do not delete a fork directory via `deregister`; it only removes the registration.

## Success criteria

Fork management is complete when:

1. `growthub kit fork list` shows the fork with `drift: clean` (post-heal).
2. If authority is required, `growthub kit fork authority status <fork-id>` reports `authority-attested` with a trusted issuer.
3. `trace.jsonl` records the operations (inspect via `growthub kit fork history`).
4. Sync stability checks pass: `growthub profile pull` / `push` succeed and other forks remain synced.

## Anti-patterns

- Do not stack "corrective" heal passes — diagnose the root drift first.
- Do not hand-edit `.growthub-fork/authority.json`; use `authority attest` / `revoke`.
- Do not add issuers without an agreed rotation plan.
- Do not skip `status` before `heal`; preview first.
