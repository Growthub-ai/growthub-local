# Output Directory

All agent-generated deliverables are written here, organized by client and project.

## Structure

```
output/
  <client-slug>/
    <project-slug>/
      visual-campaign-brief.md
      studio-selection-brief.md
      model-selection-recommendation.md
      shot-plan.md
      prompt-matrix.md
      generation-batch-plan.md
      asset-tracking.md
      review-qa-checklist.md
      platform-ready-execution-handoff.md
```

## Usage

The agent creates this structure automatically when it writes its first deliverable. You do not need to create folders manually.

Use the `<client-slug>` to match your brand kit name (e.g. `growthub`, `acme-corp`) and the `<project-slug>` to identify the campaign or shoot (e.g. `q2-product-launch`, `founder-brand-video`).

## Tracking deliverables

Each completed package is logged in the active brand kit under `Deliverable History`:

```
- YYYY-MM-DD | Open Higgsfield Visual Package v<N> — <Project Name> | output/<client-slug>/<project-slug>/
```
