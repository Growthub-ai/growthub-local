# Existing Growthub connections

This package configures existing production Streamable HTTP MCP endpoints:

| Server | Endpoint | Existing permission |
|---|---|---|
| Brand Kit | https://www.growthub.ai/api/v1/mcp | brand_kits:read and brand_assets:read |
| CEO / Characters | https://www.growthub.ai/api/v1/mcp/ceo | ceo:read; ceo:write for mutations |
| Knowledge | https://www.growthub.ai/api/v1/mcp/knowledge | knowledge_items:read; knowledge_items:write for edits |

Use an independently authorized existing Growthub API token in the provider's
supported credential settings or GROWTHUB_API_TOKEN environment. Never copy a
host-minted first-party credential or a browser cookie. Missing scopes require
an explicit user action through existing settings, not an authentication change.

Claude Code supports the HTTP configuration in .mcp.json with the environment
reference. Codex compatibility uses its supported plugin MCP configuration; verify
the actual connection, not only the manifest. The portable mcp.json carries the
same existing endpoints and provider authentication declarations. Environment
references belong to the provider-specific compatibility configurations.

Brand Kit also has its existing public OAuth path; on an OAuth-only web surface
use that existing connection for its actual approved Brand Kit capabilities.
Do not treat that Brand Kit grant as CEO/Knowledge authority. Configure those
connections only where the provider supports their existing token-based path.

OpenAI documents fixed-token declarations but its public submission connection
form does not currently support API-key configuration. A package validator pass
cannot resolve that limitation. The full CEO/Knowledge web listing remains
unqualified until the existing connection path is demonstrated in the publisher
portal. Do not modify Growthub authentication to make a listing pass.

Routine execution remains in the existing Growthub controls. See the repeat
skill for the real customer journey and truthful continuation behavior.

For public OpenAI review, verify each dependency's actual eligible app version.
Current official guidance says the package may declare multiple servers but only one MCP server can be connected per plugin. Verify the existing eligible app bindings and exact saved portal behavior. The three-server source package is therefore a
prepared distribution artifact, not proof that the public-review dependency
requirements are satisfied. Reuse verified existing app versions where eligible;
otherwise stage review through the existing provider process before composing
the full public bundle. Do not create duplicate app identities or change auth.

Official guidance checked 2026-10-23: https://developers.openai.com/plugins/deploy/submission . The publisher portal requires sign-in and verified identity. A valid multi-server archive is not evidence that all three servers are publicly connected. Do not remove an existing server or weaken authentication to pass submission.

Purchases stay on Growthub’s existing plan/Stripe checkout. Do not collect card details in prompts or create an embedded checkout. Availability follows OpenAI-supported countries and actual Growthub/Stripe sale restrictions; a Stripe merchant-country list is not a customer-country allowlist.
