# Output Standards — Open Montage Studio

All artifacts produced by the Open Montage Studio Operator must follow these standards.

---

## Directory Structure

```
output/<client-slug>/<project-slug>/
├── video-production-brief.md
├── pipeline-selection-brief.md
├── provider-selection-brief.md
├── scene-plan.md
├── prompt-matrix.md
├── generation-batch-plan.md
├── asset-tracking.md
├── review-qa-checklist.md
├── platform-ready-execution-handoff.md
├── cms-node-pipeline-mapping.md          (if CMS nodes used)
└── assets/                               (generated assets, if local-fork mode)
    ├── images/
    ├── video/
    ├── audio/
    └── render/
```

---

## File Naming

- Use kebab-case for all file names
- Include the project slug in the directory path, not in each file name
- Asset files use the pattern: `<scene-number>-<type>-<sequence>.<ext>` (e.g., `01-image-001.png`)

---

## Markdown Standards

- All artifacts are Markdown files
- Use tables for structured data (not inline lists)
- Use code blocks for commands, paths, and configuration values
- Every artifact must include a Project Reference header with client, project, pipeline, and date
- Templates must be filled completely — no empty placeholder fields in final output

---

## Render Profiles

| Profile | Resolution | Aspect Ratio | FPS | Codec | Bitrate |
|---------|-----------|--------------|-----|-------|---------|
| YouTube Landscape | 1920x1080 | 16:9 | 30 | H.264 | 8 Mbps |
| YouTube 4K | 3840x2160 | 16:9 | 30 | H.264 | 35 Mbps |
| YouTube Shorts | 1080x1920 | 9:16 | 30 | H.264 | 8 Mbps |
| Instagram Reels | 1080x1920 | 9:16 | 30 | H.264 | 8 Mbps |
| Instagram Feed | 1080x1080 | 1:1 | 30 | H.264 | 8 Mbps |
| TikTok | 1080x1920 | 9:16 | 30 | H.264 | 8 Mbps |
| LinkedIn | 1920x1080 | 16:9 | 30 | H.264 | 8 Mbps |
| Cinematic | 2560x1080 | 21:9 | 24 | H.264 | 12 Mbps |

---

## Quality Bars

- **No slideshow outputs** — image-based videos must score >= 6.0 on the slideshow risk assessment
- **Audio must be present** — silent video is only acceptable when explicitly requested
- **Subtitles must be word-level timed** — no sentence-level block captions
- **Transitions must be intentional** — no default cuts everywhere; vary based on scene mood
- **Color grading is expected** — unless the user explicitly opts out

---

## Deliverable Line Format

When logging a deliverable in the brand kit:

```
- YYYY-MM-DD | OpenMontage Video Package v<N> — <Project Name> | output/<client-slug>/<project-slug>/
```
