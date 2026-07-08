---
name: governed-workspace-mutation
description: The two canonical Growthub workspace mutation calls and the verified protocol — PATCH /api/workspace (allowlist dashboards, widgetTypes, canvas, dataModel) and POST /api/workspace/sandbox-run. Read before changing workspace configuration or executing anything in a governed workspace. Mutations are runtime-enforced; this card keeps you on the sanctioned lanes.
---

# Governed Workspace Mutation — the two canonical calls

A governed Growthub workspace has exactly **two** canonical mutation calls.
Every agent harness routes through them; there is no third path:

| Intent | The one true call |
| --- | --- |
| Change workspace configuration | `PATCH /api/workspace` |
| Execute a `sandbox-environment` row (incl. agent-swarm graphs) | `POST /api/workspace/sandbox-run` |

Everything else is a read (`GET /api/workspace`) or a specialised governed
lane: `refresh-sources`, `test-source`, `helper/query|apply`,
`patch/preflight`, `workflow/publish`.

**Authoritative card:** every exported workspace ships its own runtime-verified
contract card at `skills/governed-workspace-mutation/SKILL.md` (workspace
root), with the exact request/response shapes, error envelopes, violation
codes, and row-shape traps for *that* workspace version. **Read it first when
it exists** — it wins over this summary on exact shapes. This plugin card is
the portable fallback and boundary statement.

## The hard rules (runtime-enforced, not advisory)

1. **PATCH allowlist is permanent:** only `dashboards`, `widgetTypes`,
   `canvas`, `dataModel` are patchable. Unknown top-level keys (including
   full-config bodies and `workspaceSourceRecords`) are rejected **400** with
   `allowed[]`.
2. **Policy runs before any write:** surviving bodies go through the mutation
   policy — oversized rows/node-configs, history blobs, credential fields on
   sandbox rows (the exact set `token`, `apiKey`, `accessToken`,
   `refreshToken`, `bearer`, `password`, `secret`, `sessionKey`), and direct
   live-workflow mutations are rejected **422** with structured
   `violations[] = { code, path, message }`. The credential check is scoped
   to sandbox rows by design — rule 4 below is agent discipline everywhere
   else, not something the runtime will catch for you.
3. **Live workflow state is publish-owned:** `POST /api/workspace/workflow/publish`
   is the only draft → live transition; it verifies the draft's successful
   test against server-owned run history (`draftSha256` lineage). Never PATCH
   `lifecycleStatus: "live"`, `orchestrationGraph`, or version bumps directly.
4. **Secrets never cross the wire:** rows carry env-ref *names* only;
   provider keys resolve server-side. Never put a credential value in a PATCH
   body, a sandbox row, or a prompt.
5. **App scope is enforced per route:** when operating inside an app scope,
   send `x-growthub-app-scope`; violations return a structured
   `AppScopeViolation` with a `repairPlan[]` — follow it instead of retrying
   blind.

## The verified mutation protocol

```
read → preflight → prove → publish → confirm
```

1. **READ** — `GET /api/workspace` → `workspaceConfig` +
   `workspaceConfigPersistence` (`canSave`, `guidance`).
2. **PREFLIGHT** — `POST /api/workspace/patch/preflight` with the exact PATCH
   body (or the `preflight_patch` MCP tool, which proxies it in live mode).
   It uses the write path's exact merge step, so it cannot disagree with the
   real PATCH.
3. **PROVE** — for executable changes: `test-source` for sources,
   `sandbox-run` with `useDraft: true` for draft workflow graphs.
4. **PUBLISH** — PATCH one allowlisted key with only the changed content
   (never the whole config), or `workflow/publish` for draft → live.
5. **CONFIRM** — read the success envelope before any dependent step. Every
   mutation lane emits a secret-redacted receipt into the
   `workspace:agent-outcomes` stream; `GET /api/workspace/agent-outcomes`
   returns it plus the governance summary. New sessions read receipts before
   acting and continue from `nextActions` / `rollbackRef`.

## Rejections are navigation, not noise

A 400/422 is the control plane telling you the correct lane. Policy
rejections carry `repairPlan[]` — apply it and re-preflight. Do not fall back
to editing `growthub.config.json` on disk while the app is running, inventing
routes, or writing "temporary" direct state: blocked attempts are receipted,
and a bypass breaks the trust chain every other surface depends on.
