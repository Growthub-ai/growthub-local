# Workspace Builder Runtime V1

The Workspace Builder Runtime turns the official `growthub-custom-workspace-starter-v1` shell from a static dashboard preview into a config-backed no-code surface. The starter still renders from `apps/workspace/growthub.config.json`, but the UI now mutates, persists, and binds to live sources through narrow adapter modules.

## Source of truth

- `apps/workspace/growthub.config.json` is the local source of truth for layout and binding metadata.
- `lib/workspace-config.js` reads, validates, and writes that file.
- The Growthub Bridge remains the runtime authority for hosted data, agents, workflows, and artifacts. The UI composes, persists, inspects, and delegates — it never moves execution into the browser.

## Persisted shape

```json
{
  "dashboards": [],
  "widgetTypes": [
    { "kind": "chart", "label": "Chart", "icon": "C" },
    { "kind": "chat-session", "label": "Chat", "icon": "A" },
    { "kind": "workflow-runner", "label": "Workflow", "icon": "W" },
    { "kind": "artifact-viewer", "label": "Artifacts", "icon": "O" }
  ],
  "canvas": {
    "layout": { "columns": 12, "rowHeight": 64, "gap": 16, "responsive": true },
    "widgets": [
      {
        "id": "widget_xxx",
        "kind": "chart",
        "title": "Weekly performance",
        "position": { "x": 0, "y": 0, "w": 4, "h": 3 },
        "config": {
          "dataSource": { "type": "bridge-knowledge", "tableId": "brand-metrics" }
        }
      }
    ],
    "bindings": {
      "chatToCanvas": true,
      "workflowOutputsToArtifacts": true,
      "sessionContext": true,
      "configDrivenCanvas": true
    }
  },
  "onboarding": { "completed": false, "currentStep": "name" }
}
```

`validateWorkspaceConfig` rejects unknown top-level fields and unknown widget kinds. The known widget kinds are `chart`, `view`, `iframe`, `rich-text`, `chat-session`, `workflow-runner`, and `artifact-viewer`.

## Persistence modes

`describePersistenceMode` returns `{ mode, reason }`:

- `filesystem` — local development, or any runtime that opts in with `WORKSPACE_CONFIG_ALLOW_FS_WRITE=true`.
- `read-only` — Vercel/Netlify-style runtimes where the bundle is immutable. `PATCH /api/workspace` returns 409 with adapter guidance.

A future hosted persistence adapter can replace the filesystem write without touching the UI.

## API surface

| Route | Mode | Purpose |
| --- | --- | --- |
| `GET /api/workspace` | always | Returns `config`, `adapters`, `capabilities`, `settings`, `workspace`, `workspaceConfig`, and `workspaceConfigPersistence`. |
| `PATCH /api/workspace` | filesystem | Validates and writes `dashboards`, `widgetTypes`, `canvas`, and `onboarding`. |
| `GET /api/workspace/knowledge` | bridge or static | Lists knowledge tables. With `?tableId=` returns rows. Falls back to sample data when bridge is not configured. |
| `GET /api/workspace/agents` | fork | Lists `.growthub-fork/agents/*.json` bindings. Surfaces metadata only — execution stays in `gh-app`. |
| `POST /api/workspace/chat` | hosted | V1 returns 501 with hosted-execution guidance. |
| `GET /api/workspace/workflows` | bridge or static | Lists workflows; static fallback when no bridge token. |
| `POST /api/workspace/workflows/run` | bridge or static | Dry-runs in static mode; in bridge mode returns delegation guidance. |
| `GET /api/workspace/artifacts` | bridge or static | Lists artifact metadata from `growthub bridge assets`, with sample fallback. |
| `GET /api/workspace/deploy/status` | always | Mirrors `growthub workspace deploy status` checks. |

## UI composition

| Component | Responsibility |
| --- | --- |
| `app/page.jsx` | Server entry. Reads initial config and persistence mode. |
| `components/WorkspaceBuilder.jsx` | Client owner of state, save, dirty tracking, dashboards. |
| `components/WorkspaceGrid.jsx` | 12-column canvas with pointer-based drag/resize and remove. |
| `components/WidgetPalette.jsx` | Right-side palette + bindings panel. |
| `components/widgets/WidgetRenderer.jsx` | Registry mapping `kind → component`. |
| `components/widgets/*.jsx` | Per-kind widget renderers (chart, view, iframe, rich-text, chat-session, workflow-runner, artifact-viewer). |
| `components/DeployChecklistPanel.jsx` | Reads `/api/workspace/deploy/status` and renders readiness. |
| `components/OnboardingWizard.jsx` | First-run guided flow, persists `onboarding` on complete. |

The grid uses 16 logical rows, snaps drags to whole cells, and renders the widget body inside a frame with a remove control and a south-east resize handle. No third-party drag/grid library is required.

## Modes

Every Bridge-bound adapter follows the same pattern:

1. If `AGENCY_PORTAL_INTEGRATION_ADAPTER !== "growthub-bridge"` or `GROWTHUB_BRIDGE_ACCESS_TOKEN` is missing, return a `static-sample` payload.
2. Otherwise call the hosted Bridge endpoint.
3. On any failure, fall back to the static sample. The widget never crashes.

This preserves the S143 invariant — the workspace can always render, even fully disconnected.

## Deploy checklist

`describeDeployStatus` mirrors `growthub workspace deploy status` semantically without shelling out:

- `GROWTHUB_BRIDGE_ACCESS_TOKEN`, `GROWTHUB_BRIDGE_BASE_URL`
- Integration adapter
- `.growthub-fork/fork.json` (when reachable from the runtime)
- `.growthub-fork/agents/*.json` count
- `.growthub-fork/capabilities/*.json` count
- `.growthub-fork/self-improving-proposals/*.json` count

Missing files are diagnostic, not fatal — the panel always renders.

## Onboarding

The wizard runs whenever `onboarding.completed !== true`. It walks five steps:

1. Name workspace
2. Pick starting dashboard name
3. Add first widget (drops the chosen kind on the canvas)
4. Choose integration mode (`static`, `byo-api-key`, `growthub-bridge`)
5. Review deploy checklist (opens via the rail)

State is held in component memory until the user clicks Save. The wizard updates `config.onboarding` on completion; persisting it through `PATCH /api/workspace` writes the wizard outcome to the source of truth.
