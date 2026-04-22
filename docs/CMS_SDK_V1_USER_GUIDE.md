# CMS SDK v1 User Guide

This guide is for people who want to use CMS SDK v1 in real work without digging through internal code.

It explains:

- what CMS SDK v1 gives you
- how to set it up
- how to run real workflows
- how to check if it is working
- what to do when something fails

This is intentionally written in plain language.

---

## 1) What CMS SDK v1 is

CMS SDK v1 is the shared contract layer behind CMS workflow execution.

In practical terms, this means:

- your workflow nodes follow one consistent shape
- your inputs are validated before runtime execution
- your output format is predictable
- your errors are clearer when inputs are wrong

You can think of it as a reliability layer for workflow execution, not as a new app you need to learn.

---

## 2) What users get from it

If you are building or running workflows, CMS SDK v1 gives you:

- fewer hidden runtime surprises
- clearer error messages for wrong inputs
- stable behavior across image, video, and text primitives
- easier handoff between teams, because payload shape is consistent

If you are validating a release, CMS SDK v1 gives you a repeatable way to answer:

- does image generation work?
- does video generation work?
- does text generation work?
- do invalid inputs fail cleanly?
- does the environment remain stable after execution?

---

## 3) Before you start

Make sure you have:

- access to your Growthub account
- a local checkout of the repo
- CLI available from this branch
- auth session active

Quick checks:

- `growthub auth whoami` shows your account
- `growthub workflow saved` can list workflows
- `growthub capability list --json` returns capabilities

If these fail, fix auth/session first.

---

## 4) Safe setup checklist

Use this exact order:

1. log in to hosted account
2. confirm account identity in CLI
3. run one safe image test
4. run one safe video test
5. run one safe text test
6. run sync stability checks

Do not skip the sync checks.

---

## 5) First real run: image workflow

Goal: confirm image primitive executes end-to-end.

Use a safe prompt (no private data, no unsafe content).

Success looks like:

- run status is `succeeded`
- node status is `succeeded`
- output includes image metadata

If status is failed:

- check required bindings
- check auth/session
- rerun with corrected input

---

## 6) Second real run: video workflow

Goal: confirm video primitive executes end-to-end.

Important detail:

- video duration must match allowed values

What to expect:

- invalid duration should fail with a clear contract error
- corrected duration should pass

This is good behavior.
It proves the system is protecting users from invalid inputs.

---

## 7) Third real run: text workflow

Goal: confirm text primitive executes end-to-end.

Common failure causes:

- token value too high
- model binding missing
- model binding invalid

Expected pattern:

- first bad input fails clearly
- corrected input succeeds

This is exactly what you want in production.

---

## 8) What “validated” means for release

For this release, validation should include all of the following:

- image run succeeded
- video run succeeded
- text run succeeded
- at least one invalid input failed clearly per primitive family where relevant
- rerun with corrected input succeeded
- sync checks passed after execution

If any of these are missing, validation is incomplete.

---

## 9) Sync stability checks (must run)

After runtime tests:

1. run profile pull
2. run profile push
3. run fork-sync list

Pass criteria:

- pull succeeds
- push succeeds
- forks remain synced

Why this matters:

- runtime execution is not enough on its own
- release confidence requires post-run stability too

---

## 10) Reading validation traces

Validation traces are stored as JSON.

They are useful for:

- release review
- audit trail
- debugging
- handoff

Current trace set:

- image success
- video invalid input failure
- video success
- text invalid token failure
- text invalid model failure
- text success

All confidential values should be redacted in doc copies.

---

## 11) Fast troubleshooting guide

### Problem: auth looks connected but run fails as session missing

What to do:

- sign out and sign in again
- confirm active auth home matches your runtime environment

### Problem: video run fails on duration

What to do:

- use an allowed duration value
- rerun immediately

### Problem: text run fails on model

What to do:

- set a valid model id explicitly
- avoid empty model bindings

### Problem: text run fails on tokens

What to do:

- lower token value to allowed range
- rerun

### Problem: workflow list works but execution fails

What to do:

- confirm hosted execution bindings are present
- check node input values for required fields

---

## 12) User-facing examples (plain language)

### Example A: “I only care if image generation works”

Do this:

- run one safe image prompt
- confirm success
- confirm one image output returned

You are done with image validation.

### Example B: “My video run failed”

Do this:

- read the error message
- fix the exact invalid binding
- rerun

If rerun succeeds, validation is still good.

### Example C: “Text run works sometimes and fails sometimes”

Do this:

- make model binding explicit
- set a clear token limit
- rerun with same prompt

This usually removes unstable behavior from missing defaults.

---

## 13) What not to do

- do not store raw private URLs in release docs
- do not publish internal IDs in user docs
- do not call a release validated if only one primitive was tested
- do not skip sync checks
- do not ignore clear contract failures; fix and rerun

---

## 14) Phase 2 + Phase 3 command quick reference

Phase 2 and Phase 3 added two sub-branches under `growthub workflow`. Both work
for humans (interactive prompts, pretty-printed cards) and for agents (`--json`
on every subcommand). See `docs/CMS_SDK_V1_MANIFEST_REGISTRY.md` and
`docs/CMS_SDK_V1_SCHEMA_CONTRACTS.md` for details.

Manifest discovery spine:

```bash
growthub workflow manifest pull                  # fetch + cache + stamp drift
growthub workflow manifest show --slug <slug>    # inspect one capability
growthub workflow manifest drift                 # preview drift since last pull
growthub workflow manifest snapshot --fork <path>  # freeze into a fork
growthub workflow manifest export --out <path>   # portable JSON for handoff
growthub workflow manifest import <path> --fork <path>
```

Schema-driven node contracts:

```bash
growthub workflow schema show <slug>             # inspect the schema
growthub workflow schema validate <slug> --bindings-file <path>
growthub workflow schema fill <slug> [--stdin | --bindings-file <path> | --agent-json]
growthub workflow schema run <slug> --bindings-file <path>
growthub workflow schema save <slug> --name <name> --fork <path>
growthub workflow schema load <slug> --name <name> --fork <path>
growthub workflow schema export <slug> --out <path> --fork <path>
growthub workflow schema import <path> --fork <path>
```

## 16) Short plain summary

CMS SDK v1 is validated when image, video, and text all run successfully through real hosted execution, bad inputs fail clearly, corrected reruns pass, and sync remains stable after execution.
