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
- `growthub capability list --family video --include-experimental --json`
  returns experimental video rows with `"experimental": true` when you
  intentionally need hidden/Atlas CMS items

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

For Atlas/hidden model verification, use:

```bash
growthub capability list --family video --include-experimental --json
```

The SDK flag to look for is the existing `experimental` boolean. Stable rows
have `experimental: false`; hidden/Atlas rows have `experimental: true`.

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

## 11) Downloading generated media safely

Generated images, videos, and slides should be downloaded through Growthub auth,
not by extracting Supabase keys from hosted JavaScript.

Use this pattern:

```bash
growthub pipeline execute ./payload.json --json > result.json
```

Then inspect storage paths:

```bash
node -e "
  const r = require('./result.json')
  Object.entries(r.nodeResults)
    .filter(([, n]) => n.output?.storagePath)
    .forEach(([nodeId, n]) => console.log(nodeId, n.output.storagePath))
"
```

Download path:

```text
GET /api/secure-image?bucket=node_documents&path=<encoded storagePath>
Authorization: Bearer <Growthub CLI session token>
```

CLI bridge commands:

```bash
growthub bridge assets list --limit 20 --json
growthub bridge assets download --storage-path <storage_path> --out ./asset.bin --json
growthub bridge brand kits --include-assets --json
growthub bridge brand assets --brand-kit-id <brandKitId> --json
growthub bridge brand download --storage-path <storage_path> --out ./brand-asset.bin --json
growthub bridge knowledge list --json
growthub bridge knowledge write --title "Run notes" --content "# Run notes" --json
growthub bridge knowledge download <knowledgeItemId> --out ./knowledge.md --json
growthub bridge mcp accounts --json
```

The bridge surface is the same authenticated user boundary for asset gallery
outputs, remote brand kits/assets, knowledge items, and MCP accounts. Use
`@growthub/api-contract/bridge` for SDK types. Brand assets are fetched from the
existing hosted brand-kit/CMS media system and downloaded through the same
authenticated storage proxy; arbitrary Asset Gallery uploads are intentionally
not part of this primitive.

For brand kits and brand assets, the official source of truth is the hosted GH
app brand system:

```text
GET /api/brand-settings
GET /api/brand-settings/assets
```

The CLI derives the hosted session-cookie auth shape from the active Growthub
session so the JSON contract is accessible to both agents and humans through the
same `growthub bridge brand ... --json` commands.

Representative outputs:

```json
{
  "success": true,
  "userId": "20d81c2e-c440-4f93-afe2-1c45f39abd81",
  "brandKits": [
    {
      "id": "174299f8-5045-415a-99b2-a9e4b33aa4d1",
      "brand_name": "Dr. Robert Whitfield",
      "visibility": "private",
      "colors": { "primary": "#000000" },
      "fonts": { "primary": "Inter" },
      "messaging": "...",
      "share_config": { "collaborators": [] }
    }
  ],
  "count": 21
}
```

```json
{
  "success": true,
  "userId": "20d81c2e-c440-4f93-afe2-1c45f39abd81",
  "brandKitId": "174299f8-5045-415a-99b2-a9e4b33aa4d1",
  "assets": [
    {
      "id": "6bbb47de-7aa4-4cfc-aaff-e3409800837d",
      "brand_kit_id": "174299f8-5045-415a-99b2-a9e4b33aa4d1",
      "asset_type": "product_photo",
      "storage_path": "public/.../brand_assets/.../winner1.jpeg",
      "metadata": {
        "file_name": "winner1.jpeg",
        "file_size": 546061,
        "file_type": "image/jpeg"
      }
    }
  ],
  "count": 2
}
```

For videos, the expected storage path shape is:

```text
workflow_videos/{userId}/{threadId}/{videoId}.mp4
```

The hosted route must verify the authenticated user owns that `{userId}` path
segment before downloading with service-role storage credentials.

---

## 12) Fast troubleshooting guide

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

## 13) User-facing examples (plain language)

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

## 14) What not to do

- do not store raw private URLs in release docs
- do not publish internal IDs in user docs
- do not call a release validated if only one primitive was tested
- do not skip sync checks
- do not ignore clear contract failures; fix and rerun
- do not use Supabase anon-key extraction as the documented SDK artifact
  download path

---

## 15) Platform pattern

Growthub Local is proving one shared operating pattern:

```text
governed workspace
-> Growthub bridge auth
-> CMS capability execution
-> artifact capture
-> agent review / self-correction
-> finished output or deployed app surface
```

The Growthub bridge removes integration setup. CMS pipelines remove production
setup. Governed forks keep the workspace customizable and syncable. The SDK
contract is what lets agents operate that stack without guessing payload shapes.

---

## 16) Short plain summary

CMS SDK v1 is validated when image, video, and text all run successfully through real hosted execution, bad inputs fail clearly, corrected reruns pass, generated artifacts are captured with storage paths, downloads go through Growthub auth, and sync remains stable after execution.
