# Kit Standard — Free Claude Code Proxy v1

This document defines the locked contract for this kit.

---

## Required files contract

Every path in `kit.json -> frozenAssetPaths` must exist in every valid release.

---

## Bundle contract

The bundle manifest must remain aligned with `kit.json`:
- `bundle.kitId` matches `kit.id`
- `bundle.workerId` matches `entrypoint.workerId`
- `requiredFrozenAssets` stays a subset of `frozenAssetPaths`

---

## Agent operating rules

The entrypoint file (`workers/free-claude-code-operator/CLAUDE.md`) is the operating law. `skills.md` is the methodology.

Required invariants:
- Strict 9-phase workflow order (no phase may be skipped).
- Environment gate (Phase 0) must pass before any proxy skill runs.
- No routing config may be handed off without every routed model passing `/fcc-diag` live.
- Provider keys never appear in kit outputs, templates, examples, or the runbook.
- Default proxy bind is `127.0.0.1`; public bind requires explicit operator-approved confirmation.
- Claude Code is never patched; this kit is drop-in via `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`.
- `server.py` inside the fork is never edited from this kit; upstream changes go through the fork's own PR flow.

---

## Runtime rules

- No API keys or credentials are stored in kit files. Keys live only in `$FREE_CLAUDE_CODE_HOME/.env`.
- Fork path defaults to `$HOME/free-claude-code` but is overridable via `FREE_CLAUDE_CODE_HOME`.
- Proxy port defaults to `8082` but is overridable via `FREE_CLAUDE_CODE_PROXY_PORT`.
- All AI work is done by the local agent — no external service calls from this kit, only from the proxy.
- Outputs are Markdown files written to `output/<client-slug>/<project-slug>/`.
- Brand assets and customer data must not be committed to this kit.

---

## Versioning rules

Additive template / docs changes are minor-version work. Changes to the entrypoint path, fork URL, proxy port default, provider prefix set, or export name require a major version bump. The CLI compatibility minimum version in `kit.json` must be updated on every published kit version bump.

---

## Non-goals

This kit is **not**:

- A replacement for Anthropic's paid API for production workloads.
- A translator for Anthropic features the proxy cannot provide (e.g. Anthropic-specific tool-use shapes beyond OpenAI-compatible function calls).
- A billing / metering layer.
- A rate-limit coordinator across multiple machines.

It is a **governed local workspace** for operating a Claude-Code-compatible proxy safely on a single operator's machine.
