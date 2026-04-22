---
name: growthub-worker-kits
description: Operate any Growthub worker kit safely using a uniform agent-agnostic workspace convention — resolve `${<KIT>_HOME}` env vars, run the kit's QUICKSTART, and invoke its operator skills. Use when the user asks to run, inspect, install, or work inside any worker kit (creative-strategist, geo-seo, postiz, twenty-crm, open-higgsfield, open-montage, ai-website-cloner, hyperframes, zernio, email-marketing, marketing-skills, custom-workspace).
---

# Growthub Worker Kits — Uniform Operating Pattern

This skill is the umbrella guidance for working inside any of the 12 worker kits shipped under `cli/assets/worker-kits/`. Use it to resolve workspace paths, pick the right per-kit operator skill, and run QUICKSTART steps without guessing.

Every kit is agent-agnostic — Claude is first-party (this is what Claude Code loads), but Cursor / Codex / Gemini / any harness can operate the same kit identically.

## Uniform workspace-path convention

Every kit that has a local fork / tool clone uses a `${<KIT>_HOME:-$HOME/<default-dir>}` env var as its workspace anchor. The default directory typically mirrors the upstream project name so `git clone` + `cd ~/<name>` is drama-free.

Never hardcode absolute paths in new work. Always resolve through the kit's env var with its `$HOME/<default>` fallback.

### Kit → env var → default directory

