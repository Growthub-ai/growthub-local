# Agency Portal Starter Kit — Overview

The Growthub Agency Portal Starter Kit specializes the custom workspace starter primitive into a first-party agency portal workspace. It combines:

1. **Governed workspace substrate** — kit manifest, frozen assets, brand scaffolds, setup, templates, docs, growthub-meta, session memory, self-eval, helpers, and sub-skill conventions.
2. **Vite-bundled local shell** — a React + Vite studio at `studio/` that remains the Growthub Local operator surface.
3. **Vercel-ready app payload** — a Next.js app at `apps/agency-portal/` with adapter-first persistence, auth, and payment contracts.
4. **First-class Self-Healing Fork Sync Agent wiring** — exports register as kit-forks with policy, trace, and a dedicated `forkId`.

## Why a dedicated primitive

Users who want a production agency portal should not inherit a provider-locked app as their worker-kit contract. This kit gives them:

- A governed workspace that satisfies every custom-workspace kernel invariant.
- Local-first operation through the Vite shell.
- Clean Vercel deployment through `apps/agency-portal/`.
- Configurable persistence through Postgres, Qstash KV, or provider-managed adapters.
- An auto-registered fork with policy, trace, and (optionally) a GitHub remote.
- A guaranteed upgrade path back to upstream via the Self-Healing Fork Sync Agent.

## End-to-end flow

```
growthub kit download growthub-agency-portal-starter-v1 --out ./exports
  └→ copyBundledKitSource('growthub-agency-portal-starter-v1', './my-workspace')
  └→ registerKitFork({ forkPath: './my-workspace', kitId: '...', baseVersion: '1.0.0' })
  └→ writeKitForkPolicy(forkPath, default)
  └→ appendKitForkTraceEvent(forkPath, 'registered')
  └→ (optional) growthub kit fork create --upstream owner/repo  → GitHub remote
```
