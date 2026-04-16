# Starter Kit — Overview

The Growthub Custom Workspace Starter Kit is the canonical v1 primitive for forking a single worker kit without the rest of the repository. It combines:

1. **Bundled asset tree** — the full custom-workspace kernel-packet surface (kit.json, frozen assets, brand scaffolds, setup, templates, examples, docs, growthub-meta).
2. **Vite-bundled UI shell** — a minimal React + Vite 5 studio at `studio/` that users extend with their own views.
3. **First-class Self-Healing Fork Sync Agent wiring** — `growthub starter init` materializes this tree at a user-chosen path and auto-registers it as a kit-fork with a dedicated `forkId`.

## Why a dedicated primitive

Users who want to customize one worker kit shouldn't have to fork the whole `growthub-local` repository. The starter kit gives them:

- A clean, empty workspace that still satisfies every custom-workspace kernel invariant.
- An auto-registered fork with policy, trace, and (optionally) a GitHub remote.
- A guaranteed upgrade path back to upstream via the Self-Healing Fork Sync Agent.

## End-to-end flow

```
growthub starter init --name my-workspace --out ./my-workspace
  └→ copyBundledKitSource('growthub-custom-workspace-starter-v1', './my-workspace')
  └→ registerKitFork({ forkPath: './my-workspace', kitId: '...', baseVersion: '1.0.0' })
  └→ writeKitForkPolicy(forkPath, default)
  └→ appendKitForkTraceEvent(forkPath, 'registered')
  └→ (optional) growthub kit fork create --upstream owner/repo  → GitHub remote
```
