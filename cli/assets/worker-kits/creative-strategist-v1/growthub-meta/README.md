# Growthub Agent Worker Kit Metadata

This folder defines the reusable metadata contract for exporting this worker kit through the Growthub CLI.

The source materials in `claude-workers` stay intact. Growthub reads the frozen machine-readable files added alongside them, then exports only the approved public kit payload declared by `kit.json` and `bundles/creative-strategist-v1.json`.

For V1:

- the only kit is `creative-strategist-v1`
- the only public example brand is `solawave`
- confidential brand kits are intentionally excluded from the frozen public payload
- the exported artifact is a local working-directory-ready bundle, not a server install

See `kit-standard.md` for the locked contract.
