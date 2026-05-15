# `helpers/` — safe shell tool layer (primitive #6)

A **helper** is a small, deterministic script an agent invokes via one shell call instead of reconstructing a raw pipeline inline. Helpers are:

- **Reviewable.** They live in the repo; diffs are inspectable.
- **Deterministic.** Pinned inputs and outputs; no hidden state.
- **Safer.** Agents call `bash helpers/<verb>.sh <args>` instead of re-assembling a 4-line `ffmpeg` / `grep` / `python` pipeline every session.

Helpers are **not** capability nodes, and they do not cross policy boundaries. Anything that requires auth, hosted execution, or network reach lives in the CLI (`growthub <verb>`) or in MCP routing — not here.

## Convention

```
helpers/
├── README.md                 # this file
├── <verb>.sh                 # short, single-purpose shell scripts
├── <verb>.mjs                # optional: Node-based helper when shell is too weak
└── <verb>.py                 # optional: Python-based helper for CSV / data work
```

Every helper ships with:

1. A one-line comment at the top: what it does + the one command that invokes it.
2. `set -euo pipefail` (or the language equivalent) — no silent failures.
3. A matching row in the parent `SKILL.md`'s `helpers[]` frontmatter array:
   ```yaml
   helpers:
     - path: helpers/grep-hooks.sh
       description: 3-pass hook-library search against the frozen 500-hook CSV
   ```
4. A matching entry in `skills.md` pointing to the helper at the place the agent should invoke it (no duplicated shell bodies).

## When to promote an inline snippet into a helper

Promote when any of these are true:

- The same snippet appears in `skills.md` more than once.
- The snippet has fragile quoting or path interpolation.
- The snippet calls a side-effecting binary (`ffmpeg`, `git`, `gh`, `osascript`, `npm install`).
- Multiple sub-skills invoke the same snippet.

## Baseline ships zero helpers on purpose

The starter kit carries the convention only. Individual worker kits (creative-strategist, hyperframes, video-use, etc.) populate `helpers/` with concrete scripts — those are the reference implementations. This keeps the baseline surface minimal and predictable.

## Reference helpers that ship with this kit

Two helper families ship with this kit because they are first-class governed primitives, not domain-specific shortcuts:

### Distillation Pipeline V1 (validated 1,550 harvested pairs → 18+ live 5/5 traces)

| Phase | Helper                                | What it does                                                                                                   |
|------:|---------------------------------------|----------------------------------------------------------------------------------------------------------------|
| 1     | `helpers/harvest-cursor-traces.mjs`   | Pair Cursor user/assistant turns into `raw-pairs.jsonl`. Squash-merge-to-main is the highest-signal heuristic. |
| 2     | `helpers/grade-raw-pairs.mjs`         | Route raw pairs through the live `critic-grader` sandbox row; emit graded-batch JSONL with `qualityScore`.     |
| 2.5   | `helpers/upload-graded-traces.mjs`    | PATCH graded pairs into the `training-traces` Data Model object via `/api/workspace`.                          |
| 3     | `helpers/export-training-traces.mjs`  | Emit Unsloth-ready `{instruction,input,output}` JSONL from rows with `qualityScore >= --min-score`.            |

The trio at Phase 1–3 feeds the `growthub-local-expert` GGUF that runs in the alignment-loop sandboxes (`workspace-expert`, `critic-grader`).

### Background dispatch primitive

`helpers/dispatch-background-agent.mjs` is the **permanent background-dispatch entrypoint** for the distillation flywheel. It does **not** introduce a new primitive type: it composes the existing seeded-config + Data Model + helpers surface to materialize complete deliverables in one shell call.

Supported tasks:

| Task                          | Effect                                                                                                                                                                                                                                                                                          |
|-------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `build-served-agent-service`  | Pairs the `served-agent` seeded config (sibling of `alignment-loop`) with a scaffolded `growthub-agent-service` repo on disk: Express server, OpenAI-compatible `/v1/chat/completions`, governed `/workspace/query`, Dockerfile + compose, `@growthub/agent-sdk` stub, and a `pull-latest-gguf` script that the existing distillation loop can call when a new GGUF lands. |

```bash
# scaffold the served service repo
node helpers/dispatch-background-agent.mjs --task "build-served-agent-service" \
  --out ${GROWTHUB_AGENT_SERVICE_HOME:-./growthub-agent-service}

# preview without writing
node helpers/dispatch-background-agent.mjs --task "build-served-agent-service" --dry-run

# also PATCH the service-registry row into a running workspace
node helpers/dispatch-background-agent.mjs --task "build-served-agent-service" \
  --workspace http://localhost:3000 --register-service
```

Adding a new task is a single entry in the `TASKS` registry inside the helper — keep tasks deliverable-scoped (e.g. `build-served-agent-service`, future `build-gtm-sales-agent`) so each one is reviewable as a single diff.
