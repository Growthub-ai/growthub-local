# Starter Kit — Output Standards

All generated artifacts write to `output/<client-slug>/<project-slug>/`.

Required artifacts per project:

- `workspace-brief.md` — the user-supplied brief (or a generated one)
- `deployment-plan.md` — machine-readable and human-reviewable
- `trace-summary.md` — distilled view of `.growthub-fork/trace.jsonl` for the run

Machine-readable outputs must be shape-compatible with the `growthub-custom-workspace-starter-v1` bundle descriptor.
