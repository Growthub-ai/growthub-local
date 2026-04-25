# helpers/

Safe shell helpers for the creative-video-pipeline operator. These wrap external commands with error handling and env validation. Never call raw CLI commands without going through these helpers.

| Helper | Purpose |
|--------|---------|
| `run-pipeline.sh` | Wraps `growthub pipeline execute` for Stage 2 |
| `check-generative-adapter.sh` | Validates env for the selected generative adapter |
| `check-pipeline-health.sh` | End-to-end readiness check across all three stages (composes the two above + Stage-3 deps + sub-skill / helper presence). Supports `--json`. |
