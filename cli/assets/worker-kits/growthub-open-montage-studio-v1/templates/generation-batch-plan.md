# Generation Batch Plan

## Project Reference

| Field | Value |
|---|---|
| Client | `<client-name>` |
| Project | `<project-name>` |
| Pipeline | `<selected-pipeline>` |
| Date | `YYYY-MM-DD` |

## Execution Order

Batches run top-to-bottom. Items within a batch can run in parallel.

### Batch 1 — Research & Script

| Step | Tool / Action | Input | Output | Depends On |
|---|---|---|---|---|
| 1.1 | Web search | Topic keywords | Research brief | — |
| 1.2 | Script draft | Research brief | Script | 1.1 |

### Batch 2 — Image Generation

| Step | Provider / CMS Node | Prompt Ref | Input Assets | Expected Output | Est. Cost |
|---|---|---|---|---|---|
| 2.1 | | Scene 1 prompt | — | Scene 1 image | |
| 2.2 | | Scene 2 prompt | — | Scene 2 image | |
| 2.3 | | Scene 3 prompt | — | Scene 3 image | |

### Batch 3 — Video Generation (if applicable)

| Step | Provider / CMS Node | Prompt Ref | Source Image | Duration | Est. Cost |
|---|---|---|---|---|---|
| 3.1 | | Scene 1 video prompt | Scene 1 image | 5s | |
| 3.2 | | Scene 2 video prompt | Scene 2 image | 5s | |

### Batch 4 — Audio

| Step | Provider | Type | Input | Duration | Est. Cost |
|---|---|---|---|---|---|
| 4.1 | | TTS narration | Script | — | |
| 4.2 | | Background music | Genre/mood spec | — | |

### Batch 5 — Composition & Post-Production

| Step | Tool | Input | Output | Depends On |
|---|---|---|---|---|
| 5.1 | Remotion / FFmpeg | All scene assets + audio | Draft render | Batches 2-4 |
| 5.2 | Subtitle gen | TTS audio | SRT/VTT | 4.1 |
| 5.3 | FFmpeg | Draft render + subtitles | Final render | 5.1, 5.2 |

## Cost Summary

| Batch | Estimated Cost |
|---|---|
| Batch 1 (Research) | $0.00 |
| Batch 2 (Images) | $— |
| Batch 3 (Video) | $— |
| Batch 4 (Audio) | $— |
| Batch 5 (Post) | $0.00 |
| **Total** | **$—** |

## Budget Gate

| Field | Value |
|---|---|
| Budget cap | $10.00 |
| Estimated total | $— |
| Approved | `<yes / pending>` |
