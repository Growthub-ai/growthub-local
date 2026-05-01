# Community Kit Registry

The Growthub community kit registry is an open catalog hosted at:

**[github.com/Growthub-ai/awesome-growthub-kits](https://github.com/Growthub-ai/awesome-growthub-kits)**

## Purpose

- Discover kits built by the community
- Share your own worker kits
- Fork and customize existing kits
- Stay synced via Fork Sync Agent

## Seeded kits

| Kit ID | Family | Description |
|--------|--------|-------------|
| `growthub-self-improving-workspace-v1` | workflow | Autonomous self-improving governed workspace |
| `growthub-agency-portal-starter-v1` | studio | Multi-client agency portal |
| `growthub-creative-video-pipeline-v1` | studio | AI video production pipeline |
| `growthub-video-use-studio-v1` | studio | Browser-use video workspace |
| `growthub-custom-workspace-starter-v1` | studio | Blank governed workspace starter |

## Publishing your kit

```bash
# Validate your kit is ready
growthub kit publish validate ./my-kit

# Pack the metadata artifact
growthub kit publish pack ./my-kit --out ./dist

# Submit the artifact to awesome-growthub-kits
# Open a PR: https://github.com/Growthub-ai/awesome-growthub-kits
```

Full contract: [`docs/KIT_PUBLISH_CONTRACT_V1.md`](./KIT_PUBLISH_CONTRACT_V1.md)

## Discovering community kits

```bash
growthub kit list                  # browse bundled kits
growthub kit publish validate .    # validate your own kit
```
