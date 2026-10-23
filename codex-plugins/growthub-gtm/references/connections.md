# Connect your Growthub team

## Public ChatGPT and Codex directory

The public package connects one Growthub GTM server at
https://www.growthub.ai/api/v1/mcp/gtm through the existing Growthub OAuth service.
The connection exposes the existing 21 Brand Kit, CEO/Character and Knowledge
tools together. The consent page names each requested permission. Connect your
own Growthub account; access remains bounded by its record permissions.

Start with growthub_get_session, then heartbeat and list_characters. Use the
actual Project and Character returned. delegate_task prepares work for the
calling assistant; message_character runs a saved Character only through that
account's existing available native provider and grants. Read the exact saved
reply before claiming completion. Use query_knowledge before a version-checked
Knowledge edit. Brand Kit reads serve the current approved version.
The CEO also exposes `review_api_requests` and `decide_api_request`: it can
approve or decline eligible token-submitted Brand Kit changes only when the
user has delegated this in Settings → CEO → Growthub API requests. The same
existing decision owner produces the applied immutable version and receipt;
other users, pending states and default human decisions retain their boundaries.

An old Brand Kit-only OAuth grant does not gain CEO or Knowledge permissions.
Connect the new GTM server with explicit consent to use the full workflow.
The older connector remains compatible for existing installations; it is not
the public package's feature boundary.

## Existing native API-token connections

Native Claude and Codex packages retain these server identities and URLs:

| Server | Endpoint | Permission |
|---|---|---|
| growthub-brand-kit | https://www.growthub.ai/api/v1/mcp | brand_kits:read and brand_assets:read |
| growthub-ceo | https://www.growthub.ai/api/v1/mcp/ceo | ceo:read; ceo:write for mutations |
| growthub-knowledge | https://www.growthub.ai/api/v1/mcp/knowledge | knowledge_items:read; knowledge_items:write for edits |

Use your independently authorized token through the host's credential settings
or GROWTHUB_API_TOKEN environment. Do not copy attested host credentials, browser
cookies or another account's token. Public OAuth does not replace native token
connections. The packaged API-token workflow retains its broader supported API
operations, including private Brand Kit creation and review-only proposals.

## Existing execution and commerce

Characters keep their saved provider, model and tool permissions. Installing a
plugin does not connect a provider or grant access to customer systems. Routines
retain their existing Growthub authoring, publication and execution controls.
Purchases stay on Growthub's existing plan/Stripe checkout. No card collection,
embedded checkout or new subscription is introduced by the plugin.

The public endpoint uses one OAuth connection as required by the current portal:
https://developers.openai.com/plugins/deploy/submission . Existing native
endpoints retain their own authentication and are not silently migrated.
