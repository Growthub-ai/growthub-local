# Growthub GTM Execution

Bring your saved Growthub team, brand context and business tools to growth work.
Direct a Character, retrieve its saved result and repeat accepted work through
Growthub's existing Routines. This is a companion to the governed workspace
console; its existing identity and 14-tool no-write contract remain unchanged.

## Install and use

From the existing public repository marketplace in Claude Code:

```text
/plugin marketplace add Growthub-ai/growthub-local
/plugin install growthub-gtm@growthub
```

For Codex, use the repository's existing Growthub marketplace and select
Growthub GTM Execution. Use the new branch/release as a local marketplace while
review is pending; a local entry is not a public directory listing.

Use your current Growthub account and existing token/connection settings. Where
supported, expose an already authorized token as GROWTHUB_API_TOKEN in the
provider process environment. Never paste it into chat, commit it or copy the
installed Growthub host's credential. Run the packaged get-started workflow.

Examples: research relevant prospects and save the list; prepare a campaign
brief and reviewable creative; prepare a sourced newsletter draft. Each task
uses the saved Character's provider, tool grants and current available device.

## Supported surfaces and evidence

| Surface | Connection / execution contract |
|---|---|
| Claude Code | Bundled remote MCP configuration with an existing token; installation and real task acceptance must be recorded for the released artifact. |
| Codex / compatible Work execution | Portable and Codex-compatible package plus existing token settings; CLI helper works where shell execution is available. Record installed-host acceptance separately. |
| ChatGPT or Claude OAuth-only chat | Existing Brand Kit OAuth works for approved brand reads. Full CEO/Knowledge access must use a demonstrated provider-supported existing connection; it is not implied by Brand Kit access. |
| Routines | Existing Growthub UI and publication/runtime owners. The current CEO MCP does not expose Routine lifecycle operations. |

The public OpenAI submission form's API-key connection limitation and the
existing token's actual scopes are release-readiness items, not reasons to
rewrite authentication. See [connections](references/connections.md).

## Development and review

plugins/growthub-gtm is the single source. Run `node scripts/build-gtm-plugin.mjs`
to generate the Claude variant. It contains no hooks or automatic install-time
execution. Version 0.1.0 is independent of @growthub/cli because it wraps hosted
contracts and does not ship or pin that CLI.

The three skills use the current service owners. Tools are not entitlement or
send authority. A result needs the exact saved reply and destination readback;
an install, dispatch or digest alone does not establish business value.

[Growthub](https://www.growthub.ai/f/home) ·
[Support](https://thegrowthub.com/pages/contact) ·
[Privacy](https://thegrowthub.com/policies/privacy-policy) ·
[Terms](https://thegrowthub.com/policies/terms-of-service)
