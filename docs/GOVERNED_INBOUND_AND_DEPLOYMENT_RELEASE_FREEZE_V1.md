# Governed Inbound And Deployment Release Freeze V1

The official frozen truth for the PR #263 workspace-kit release surface: native inbound workflow invocation plus governed Vercel/GitHub deployment from Workspace Marketplace and Workspace Apps.

This document does not introduce new architecture. It records the exact capability boundary now shipped in `growthub-custom-workspace-starter-v1` so agents and humans can validate, extend, or release the feature without inventing side paths.

---

## What this release freezes

This release turns the workspace into a complete no-code operating loop for external invocation and deployment:

1. A workflow can be exposed through native **Webhook** or **API Request** input methods without marketplace installation.
2. The user completes **Connect -> Bind -> Test -> Go live** from the workflow sidecar.
3. Test events execute the real downstream graph and write proof back to the governed workflow row.
4. Publish is blocked until fresh proof matches the active draft and input method.
5. The `/schedule` command remains product-lane dispatched: QStash scheduler products route to existing scheduler cores, while Webhook/API products route to inbound method cores.
6. The workspace app can be deployed from Marketplace through GitHub private repo creation, Vercel project creation, live deployment, and governed Data Model publication.
7. `/settings/apps` closes the loop with atomic app-surface links to the exact GitHub repo and Vercel deployment.

The product model is workspace-first: API Registry rows, workflow rows, app registry rows, Vercel project rows, and source receipts are the durable state. Provider credentials resolve server-side only.

---

## Topology

```
apps/workspace/
├── app/workflows/                         # no-code workflow sidecar and canvas
│   └── publish route owns draft -> live
├── app/api/workspace/workflows/growthub/  # external inbound destination door
├── app/api/workspace/workflow/publish/    # publish gate with proof freshness
├── app/api/workspace/add-ons/
│   ├── providers/[providerId]/            # marketplace provider/product sync
│   ├── github/credentials/                # GitHub credential import/verification
│   └── vercel/
│       ├── create-app/                    # preflight state for guided deploy
│       ├── create-app/github-repo/        # private GitHub repo + starter seed
│       ├── create-app/project/            # Vercel project linked to repo
│       ├── deploy/                        # live Vercel deployment + proof write
│       └── projects/                      # governed Vercel project directory
├── app/components/
│   ├── WorkspaceAddOnsMarketplace.jsx     # provider/product marketplace shell
│   └── VercelCreateAppFlow.jsx            # Create Production App flow
├── app/settings/apps/                     # app-surface closed-loop links
├── lib/
│   ├── workspace-add-ons.js               # provider/product/app registry helpers
│   ├── workspace-add-on-create-app.js     # deploy checklist derivation
│   ├── workspace-add-on-deployments.js    # Vercel deploy request/proof helpers
│   ├── workspace-inbound-invocation.js    # inbound invocation contract
│   ├── workspace-scheduler-orchestration.js
│   └── workspace-data-model.js            # governed object schemas
└── growthub.config.json                   # active governed workspace state
```

No release state lives only in React component memory. Every successful user step lands in a governed row, receipt, or provider registry record.

---

## File-by-file authority

| Surface | What it owns | Durable state |
| --- | --- | --- |
| Workflow sidecar | Select input method, bind, generate test event, show last-run inspector, publish. | Workflow row fields and server-owned run proof. |
| `POST /api/workspace/workflows/growthub` | External Webhook/API Request destination. | `lastScheduledRun*`, `lastResponse`, source receipts. |
| `POST /api/workspace/workflow/publish` | Draft -> live transition. | Live workflow graph, version, publish metadata. |
| API Registry | Product/provider capability rows. | `api-registry` object rows with env refs only. |
| `/schedule` | Product-lane dispatch and cockpit view. | Existing scheduler rows plus method chips/status from governed rows. |
| Marketplace Vercel provider | Provider account, product sync, Vercel Deployments install row. | `api-registry` provider/product rows. |
| Guided Vercel create app | GitHub repo, Vercel project, deployment, publish proof. | `workspace-app-registry` and `vercel-projects` rows. |
| `/settings/apps` | Human closed-loop view of app deployment state. | Derived from `workspace-app-registry` + `vercel-projects`, deduped by provider URL. |

---

## Inbound invocation contract

Native inbound methods are not marketplace products the user must install. They are first-class workflow input methods that mirror the scheduler product shape where that shape is useful and diverge where the product lane differs.

| Method | Auth | Trigger kind | Required env ref | Door |
| --- | --- | --- | --- | --- |
| Webhook | v1 HMAC signature | `webhook` | `GROWTHUB_WEBHOOK_SIGNING_SECRET` | `POST /api/workspace/workflows/growthub` |
| API Request | Bearer token | `api-request` | `GROWTHUB_API_INVOKE_TOKEN` | `POST /api/workspace/workflows/growthub` |

Rules:

1. Bind writes one governed workflow binding with `runLocality=serverless`, `scheduleId`, and method-specific `schedulerTriggerKind`.
2. The canvas adopts the server-synced trigger graph after bind; the trigger node `inputMode` must match the chosen method.
3. Test events are generated from the input node `samplePayload` / trigger input contract and may be edited in the modal.
4. Sending the test event executes every downstream node. A button click without downstream proof is not sufficient.
5. The state pill moves to **Verified 200** without manual refresh only after server proof lands.
6. Publish before verified proof is blocked in UI and by `POST /api/workspace/workflow/publish`.
7. Publish after verified proof returns HTTP 200 and retains the binding.
8. Proof freshness is content-aware and draft-aware; stale binding, stale trigger kind, or changed downstream draft requires a fresh test.

