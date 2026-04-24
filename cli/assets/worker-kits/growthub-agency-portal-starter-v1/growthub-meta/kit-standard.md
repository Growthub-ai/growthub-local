# Kit Standard — growthub-agency-portal-starter-v1

This starter is a custom-workspace-derived agency portal worker kit with:

- `schemaVersion: 2` in `kit.json`
- `family: "studio"`
- `executionMode: "export"`
- `activationModes: ["export"]`

Every bundled worker kit under `cli/assets/worker-kits/` conforms to the same shape. See `docs/kernel-packets/KERNEL_PACKET_CUSTOM_WORKSPACES.md` for the full invariant list.

Additional invariants:

- `studio/` remains the local-first Vite operator shell.
- `apps/agency-portal/` remains the Vercel app payload.
- Persistence/auth/payment selection stays behind adapter env and docs.
