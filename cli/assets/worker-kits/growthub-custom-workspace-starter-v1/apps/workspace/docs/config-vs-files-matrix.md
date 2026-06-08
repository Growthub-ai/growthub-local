# Config vs Server Files Matrix

Growthub governed workspaces split customer intent across two planes:

| Customer action | Config change (`growthub.config.json`) | File change | Route |
| --- | --- | --- | --- |
| Register API | `dataModel.objects[]` api-registry row | Optional `lib/adapters/integrations/resolvers/<slug>.js` | `PATCH /api/workspace`, `POST /api/workspace/register-resolver` |
| Save API key name | `integrations[]` (`endpointRef`, `hasSecret`) | `.env.local` value (filesystem mode only) | `PATCH /api/settings/apis-webhooks` |
| Create workflow | sandbox-environment row + orchestration JSON | None | `PATCH /api/workspace` |
| Run workflow | row `lastResponse` sidecar fields | None | `POST /api/workspace/sandbox-run` |
| Run serverless | same row + `schedulerRegistryId` FK | Deployed scheduler URL handler | outbound POST via api-registry row |
| Add dashboard widget | `canvas.widgets[]` | None | `PATCH /api/workspace` |

Hard rules:

- `PATCH /api/workspace` allowlist stays `dashboards`, `widgetTypes`, `canvas`, `dataModel` only.
- Secrets never enter config JSON — use `authRef` / `envRefs` slugs and server env.
- Sidecar history (`growthub.source-records.json`) is not PATCHable; prune via `POST /api/workspace/cleanup-sidecar`.
- Env discovery for UI chips uses `GET /api/workspace/env-key-catalog` (slugs + `resolved` boolean only).