---

## Scheduler separation contract

The add-ons schedule route dispatches by product lane:

```
QStash product       -> existing scheduler cores
Webhook/API product  -> inbound method cores
```

Rules:

1. QStash scheduler behavior remains self-contained and unchanged.
2. Webhook and API Request are not presented to users as equal mental-model scheduler jobs. They are push invocation methods for workflows.
3. `/schedule` may show Webhook/API method chips for bound rows, but scheduler binding/testing/publishing must keep its existing QStash lane.
4. Cross-method uninstall is refused. Method-owned bindings can only be removed by their owning lane.

---

## Vercel/GitHub deployment contract

The Marketplace Vercel provider adds a no-code deployment path for the workspace app:

```
GitHub account
  -> private repo creation + starter seed
  -> Vercel account/product verification
  -> Vercel project linked to repo
  -> live deployment
  -> governed Data Model publication
  -> /settings/apps external links
```

Rules:

1. GitHub and Vercel credentials are verified server-side. Secrets are never stored in `growthub.config.json`, rendered into the browser, or written to source records.
2. GitHub repo creation is private-by-default and writes the same governed Vercel project row shape before a Vercel project exists.
3. Vercel project creation links the GitHub repo at project creation time.
4. Deployment uses the Vercel REST API through the server route and includes the required auto-detection confirmation for new projects.
5. A successful guided deployment registers the `vercel-deployments` product through the existing `api-registry` product row pattern.
6. `workspace-app-registry` records the app-surface association: app id, surface path, repo URL, deployment URL, status, and registry references.
7. `vercel-projects` records project/deployment metadata only: project id, repo ref, deployment id/url/state, dashboard URL, registry id, proof timestamps.
8. `/settings/apps` derives icons from governed rows and dedupes by provider URL, so one GitHub repo and one Vercel deployment show for the workspace app.

---

## Governed rows

### `api-registry`

Provider and product rows are capability records. They store refs, not secrets.

Required release rows after Vercel setup:

- `vercel-provider` with `status=connected`
- `vercel-deployments` with `productId=vercel-deployments`, `status=connected`, and selected plan

### `workspace-app-registry`

One row per app surface.

Required release fields for the workspace app:

```ts
{
  appId: "workspace",
  surfacePath: "apps/workspace",
  packageName: "growthub-workspace-app",
  deployTarget: "vercel",
  status: "connected" | "live",
  githubRepo: string,
  githubRepoUrl: string,
  vercelProjectUrl?: string,
  deploymentUrl?: string,
  registryIds: string
}
```

### `vercel-projects`

One row per Vercel project linked to a workspace app.

Required release fields:

```ts
{
  Name: string,
  projectId: string,
  gitProvider: "github",
  gitRepo: string,
  gitRepoId?: string,
  latestDeploymentId?: string,
  latestDeploymentUrl?: string,
  latestDeploymentState?: string,
  lastDeployRequestedAt?: string,
  lastDeployStatus?: string,
  lastDeployProof?: string,
  registryId: "vercel-deployments",
  status: "linked" | "live"
}
```

---

## Browser QA proof bar

Agents must prove this release through the real workspace browser surface before declaring it complete.

Required proof language:

```text
Using Codex IAB via browser-client.mjs.
Backend: iab.
Current URL: <url>.
Visible surface: <route or heading>.
Live action layer: tab.cua.<method>.
Readback layer: tab.playwright.evaluate or DOM snapshot.
```

Inbound proof:

- Webhook and API Request each bind from the sidecar.
- Test-event modal opens with seeded JSON.
- Edited event sends and returns Verified 200 without manual refresh.
- Last-run inspector shows response / trace / details.
- Publish is blocked before proof and returns 200 after proof.
- External Webhook HMAC and API bearer requests return 200; tampered credentials return 401.

Deployment proof:

- Marketplace provider verifies GitHub and Vercel credentials server-side.
- Private GitHub repo is created and bound.
- Vercel project is created and linked to the repo.
- **DEPLOY LIVE** returns a live deployment URL.
- External deployment URL returns HTTP 200.
- `api-registry`, `workspace-app-registry`, and `vercel-projects` rows are populated.
- `/settings/apps` shows exactly one GitHub link and one Vercel link for the workspace app.
- Hover popovers render above the icons and are not clipped by the card.

---

## Automated gates

Focused gates for this release:

```bash
pnpm test:inbound-invocation
pnpm test:add-ons-scheduler
pnpm test:scheduler-orchestration
pnpm test:serverless-readiness
pnpm test:schedule-cockpit
pnpm test:add-ons-vercel
node --test scripts/unit-workspace-app-registry.test.mjs scripts/unit-workspace-add-ons-vercel.test.mjs
```

PR release gates:

```bash
pnpm check:worker-kits
pnpm check:monorepo-boundary
bash scripts/pr-ready.sh
```

Remote PR #263 proof at freeze time:

- `smoke`: SUCCESS
- `validate`: SUCCESS
- `verify`: SUCCESS

---

## Out of scope for this freeze

- Browser-held provider secrets.
- Client-side GitHub or Vercel API calls.
- Treating Webhook/API Request as QStash scheduler equivalents.
- New persistence backends.
- Auto-merging or auto-approving release state.
- Replacing the existing scheduler lane.
- Creating a separate app deployment state outside `api-registry`, `workspace-app-registry`, and `vercel-projects`.

This freeze is the substrate for future marketplace providers: add provider-specific account/product/project rows, keep credentials server-side, prove through the browser, and close the loop in the governed app registry.
