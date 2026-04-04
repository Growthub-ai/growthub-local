# Artifact versions — how to stay grounded

Agents and contributors **must not** treat version numbers in prose, chat logs, or old PR screenshots as authoritative.

## Single source of truth (in this repo)

| What | File | Field |
|------|------|--------|
| `@growthub/cli` semver | `cli/package.json` | `"version"` |
| Installer package semver | `packages/create-growthub-local/package.json` | `"version"` |
| Installer pin to CLI | `packages/create-growthub-local/package.json` | `dependencies["@growthub/cli"]` |

CI **`smoke`** already fails if the installer pin and `cli/package.json` **version** diverge.

Before you **state** a version in a PR description, issue comment, or internal note, **open those files on your branch / commit** and copy the values from disk.

## npm `latest` vs git `main`

- **`main`** (or your PR branch) shows **what will ship next** once released.
- **npm `latest`** shows **what installers last published**. Compare with the registry only when you care about end-user installs, not when quoting “the repo’s current semver”.

## PR description delta (no extra tooling)

When your change **ships npm artifacts**, the PR body should say so in plain language, for example:

- “Bumps `@growthub/cli` to **x.y.z** and aligns `create-growthub-local` + pin.”

That pairs the **mandatory PR description** (length and intent) with the **version delta** reviewers and agents can grep for — without embedding long-lived version numbers in unrelated markdown files that go stale.

## Internal / private notes

If you keep a gitignored runbook (see `docs/LOCAL_AGENTS.template.md`), **mirror only the fact** that versions live in `cli/package.json` and the installer manifest — do not paste credentials or private monorepo paths.
