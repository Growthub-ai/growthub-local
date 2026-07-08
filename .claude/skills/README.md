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
| [`growthub-auth`](./growthub-auth/SKILL.md) | Sign in, confirm identity, sign out; pre-flight guard before auth-gated skills | `cli/src/commands/auth-login.ts`, `cli/src/index.ts` (`auth` block) |
| [`growthub-cms-sdk-v1`](./growthub-cms-sdk-v1/SKILL.md) | Use `@growthub/api-contract` (CMS SDK v1) types, events, manifests, schemas | `packages/api-contract/`, `docs/CMS_SDK_V1.md`, `docs/CMS_SDK_V1_USER_GUIDE.md` |
| [`growthub-governed-mutation-loop`](./growthub-governed-mutation-loop/SKILL.md) | Operate a governed workspace as an agent: read → reason → preflight → governed hand-off → re-read; any workspace-config change, sandbox run, or workflow publish | `docs/GOVERNED_MCP_CONSOLE_V1.md`, `docs/OPERATING_THE_GOVERNED_UNIVERSE_V1.md`, `cli/src/commands/workspace-derivation-commands.ts` |
| [`growthub-causal-impact-analysis`](./growthub-causal-impact-analysis/SKILL.md) | "what breaks if I change this", blast radius, lineage, stale surfaces, patch impact before proposing any change | `cli/src/runtime/workspace-derivations.ts`, `docs/CAUSATION_ITT_ELIGIBILITY_DRIVERS.md`, the pure derivers in the starter kit `apps/workspace/lib/` |
| [`growthub-outcome-receipts-bootstrap`](./growthub-outcome-receipts-bootstrap/SKILL.md) | Start any governed-workspace session from the receipt ledger; recover from 422 `violations[]` via `repairPlan[]`; continue from `nextActions` / `rollbackRef` | `GET /api/workspace/agent-outcomes`, starter kit `apps/workspace/lib/workspace-outcome-receipts.js`, `AGENTS.md` §Agent Outcome Loop |
| [`growthub-workspace-helper`](./growthub-workspace-helper/SKILL.md) | Draft dashboards, widget layouts, API registry rows, and custom objects via the workspace helper endpoint; returns governed proposals for explicit review and apply | `apps/workspace/app/api/workspace/helper/`, `apps/workspace/lib/workspace-helper.js`, `packages/api-contract/src/helper.ts` |
| [`growthub-marketplace-provider`](./growthub-marketplace-provider/SKILL.md) | "add a marketplace provider/plugin", integrate a SaaS into the workspace marketplace, install products, provider icons, real-browser provider QA | `docs/MARKETPLACE_PROVIDER_PLAYBOOK_V1.md`, `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-add-ons.js`, `docs/OFFICIAL_MARKETPLACE_PLUGINS_V1.md` |
| [`growthub-workspace-template-export`](./growthub-workspace-template-export/SKILL.md) | "turn this workspace variant into a template", export a non-secret seeded config from a private repo, register a workspace template on the Discover/kit pathway, template export QA | `docs/WORKSPACE_TEMPLATE_GOLDEN_PATH_V1.md`, `scripts/export-workspace-seed-template.mjs`, `scripts/workspace-template-smoke.mjs`, `cli/src/commands/kit.ts` (`WORKSPACE_TEMPLATES`), `cli/src/starter/init.ts` (`applySeededConfig`) |
| [`oss-investigative-architecture`](./oss-investigative-architecture/SKILL.md) | "investigate this repo", source-of-truth architecture analysis, additive implementation planning against any repository's real contracts and extension points; sub-skill `governed-workspace-mutation` guards the two canonical workspace calls (`PATCH /api/workspace`, `POST /api/workspace/sandbox-run`) | `AGENTS.md` (source-of-truth order), `docs/GOVERNED_WORKSPACE_TOPOLOGY_V1.md`, `docs/SKILLS_MCP_DISCOVERY.md`, own read-only helpers (`helpers/map-surfaces.sh`, `helpers/find-contracts.sh`) |

## Core loop — every agent follows this order

