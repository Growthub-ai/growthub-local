# Scoped API workflows

The existing API-token workflow complements the three hosted MCP servers.
Configure GROWTHUB_API_TOKEN only in the host's private credential/environment
settings. No token belongs in a prompt, package, screenshot or public headers.
The default origin is https://www.growthub.ai. An origin override requires an
explicitly authorized Growthub deployment. Never broaden scopes automatically.

Use `node <plugin-root>/scripts/growthub_api.mjs <command>`. Mutations accept a
JSON object on stdin. The helper performs no automatic retries. Its help lists
exact options. These are existing REST contracts, not additional MCP tools.

| Outcome | Helper command | Existing scope |
|---|---|---|
| Resolve connected identity | session | Valid existing token |
| List accessible Brand Kits | brand-kits | brand_kits:read |
| Create a requested private kit | brand-create | brand_kits:create; read scope for verification |
| Resolve active immutable version | brand-versions --brand-kit-id ID | brand_kits:read |
| Read graph/context | brand-graph | brand_kits:read |
| List current brand assets | brand-assets --brand-kit-id ID | brand_assets:read |
| Fetch authorized bytes | content --storage-path PATH | Route/content permissions |
| Export current kit | brand-export --brand-kit-id ID --out PATH | Existing export permissions |
| Read authorized Knowledge | knowledge | knowledge_items:read |
| Read generated gallery | gallery --page 1 --limit 10 | gallery_assets:read |
| Read actual usage/logs | brand-analytics / brand-logs --brand-kit-id ID | brand_analytics:read |
| Propose an explicit change | brand-propose --brand-kit-id ID | brand_kits:propose |
| Read proposal state | brand-requests --brand-kit-id ID | brand_kits:read |

Creation body permits only brand_name, colors, fonts and messaging. The server
binds owner and provenance. Verify HTTP201, private ownership, initial v1.0.0,
matching active IDs, no parent and agent/api-request creation provenance. A
create-only token cannot prove readback. Never retry an uncertain create.

A proposal needs baseVersionId, kind, title, requestedBump, idempotencyKey and
patch. Read the current base first; retain the same key and body if reconciling
an uncertain outcome. Allowed kinds are memory_patch, context_patch,
file_upload and asset_retirement. This skill only proposes; it never approves
or performs retirement. Read back its pending state through the request list.

For assets, require current approved revision membership in the active snapshot
and verify returned bytes, MIME, dimensions where applicable and SHA256. Do not
use a familiar filename as approval evidence. Retrieve content only from paths
returned by the authorized API. The helper refuses output overwrite by default.

Treat 401 as an authentication stop and 403 as a permission stop. Empty lists,
null usage and unavailable metrics remain distinct from zero and success.
Existing ACLs, approval controls, provider bindings and Routines stay authoritative.
