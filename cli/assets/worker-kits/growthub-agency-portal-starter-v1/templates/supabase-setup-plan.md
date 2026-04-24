# Database Provider Setup Plan

This file name is retained for compatibility with older agency portal notes. The v1 worker-kit contract is not Supabase-specific.

Use `AGENCY_PORTAL_DATA_ADAPTER` to select persistence:

- `postgres` with `DATABASE_URL`
- `qstash-kv` with `QSTASH_KV_REST_URL` and `QSTASH_KV_REST_TOKEN`
- `provider-managed` for a hosted database surface outside this kit

Supabase may be used only as one Postgres-compatible provider behind `DATABASE_URL`. Do not add Supabase SDK dependencies or Supabase-only assumptions to the starter unless a user explicitly chooses that provider in their own fork.

## Selected Provider

- Adapter:
- Provider:
- Required env:
- Migration owner:
- Backup owner:

## Validation

```bash
node setup/verify-env.mjs
cd apps/agency-portal && npm run build
```
