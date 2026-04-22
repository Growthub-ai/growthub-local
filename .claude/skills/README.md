# Growthub Local — Claude Skills

This directory holds the Claude Code Skills used by agents working in `growthub-local`. Each skill is a single `SKILL.md` with YAML frontmatter (`name`, `description`) and a markdown body, and is invoked via the Skill tool when the user's intent matches the skill's description.

These skills are **environment-agnostic**. They never hardcode personal paths like `/Users/<name>/growthub-local/…`. Instead, they resolve the CLI through one of three entries in order — use the first that's available:

1. `growthub …` — installed public CLI
2. `node "$REPO/cli/dist/index.js" …` — branch-built dist
3. `bash "$REPO/scripts/demo-cli.sh" cli -- …` — tsx loader, no build required

where `REPO` is the repo root. This guarantees parity across a maintainer's laptop, a CI sandbox, and a fresh web session where only the source tree is present.

## Canonical mental model

`README.md` and `AGENTS.md` both anchor everything to the same user journey:

> repo / skill / starter / kit → governed local workspace → safe customization → safe sync → optional hosted authority

Every skill here plugs into that journey.

## Catalog

| Skill | Trigger | Anchors to |
|---|---|---|
| [`growthub-discover`](./growthub-discover/SKILL.md) | "open discover", enter the hub, reach any Growthub lane | `cli/src/index.ts` → `runDiscoveryHub`, `docs/CLI_WORKFLOWS_DISCOVERY_V1.md` |
| [`growthub-video-generation`](./growthub-video-generation/SKILL.md) | Run the one-true `video-generation` node with correct `refs[].dataUrl` bindings | `docs/CLI_WORKFLOWS_DISCOVERY_V1.md`, `cli/src/runtime/hosted-execution-client/` |
| [`growthub-cms-sdk-v1`](./growthub-cms-sdk-v1/SKILL.md) | Use `@growthub/api-contract` (CMS SDK v1) types, events, manifests, schemas | `packages/api-contract/`, `docs/CMS_SDK_V1.md`, `docs/CMS_SDK_V1_USER_GUIDE.md` |
| [`growthub-kit-fork-authority`](./growthub-kit-fork-authority/SKILL.md) | Register/heal forks and manage ed25519-signed authority attestations | `cli/src/commands/kit-fork.ts`, `cli/src/kits/fork-authority.ts` |
| [`growthub-t3code-harness`](./growthub-t3code-harness/SKILL.md) | T3 Code health, prompt, session, and generic Growthub profile primitive | `cli/src/commands/t3code.ts`, `cli/src/runtime/t3code/`, `cli/src/runtime/agent-harness/harness-profile.ts` |
| [`growthub-marketing-operator`](./growthub-marketing-operator/SKILL.md) | Dispatch marketing intents to the correct skill + framework + template | `cli/assets/worker-kits/growthub-marketing-skills-v1/` |

## When to use which

- **User wants to browse / pick anything interactively** → `growthub-discover`.
- **User wants a video generated from a local reference image** → `growthub-video-generation`.
- **User is building against types for workflow payloads, event streams, manifests, node schemas** → `growthub-cms-sdk-v1`.
- **User is tracking, healing, or attesting a forked worker kit** → `growthub-kit-fork-authority`.
- **User wants T3 Code CLI (health / prompt / session / profile)** → `growthub-t3code-harness`.
- **User is doing marketing work (CRO, SEO, content, email, launch, pricing)** → `growthub-marketing-operator`.

If multiple skills could apply, prefer the one that is the narrowest match for the user's stated outcome.

## Authoring rules (if you add a new skill here)

1. **One file per skill.** Path: `.claude/skills/<slug>/SKILL.md`. Slug is kebab-case; prefix with `growthub-` for repo-specific skills.
2. **Frontmatter is mandatory:**
   ```
   ---
   name: <slug>
   description: <plain-language trigger — what the user would ask for>
   ---
   ```
3. **Anchor to repo truth.** Link to the exact file paths in `cli/src/…`, `packages/…`, `docs/…`, or `cli/assets/worker-kits/…`. Do not restate CLI internals; link and summarize.
4. **Environment-agnostic.** Use `$REPO` and the 3-step CLI resolution above; never hardcode `/Users/<name>/…` paths.
5. **Sandbox-safe.** Work must not fail on missing `cli/dist` — always name the `bash scripts/demo-cli.sh cli -- …` fallback.
6. **No fabricated fallbacks.** If auth is required and missing, stop and ask. Don't simulate.
7. **Mirror public OSS when parity is needed.** For details like the public CLI binary shape, refer to what's already published under `@growthub/cli`.
8. **Narrow scope.** A skill should solve one clear class of problem. Prefer adding a new skill over widening an existing one.
9. **Additive only.** Never delete or rename sections in a way that breaks prior references without updating every caller.

## Canonical runtime control

For starting or stopping the local server referenced by these skills, always use the canonical runtime script (do not replace with a two-terminal dev loop in docs):

```bash
scripts/runtime-control.sh up-main
scripts/runtime-control.sh up-branch <branch>
scripts/runtime-control.sh up-pr <pr-number>
scripts/runtime-control.sh stop
scripts/runtime-control.sh status
scripts/runtime-control.sh url
```

Override port with `GH_SERVER_PORT` when needed.

## Telemetry

PostHog events are emitted by the CLI with safe properties only (no source, secrets, file contents, env vars, private URLs). Opt out with `GROWTHUB_TELEMETRY_DISABLED=true`. Named events referenced by these skills include `cli_first_run`, `discover_opened`, `skill_started`, `skill_completed`, `fork_registered`, `fork_sync_preview_started`, `fork_sync_heal_applied`, `authority_attested`, `authority_revoked`, `growthub_auth_connected`, `starter_import_repo`, `workspace_starter_created`, `kit_download_completed`, `import_failed`, `awaiting_confirmation_reached`.

## Out of scope

These skills are not a replacement for:

- the operator knowledge docs in `cli/assets/worker-kits/*/skills.md` (kit-internal behavior for worker operators)
- the implementation/migration plan in `docs/CMS_SDK_V1.md`
- the human-oriented validation guide in `docs/CMS_SDK_V1_USER_GUIDE.md`

They complement those by giving Claude Code a discovery-friendly, invokable entry to the same paths.
