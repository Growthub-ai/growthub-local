# Starter Kit — Vite UI Shell Guide

The `studio/` directory ships a minimal Vite 5 + React 18 shell. It is intentionally tiny — a single `App.jsx` view that introspects the fork state.

## Extend it

Add views under `studio/src/views/<Name>.jsx`. Import them in `App.jsx`. Vite's hot-module-replacement handles the dev loop; the Self-Healing Fork Sync Agent treats any file you add under `studio/src/` as user-authored (it may still update upstream-owned files in `studio/src/` — protect yours via `policy.untouchablePaths`).

## Build + serve

```bash
cd studio
npm install
npm run dev          # dev server
npm run build        # production build -> studio/dist
node serve.mjs       # serve studio/dist on localhost
```

## Why Vite, not Next.js

- Zero server coupling — a static `dist/` directory ships anywhere.
- Fast dev loop (HMR).
- No vendor lock-in at the framework level.
- Mirrors the pattern already in production for `growthub-zernio-social-v1`.
