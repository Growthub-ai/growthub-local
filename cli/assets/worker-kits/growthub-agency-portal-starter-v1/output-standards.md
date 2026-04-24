# Agency Portal Starter — Output Standards

Generated planning and implementation artifacts write to:

```text
output/<client-slug>/<project-slug>/
```

Required artifacts per production customization:

- `portal-brief.md` — business requirements, client scope, data pipeline objects, and MCP integration needs.
- `client-onboarding-plan.md` — first client setup, settings, roles, and source connection plan.
- `adapter-plan.md` — persistence/auth/payment/reporting adapter selections.
- `deployment-handoff.md` — local validation, Vercel root/env, GitHub/Vercel CI handoff, and bridge/BYO integration decision.
- `trace-summary.md` — human-readable summary of governed fork events.

Application source changes belong in `apps/agency-portal/` or `studio/` according to runtime surface. Do not write generated artifacts into app source directories.

Every handoff must explicitly state:

- whether integrations use `growthub-bridge`, `byo-api-key`, or `static`;
- whether Windsor AI is connected through hosted authority or explicit `WINDSOR_API_KEY`;
- which data pipeline objects are active;
- which MCP connection integrations are active;
- which fork id was validated with `growthub kit fork status`.
