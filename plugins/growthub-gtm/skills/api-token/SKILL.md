---
name: api-token
description: Use existing scoped Growthub API tokens for private Brand Kit creation, approved context and assets, Knowledge reads, gallery, usage, and review-only Brand Kit proposals on supported execution surfaces.
---

# Use the existing Growthub API

Read [API workflow and permissions](../../references/api-token.md) before a call.
Use the customer's existing GROWTHUB_API_TOKEN process environment; never ask
for a token in chat, inspect unrelated secrets, copy a host-minted credential,
change scopes, or switch identity to make a request succeed. This skill needs
an execution host with Node.js and the token already configured. It does not
make API-only capabilities into MCP tools or add web-client authentication.

1. Run `node <plugin-root>/scripts/growthub_api.mjs session` and confirm intended identity.
2. Resolve explicit returned Brand Kit and version IDs before retrieving context.
3. Retrieve only authorized data needed for the requested customer outcome.
4. Create a private Brand Kit only after the customer explicitly asks; use the
   helper's brand-create command and read back owner, privacy and initial version.
5. Submit a change proposal only after an explicit request, against a freshly
   read active version with a stable idempotency key. Read back pending status.
6. Never approve, publish, archive, retire or change sharing through this skill.
   A proposal is review-only. A human decision remains in existing controls.
7. Verify the saved result and return its exact destination. Stop on 401/403;
   reconcile uncertain writes before retrying. Do not automatically retry creation.

Prefer installed MCP tools for their existing supported contracts. Use this API
path for the broader existing token workflows, not as an authorization bypass.
