# Output Directory

This directory holds all work products from the AI Website Cloner operator.

## Structure

```
output/
  <client-slug>/
    <project-slug>/
      research/
        reconnaissance-report.md   # Screenshots documented, design tokens noted
        design-token-extraction.md  # Complete token set with oklch conversions
        asset-inventory.md          # All external assets collected
      specs/
        <section-slug>.md           # One file per cloned section (exact CSS values)
      qa/
        visual-qa-checklist.md      # QA results vs. original screenshots
      platform-handoff.md           # Deployment-ready instructions
```

## Notes

- Never commit client brand assets or proprietary content to this repository.
- All files in `output/` are generated work products, not source-controlled code.
- Add `output/<client-slug>/` to `.gitignore` for client-confidential projects.
