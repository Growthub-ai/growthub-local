# Output Directory

This directory stores all production artifacts created by the Open Montage Studio Operator.

## Structure

```
output/
└── <client-slug>/
    └── <project-slug>/
        ├── video-production-brief.md
        ├── pipeline-selection-brief.md
        ├── provider-selection-brief.md
        ├── scene-plan.md
        ├── prompt-matrix.md
        ├── generation-batch-plan.md
        ├── asset-tracking.md
        ├── review-qa-checklist.md
        ├── platform-ready-execution-handoff.md
        ├── cms-node-pipeline-mapping.md     (if CMS nodes used)
        └── assets/                          (if local-fork mode)
            ├── images/
            ├── video/
            ├── audio/
            └── render/
```

## Conventions

- One directory per client, one subdirectory per project
- Use kebab-case for slugs
- All production artifacts are Markdown files
- Generated media assets go in `assets/` subdirectories
- Final render goes in `assets/render/`
