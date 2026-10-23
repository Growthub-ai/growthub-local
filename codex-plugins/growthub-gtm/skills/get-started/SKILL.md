---
name: get-started
description: Connect the existing Growthub setup and choose a useful go-to-market task with the saved CEO, Characters, approved brand context and business tools.
---

# Start with one useful result

Help the user finish the growth work they asked for. Prefer an existing saved
Character and connected tools over creating another agent or configuration.
Read [supported surfaces](../../references/connections.md) only if connection
setup or capability availability is relevant.

1. On the public directory, connect Growthub GTM through its explicit OAuth consent.
   Native Claude/Codex installations keep their existing scoped API-token setup.
   Use the installed Growthub tools. Call `growthub_get_session` once to confirm
   the connected identity and scopes. Never request a token in chat, read an env
   file into a transcript, change permissions or switch to another account.
2. With CEO access, use `heartbeat` once and `list_characters` for the selected
   Project. Resolve names from actual results. `mainChat` identifies the canonical
   CEO; a local persona or new conversation is not that identity.
3. Bind a clear objective, existing Character, relevant Brand Kit, destination
   and acceptance result. Ask only for information necessary for this job.
4. If the task needs brand context but has no selected Brand Kit, use the
   existing Growthub selector or `scripts/growthub.mjs brand-kits` on a supported
   execution surface. Select an actually returned ID; the Brand Kit resolve
   tool requires a UUID and is not a name-search tool.
5. Use [execute-growth-work](../execute-growth-work/SKILL.md) to run the job and
   retrieve its actual saved outcome. Work through the existing tool grants.
6. When the user accepts repeat work, use
   [repeat-growth-work](../repeat-growth-work/SKILL.md). Keep recurrence in Growthub.

If CEO scope is missing, name the missing scope and point to the existing
Growthub GTM OAuth connection settings, or Growthub Settings → API tokens on native token installations. Do not modify
an existing credential, mint one, change authentication code or substitute a
provider. Continue independent authorized brand/context work. A user can open
https://www.growthub.ai/dashboard/workflow/chat to use their existing native team.

Starter methods and real examples:

For signup activation, customer winback drafts and weekly GTM briefs, use
[growth-outcomes](../growth-outcomes/SKILL.md) for the required inputs, useful
deliverable, result readback and cross-provider continuation.
- Claude and Codex: https://www.growthub.ai/f/playbook/slack-team-brief
- Codex: https://www.growthub.ai/f/playbook/local-lead-finder
- Codex: https://www.growthub.ai/f/playbook/ad-creative-studio
- Claude: https://www.growthub.ai/f/playbook/newsletter-email-expert

Do not infer that a method supports another provider from general chat support.
A plugin install is setup, not a completed task or granted send authority.

For existing API-token workflows beyond the installed MCP contracts, use [api-token](../api-token/SKILL.md). Never ask for a credential in chat. On a host without a configured token/executor, continue through supported connection settings or the relevant Growthub destination.
