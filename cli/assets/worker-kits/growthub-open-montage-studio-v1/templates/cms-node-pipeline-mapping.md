# CMS Node → OpenMontage Pipeline Mapping

## Purpose

This template documents how GrowthHub CMS node outputs integrate into the selected OpenMontage pipeline. Fill this out when the production plan uses CMS nodes for any generation step.

## Project Reference

| Field | Value |
|---|---|
| Client | `<client-name>` |
| Project | `<project-name>` |
| Pipeline | `<selected-pipeline>` |
| Date | `YYYY-MM-DD` |

## CMS Nodes in Use

| CMS Node Slug | Family | Execution Kind | Role in Pipeline |
|---|---|---|---|
| | `video` / `image` / `text` | `hosted-execute` | |

## Mapping: CMS Output → OpenMontage Input

| CMS Node | Output Type | Output Format | OpenMontage Stage | OpenMontage Tool Category | Integration Method |
|---|---|---|---|---|---|
| | Video URL | mp4 | `assets` | `tools/video/` | Download URL → source clip |
| | Image URL | png/jpg | `assets` | `tools/graphics/` | Download URL → scene image |
| | Audio URL | mp3/wav | `edit` | `tools/audio/` | Download URL → narration track |
| | Text | string | `script` | — | Direct script content |

## Execution Flow

```
1. Agent identifies required CMS nodes from the scene plan
2. Agent prepares input bindings for each CMS node
3. CMS nodes execute via hosted execution client
4. Agent collects output URLs from execution results
5. Output URLs feed into OpenMontage pipeline at the appropriate stage
6. OpenMontage handles composition and post-production
```

## Input Bindings Per Node

### CMS Node: `<slug>`

| Input Key | Type | Value | Source |
|---|---|---|---|
| | | | `<from scene plan / user input / previous node output>` |

## Output Routing

### CMS Node: `<slug>`

| Output Key | Type | Routes To | OpenMontage Asset ID |
|---|---|---|---|
| | | Scene `<N>` source clip / image | `A-<NNN>` |

## Fallback Plan

If a CMS node execution fails:

| CMS Node | Fallback Provider | Fallback Tool | Cost Impact |
|---|---|---|---|
| | | | |
