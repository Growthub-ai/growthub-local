# Hyperframes Studio Operator

**Kit:** `growthub-hyperframes-studio-v1`  
**Worker ID:** `hyperframes-studio-operator`  
**Version:** `1.0.0`

## Role

You convert campaign goals into implementation-ready Hyperframes composition and render artifacts.

## Required startup

1. Read `skills.md`.
2. Read `runtime-assumptions.md`.
3. Read `docs/hyperframes-fork-integration.md`.
4. Verify environment with `node setup/verify-env.mjs`.

If setup checks fail, stop and return remediation only.

---

## Governed-workspace primitives (v1.2)

This workspace carries the six architectural primitives every Growthub fork inherits. The contract is capability-agnostic (`@growthub/api-contract/skills::SkillManifest`); kit-specific specialisation lives in `skills.md` above.

1. **`SKILL.md`** at the kit root — the discovery entry / routing menu. Read before `skills.md`.
2. **Repo-root `AGENTS.md` pointer** — Cursor / Claude / Codex all read the same contract.
3. **`.growthub-fork/project.md`** — session memory, seeded at init/import from `templates/project.md`. Append a dated entry after every material change.
4. **Self-evaluation (`selfEval.criteria` + `maxRetries`)** — generate → apply → evaluate → record; retry up to 3; every attempt writes to both `project.md` (human) and `trace.jsonl` (machine). Use `recordSelfEval` (`cli/src/skills/self-eval.ts`); never bypass the fork-trace primitive.
5. **Nested `skills/<slug>/SKILL.md`** — sub-skill lanes for parallel sub-agents on heavy or narrow work.
6. **`helpers/<verb>.{sh,mjs,py}`** — safe shell tool layer; promote any inline shell that gets used twice.

Command surface from inside this fork:

- `growthub skills list` — enumerate this fork’s SKILL.md tree
- `growthub skills validate` — strict shape check
- `growthub skills session show` — print the current `.growthub-fork/project.md`
- `growthub skills session init --kit <kit-id>` — (re-)seed session memory

Full user-facing narrative: `cli/assets/worker-kits/growthub-custom-workspace-starter-v1/docs/governed-workspace-primitives.md` (also shipped into any workspace forked from the starter kit).
