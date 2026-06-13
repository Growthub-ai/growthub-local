---
name: governed-workspace-mutation
description: Router to the runtime-verified contract card for the two canonical governed-workspace API calls — PATCH /api/workspace (config mutation, 4-field allowlist) and POST /api/workspace/sandbox-run (sandbox execution). Read before any agent makes a workspace-configuration mutation, in any harness.
progressiveDisclosure: true
---

# Governed Workspace Mutation — pointer to the canonical card

**The invariant (never lost, even if you read nothing else):** a governed Growthub workspace has exactly two canonical mutation calls — `PATCH /api/workspace` (allowlist: `dashboards`, `widgetTypes`, `canvas`, `dataModel`) and `POST /api/workspace/sandbox-run` (all sandbox / agent-swarm execution). Everything else is a read or a specialised governed lane (`refresh-sources`, `test-source`, `helper/query|apply`, `patch/preflight`, `workflow/publish`). No implementation module may add, bypass, or duplicate these calls, and no mutation proceeds past a failed call.

**The boundary is runtime-enforced**: the PATCH route runs `lib/workspace-patch-policy.js` before any write (HTTP 422 + `violations[]` on rejection), `POST /api/workspace/patch/preflight` dry-runs the gates, and `POST /api/workspace/workflow/publish` is the only draft → live workflow transition (verified against server-owned run-history lineage, not client attestation). SDK: `@growthub/api-contract/workspace-patch`.

**The canonical contract card** — runtime-verified request/response shapes, every observed error envelope, the verified mutation protocol (read → validate → prove → publish → confirm), the row-shape traps (`Name` capital-N identity column; `command` is the executed payload), the workspace-first rule, and the boundary anti-patterns — lives where it ships:

- In this repo: [`cli/assets/worker-kits/growthub-custom-workspace-starter-v1/skills/governed-workspace-mutation/SKILL.md`](../../../../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/skills/governed-workspace-mutation/SKILL.md)
- In every exported workspace / fork: `skills/governed-workspace-mutation/SKILL.md` (frozen into `kit.json.frozenAssetPaths`; first-session agents find it via the standard traversal)
- Agent-agnostic anchor: [`AGENTS.md`](../../../../AGENTS.md) §"Canonical workspace mutation boundary" — `CLAUDE.md` and `.cursorrules` route every harness there.

The card is one read. Load it before shaping any PATCH body or sandbox-run request; do not reconstruct the contract from memory or from this pointer alone. If a fork's route files have diverged from the card, the route files win — runtime implementation overrides docs.
