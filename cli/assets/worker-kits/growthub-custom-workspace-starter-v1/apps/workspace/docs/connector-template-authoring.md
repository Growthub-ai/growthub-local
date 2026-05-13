# Connector template authoring

1. Add `lib/adapters/integrations/templates/<your-template>.js` exporting a `default` object with `schemaVersion: "growthub-resolver-template-v1"`.
2. Import it from `template-registry.js` and append to the `ALL` array.
3. Keep `connectorKind`, `capabilities`, and `supportedLanes` honest — they drive operator UX only.
4. Document the expected resolver `integrationId` and any env refs (`authRef` pattern) in the template `configSchema` entries.

Do not import vendor SDKs into template modules. Provider code stays in resolver files under `resolvers/`.