| Kit | Canonical env var | Legacy alias (still accepted) | Default directory | Upstream / tool |
|---|---|---|---|---|
| `creative-strategist-v1` | `CREATIVE_STRATEGIST_HOME` | — | `$HOME/creative-strategist` | Kit-local brands + templates tree |
| `growthub-geo-seo-v1` | `GEO_SEO_HOME` | `GEO_SEO_FORK_PATH` | `$HOME/geo-seo-claude` | [zubair-trabzada/geo-seo-claude](https://github.com/zubair-trabzada/geo-seo-claude) |
| `growthub-postiz-social-v1` | `POSTIZ_HOME` | `POSTIZ_FORK_PATH` | `$HOME/postiz-app` | [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app) |
| `growthub-twenty-crm-v1` | `TWENTY_HOME` | `TWENTY_FORK_PATH` | `$HOME/twenty` | [twentyhq/twenty](https://github.com/twentyhq/twenty) |
| `growthub-open-higgsfield-studio-v1` | `OPEN_HIGGSFIELD_HOME` | — | `$HOME/open-higgsfield-ai` | [Anil-matcha/Open-Higgsfield-AI](https://github.com/Anil-matcha/Open-Higgsfield-AI) |
| `growthub-open-montage-studio-v1` | `OPEN_MONTAGE_HOME` | `OPENMONTAGE_PATH` | `$HOME/OpenMontage` | OpenMontage upstream |
| `growthub-ai-website-cloner-v1` | `AI_WEBSITE_CLONER_HOME` | `AI_CLONER_FORK_PATH` | `$HOME/ai-website-cloner-template` | [JCodesMore/ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template) |
| `growthub-hyperframes-studio-v1` | `HYPERFRAMES_HOME` | `HYPERFRAMES_LOCAL_PATH` | `$HOME/hyperframes` | Custom workspace |
| `growthub-zernio-social-v1` | *(no workspace — hosted API)* | — | *(none — uses `ZERNIO_API_KEY`)* | [zernio.com](https://zernio.com) (hosted) |
| `growthub-email-marketing-v1` | *(no workspace — pure skill library)* | — | *(none)* | Kit-local |
| `growthub-marketing-skills-v1` | *(no workspace — pure skill library)* | — | *(none)* | Kit-local, derived from coreyhaines31/marketingskills |
| `growthub-custom-workspace-starter-v1` | `GROWTHUB_KIT_FORKS_HOME` | — | `$HOME/.growthub/kit-forks` (user-chosen) | Starter for user-defined workspaces |

Kit exports (from `scripts/export-worker-kit.mjs`): `$GROWTHUB_KIT_EXPORTS_HOME` → fallback `$HOME/growthub-worker-kit-exports`.

### Resolution snippet (copy-paste into agent logic)

```bash
# Example for geo-seo-v1
WORKSPACE="${GEO_SEO_HOME:-${GEO_SEO_FORK_PATH:-$HOME/geo-seo-claude}}"

# Example for postiz
WORKSPACE="${POSTIZ_HOME:-${POSTIZ_FORK_PATH:-$HOME/postiz-app}}"
```

Generic pattern:

```bash
WORKSPACE="${<KIT>_HOME:-${<KIT>_LEGACY_VAR:-$HOME/<default>}}"
```

Agents must always:

1. Resolve `WORKSPACE` via env var with fallback.
2. Test `[ -d "$WORKSPACE" ]` before running kit commands that expect the fork.
3. If missing, point the user at the kit's `setup/` script (e.g. `bash setup/clone-fork.sh`) rather than silently cloning in a random place.

## Per-kit skill routing

When the user's task maps to one of these kits, use the umbrella resolution above plus the kit-specific paths below. Each kit ships its own `skills.md`, `QUICKSTART.md`, and `workers/*/CLAUDE.md` which are the authoritative operator runbooks.

| Kit | Operator runbook | Skills library |
|---|---|---|
| `creative-strategist-v1` | `workers/creative-strategist/CLAUDE.md` | `skills.md` |
| `growthub-marketing-skills-v1` | `workers/marketing-operator/CLAUDE.md` | `skills.md` (dispatch table) — **see `growthub-marketing-operator` skill** |
| `growthub-geo-seo-v1` | `workers/geo-seo-operator/CLAUDE.md` | `skills.md` |
| `growthub-email-marketing-v1` | `workers/email-marketing-strategist/CLAUDE.md` | `skills.md` |
| `growthub-postiz-social-v1` | `workers/postiz-social-operator/CLAUDE.md` | `skills.md` |
| `growthub-twenty-crm-v1` | `workers/twenty-crm-operator/CLAUDE.md` | `skills.md` |
| `growthub-zernio-social-v1` | `workers/zernio-social-operator/CLAUDE.md` | `skills.md` |
| `growthub-open-higgsfield-studio-v1` | `workers/open-higgsfield-studio-operator/CLAUDE.md` | `skills.md` |
| `growthub-open-montage-studio-v1` | `workers/open-montage-studio-operator/CLAUDE.md` | `skills.md` |
| `growthub-ai-website-cloner-v1` | `workers/ai-website-cloner-operator/CLAUDE.md` | `skills.md` |
| `growthub-hyperframes-studio-v1` | `workers/hyperframes-studio-operator/CLAUDE.md` | `skills.md` |
| `growthub-custom-workspace-starter-v1` | `workers/custom-workspace-operator/CLAUDE.md` | `skills.md` |

Paths above are relative to the kit directory: `cli/assets/worker-kits/<kit-id>/…`.

## CLI entry for inspecting / installing kits

Use `growthub kit` subcommands (resolve entry per the three-step ladder: installed CLI → `cli/dist/index.js` → `scripts/demo-cli.sh cli`):

```bash
growthub kit list                           # list all kits with families
growthub kit list --family studio           # filter by family
growthub kit inspect <kit-id>               # inspect a specific kit
growthub kit download <kit-id>              # download the kit bundle
growthub kit path <kit-id>                  # print on-disk path
growthub kit validate <kit-id>              # validate kit manifest + required files
growthub kit families                       # list available families
```

For forked worker kits (tracking drift + heal + attestations), use the `growthub-kit-fork-authority` skill.

## Standard operating flow for ANY kit

1. **Resolve workspace** — build `WORKSPACE` per the table above.
2. **Read the operator runbook** — `workers/<operator>/CLAUDE.md` inside the kit.
3. **Read the skills library** — `skills.md` inside the kit.
4. **Check QUICKSTART prerequisites** — `QUICKSTART.md` lists mandatory env vars, clone steps, and runtime assumptions.
5. **Validate** — `growthub kit validate <kit-id>` before running any kit-specific script.
6. **Execute** — run the task per the kit's dispatch / workflow.
7. **Log to the brand / client kit** — each kit has a log-append step; don't skip it.

## Export convention

When packaging a kit for distribution:

```bash
# Default goes to $GROWTHUB_KIT_EXPORTS_HOME or $HOME/growthub-worker-kit-exports
node scripts/export-worker-kit.mjs <kit-id> --qa

# Explicit override
GROWTHUB_KIT_EXPORTS_HOME="$HOME/some/other/dir" \
  node scripts/export-worker-kit.mjs <kit-id>

# One-off override
node scripts/export-worker-kit.mjs <kit-id> --out /absolute/path
```

Exports are versioned, have frozen provenance metadata, and pass `growthub kit validate` before leaving the build step.

## Non-negotiable rules

1. Never hardcode `/Users/<name>/…` or `/home/<name>/…` inside kit docs, templates, or fixtures. Always use the kit's env var with a `$HOME/<default>` fallback.
2. Never mix two kits' workspaces — each kit has its own `${<KIT>_HOME}`.
3. Never rename a canonical env var without keeping the legacy one documented as an alias for at least one release.
4. Operator runbooks are agent-agnostic. When a CLAUDE.md file exists, it's the Claude-first-party loader — do not delete, rename, or hardcode Claude-only tools inside it.
5. When a kit is a pure skill library (no workspace), state that explicitly in responses and skip the workspace-resolution step.
6. Kit exports must honor `GROWTHUB_KIT_EXPORTS_HOME`.

## Success criteria

Working inside a kit is correct when:

1. Every path you wrote is expressed as `${<KIT>_HOME}/…` or `$HOME/<default>/…`, never as a machine-specific absolute path.
2. `growthub kit validate <kit-id>` passes.
3. The kit's operator runbook is referenced in the response (not restated, linked).
4. Any legacy env var is listed alongside the canonical `<KIT>_HOME` in any guidance you give the user, so their existing `.env` keeps working.
5. No Claude-specific directory name (e.g. `claude-workers/`) leaks into a kit that's meant to be agent-agnostic.

## Anti-patterns

- Hardcoding a user's machine path anywhere in kit docs, tests, or templates.
- Silently `git clone`-ing a fork outside the agreed workspace root.
- Renaming a canonical env var without documenting the alias.
- Skipping `growthub kit validate` before running kit-specific scripts.
- Treating Claude as exclusive — other harnesses must work identically.