1. `growthub-auth` → verify `auth whoami --json` before any auth-gated skill.
2. `oss-investigative-architecture` → recon the target tree before proposing changes (read-only helpers, source-of-truth order).
3. `growthub-outcome-receipts-bootstrap` → inside a governed workspace, read the receipt ledger before acting.
4. `growthub-causal-impact-analysis` → derive blast radius / lineage / patch impact for the intended change.
5. `growthub-governed-mutation-loop` → execute the change through the governed boundary (preflight → sanctioned route → re-read).
6. `growthub-cms-sdk-v1` → parse NDJSON events, validate manifests, type response shapes when working against hosted execution.

## When to use which

- **User needs to authenticate, check identity, or script auth with a token** → `growthub-auth`.
- **User is building against types for workflow payloads, event streams, manifests, node schemas** → `growthub-cms-sdk-v1`.
- **Agent is about to change anything in a governed workspace (config, sandbox run, workflow publish)** → `growthub-governed-mutation-loop`.
- **Agent needs to know what a change would affect before proposing it (blast radius, lineage, stale surfaces, readiness)** → `growthub-causal-impact-analysis`.
- **New session in a governed workspace, or a governed call was rejected (400/422/AppScope)** → `growthub-outcome-receipts-bootstrap`.
- **User wants dashboards / widgets / API rows / custom objects drafted as reviewable proposals** → `growthub-workspace-helper`.
- **User wants to add a new marketplace provider/plugin (or install products, provider icons, provider browser-QA)** → `growthub-marketplace-provider`.
- **User wants to convert a private workspace variant into a clean seeded template (or QA a template export end to end)** → `growthub-workspace-template-export`.
- **User wants an architecture investigation or an additive implementation plan grounded in a repo's actual source-of-truth (contracts, invariants, extension points)** → `oss-investigative-architecture`. Not prefixed `growthub-` because it operates on any target repository, not just this one.

Browser proof for any customer-visible claim follows the single canonical protocol in [`docs/BROWSER_PROOF_PROTOCOL_V1.md`](../../docs/BROWSER_PROOF_PROTOCOL_V1.md) — playbooks reference it instead of restating it.

If multiple skills could apply, prefer the one that is the narrowest match for the user's stated outcome.

## Uniform workspace-path convention (enterprise pattern)

Every worker kit that has a local fork / tool clone uses a single canonical env var: `${<KIT>_HOME:-$HOME/<default>}`. This is the pattern every agent should emit in any guidance it gives the user. Legacy env-var names (e.g. `<KIT>_FORK_PATH`) are still accepted by the setup scripts but are documented only as aliases. The canonical var per kit is declared by each kit's own docs under `cli/assets/worker-kits/<kit>/` and must not drift between kits. Kit exports (`scripts/export-worker-kit.mjs`) use the same shape: `${GROWTHUB_KIT_EXPORTS_HOME:-$HOME/growthub-worker-kit-exports}`.

## v1.2 primitive frontmatter fields (optional, additive)

Every skill here and every worker-kit `SKILL.md` now parses under a shared capability-agnostic contract: `@growthub/api-contract/skills::SkillManifest`. Beyond `name` and `description` (required), these optional fields are honoured by `growthub skills list` and `growthub skills validate`:

- `triggers[]` — plain-language phrases the user would say
- `progressiveDisclosure` — boolean (default true)
- `sessionMemory.path` — where the fork writes its cross-session journal (default `.growthub-fork/project.md`)
- `selfEval.{criteria[], maxRetries, traceTo}` — bounded generate → apply → evaluate → record loop; `maxRetries` defaults to 3
- `helpers[].{path, description}` — safe-shell tool layer, kit-relative paths
- `subSkills[].{name, path}` — nested `skills/<slug>/SKILL.md` lanes
- `mcpTools[]` — declarative MCP tool IDs for auth-heavy actions (vocabulary only at v1)

These fields are capability-agnostic — they apply equally to code, content, CRM, social, audit, and video work. Kit-specific specialisation (including EDL-per-cut for video kits) lives inside the kit's own `skills.md` operator runbook.

## Worker-kit SKILL.md vs. operator skills.md

Inside a worker kit (`cli/assets/worker-kits/<kit>/`) two files share the word "skill":

- `SKILL.md` (capital) — the **routing menu / discovery entry**. YAML frontmatter for Claude / Cursor / Codex catalogs, progressive-disclosure body. Part of the v1.2 primitive contract.
- `skills.md` (lowercase) — the **operator runbook** for humans and agents actually operating inside the kit. Unchanged from v1.

They are **different primitives**, not aliases. Never symlink one to the other.

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
