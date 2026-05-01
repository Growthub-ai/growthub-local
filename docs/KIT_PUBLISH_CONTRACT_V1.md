# Kit Publish Contract v1

Local-first metadata schema for community kit publishing. No hosted Growthub required to generate or validate.

## CLI

```bash
growthub kit publish validate ./my-kit
growthub kit publish validate ./my-kit --json
growthub kit publish pack ./my-kit --out ./dist
growthub kit publish metadata ./my-kit --json
```

## Schema

```json
{
  "version": 1,
  "kind": "growthub-community-kit-publish",
  "kitId": "my-kit-v1",
  "name": "My Kit",
  "description": "...",
  "kitVersion": "1.0.0",
  "repository": "https://github.com/myorg/my-kit",
  "license": "MIT",
  "categories": ["creative", "ops"],
  "requiresBridge": false,
  "supportsForkSync": true,
  "sdkSurfaces": ["worker-kits", "skills", "health"],
  "family": "studio",
  "entrypoints": [
    { "workerId": "operator", "path": "workers/operator/CLAUDE.md" }
  ],
  "validation": {
    "skillsValidate": true,
    "kitHealth": true,
    "workerKitCheck": true,
    "errors": [],
    "warnings": []
  },
  "generatedAt": "ISO-8601"
}
```

## Validation rules

A kit is publishable when `validation.errors` is empty:

| Check | Required | Failure means |
|-------|----------|---------------|
| `kit.id` present | yes | Not a valid kit |
| `kit.name` present | yes | Not a valid kit |
| `kit.description` present | yes | Not a valid kit |
| `kit.version` present | yes | Not a valid kit |
| `SKILL.md` exists | yes | Missing primitive #1 |
| `agentContractPath` exists on disk | yes | Broken agent contract |
| `templates/project.md` exists | recommended | Missing primitive #3 |
| `templates/self-eval.md` exists | recommended | Missing primitive #4 |
| `helpers/` exists | recommended | Missing primitive #6 |
| `skills/` exists | recommended | Missing primitive #5 |

## Categories

Use one or more from: `creative`, `agency`, `marketing`, `social`, `ops`, `ai-website`, `self-improving`, `general`

## Submission

Submit to [awesome-growthub-kits](https://github.com/Growthub-ai/awesome-growthub-kits):
1. Run `growthub kit publish pack ./my-kit`
2. Open a PR to `awesome-growthub-kits` with the metadata JSON
