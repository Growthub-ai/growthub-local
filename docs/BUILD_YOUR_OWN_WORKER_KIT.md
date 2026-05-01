# Build Your Own Worker Kit

Worker Kits are portable, versioned, governed workspace environments. Anyone can build one.

## Fastest path

```bash
# Start from the custom workspace starter
npm create @growthub/growthub-local@latest -- --profile workspace --out ./my-kit
cd my-kit

# Or fork an existing kit
growthub kit download growthub-custom-workspace-starter-v1 --out ./my-kit
```

## Required structure (v1.2 primitives)

```
my-kit/
  kit.json                          # schemaVersion 2, kit metadata
  SKILL.md                          # primitive #1 — discovery entry
  AGENTS.md                         # pointer to SKILL.md
  CLAUDE.md                         # pointer to SKILL.md
  .cursorrules                      # pointer to SKILL.md
  templates/
    project.md                      # primitive #3 — session memory template
    self-eval.md                    # primitive #4 — self-eval loop template
  helpers/
    README.md                       # primitive #6 — safe shell tool layer
  skills/
    README.md                       # primitive #5 — sub-skill convention
  workers/<worker-id>/CLAUDE.md     # agent contract
  bundles/<kit-id>.json             # bundle manifest
  .env.example
  QUICKSTART.md
```

## kit.json schema v2

```json
{
  "schemaVersion": 2,
  "kit": {
    "id": "my-kit-v1",
    "version": "1.0.0",
    "name": "My Kit",
    "description": "...",
    "type": "worker",
    "family": "studio"
  },
  "entrypoint": { "workerId": "operator", "path": "workers/operator/CLAUDE.md" },
  "workerIds": ["operator"],
  "agentContractPath": "workers/operator/CLAUDE.md",
  "frozenAssetPaths": ["QUICKSTART.md", "SKILL.md", "kit.json", ...],
  "outputStandard": { "type": "working-directory", "requiredPaths": ["QUICKSTART.md", "kit.json", ...] },
  "bundles": [{ "id": "my-kit-v1", "version": "1.0.0", "path": "bundles/my-kit-v1.json" }],
  "executionMode": "export",
  "activationModes": ["export"],
  "compatibility": { "cliMinVersion": "0.9.3" }
}
```

## Validate

```bash
growthub kit validate ./my-kit
growthub skills validate --root ./my-kit
growthub kit health ./my-kit --json
```

## Publish to the community registry

```bash
growthub kit publish validate ./my-kit
growthub kit publish pack ./my-kit --out ./dist
# Submit to: https://github.com/Growthub-ai/awesome-growthub-kits
```

## Resources

- [`docs/WORKER_KIT_CONTRIBUTOR_GUIDE.md`](./WORKER_KIT_CONTRIBUTOR_GUIDE.md)
- [`docs/KIT_PUBLISH_CONTRACT_V1.md`](./KIT_PUBLISH_CONTRACT_V1.md)
- [`docs/COMMUNITY_KIT_REGISTRY.md`](./COMMUNITY_KIT_REGISTRY.md)
- [`AGENTS.md`](../AGENTS.md) — governed workspace primitives v1.2
