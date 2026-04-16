# Starter Kit — Runtime Assumptions

- **Node**: >= v20 (the Growthub CLI ships `resolveCliVersion()` which is tested against the same minimum).
- **Git**: required on PATH for fork-sync remote operations.
- **Vite**: `studio/` uses Vite 5 + React 18; any compatible toolchain is fine.
- **Fork registration**: the CLI expects `<forkPath>/.growthub-fork/fork.json` to exist and be readable. Do not commit this file to version control if you are publishing your fork — `.growthub-fork/` is developer-local state and should be added to `.gitignore`.
- **Policy defaults**: `autoApprove=additive`, `autoApproveDepUpdates=additive`, `remoteSyncMode=off`, `interactiveConflicts=true`.
- **Bundled sources**: everything under `frozenAssetPaths` in `kit.json` is upstream-owned. Modify at your own risk — the Self-Healing Fork Sync Agent flags every change there for confirmation.
