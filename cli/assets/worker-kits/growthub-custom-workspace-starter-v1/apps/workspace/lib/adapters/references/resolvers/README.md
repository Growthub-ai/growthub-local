# Reference option resolvers

This folder holds the **governed reference option** layer used by `POST /api/workspace/reference-options`.

- `collect-reference-options.js` — dispatches local `dataModel.objects[]` scans, optional `source-records` sidecar reads, and resolver `listEntities` calls.
- `reference-resolver-registry.js` — stable entry for future strategy plugins.

Do not import provider SDKs here. Provider-specific behavior stays in `lib/adapters/integrations/resolvers/`.
