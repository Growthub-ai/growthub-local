# Connect Growthub in Claude

Add the Growthub connector and sign in through its explicit OAuth consent.
The bundle and connector both use https://www.growthub.ai/api/v1/mcp/gtm, so
installing both does not introduce a second copy of the tools. The connection
exposes the existing 21 Brand Kit, CEO/Character and Knowledge tools together.
Access stays within the signed-in account's record permissions.

Use growthub_get_session to confirm identity and scopes. Select an actual
Project and saved Character. delegate_task prepares a brief for the caller;
message_character uses the Character's existing connected provider and grants.
Read the exact saved reply before claiming completion. Native execution needs
that account's own available provider and execution device. No credentials or
provider account are supplied by installing this bundle.

Knowledge edits retain revision checks. Brand Kit reads return approved active
versions. CEO API request decisions require owner delegation in Settings → CEO
→ Growthub API requests; default human decisions remain in Growthub.

[Existing scoped API workflows](api-token.md) remain separately configured.
Native installations keep their existing three endpoint identities and tokens.
Old read-only grants do not gain scopes. Routines, customer publishing and
external service permissions retain their existing owners and product UI.
Plans use Growthub's existing website checkout; no payment details are collected
by this connector.
