# helpers/

Safe shell helpers for the creative-video-pipeline operator. These wrap external commands with error handling and env validation. Never call raw CLI commands without going through these helpers.

| Helper | Purpose |
|--------|---------|
| `run-pipeline.sh` | Wraps `growthub pipeline execute` for Stage 2 |
| `check-generative-adapter.sh` | Validates env for the selected generative adapter |
