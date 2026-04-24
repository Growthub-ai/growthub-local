# Pipeline Brief — [CLIENT NAME] / [CAMPAIGN NAME]
> Stage 1 output. Write this file to `output/<client-slug>/<project-slug>/brief/pipeline-brief.md`.
> Pull all brand values from `brands/<client-slug>/brand-kit.md`. Do not invent brand detail.

---

## BRAND CONSTRAINTS

> ⚠️ This ad must NEVER:
> - [Pull from brand-kit.md `messaging_guardrails`]
> - [Pull from brand-kit.md `do_not_attract`]

---

## BRIEF OVERVIEW

| Field | Value |
|---|---|
| Client | |
| Campaign | |
| Date | |
| Format | (UGC / AI Avatar / Explainer / Performance) |
| Length | (seconds) |
| Primary Goal | (Conversion / Awareness / Education) |
| Hook Variations | (default 5 — A through E) |
| Scene Count | |
| Aspect Ratios | (9:16 + 1:1 minimum) |
| Captions | ON |
| CTA Offer | |
| Landing Page | |

---

## SCENE STRUCTURE

| Scene | Name | Timecode | Beat |
|---|---|---|---|
| 1 | Hook | 0:00–0:05 | N hook variations A–E |
| 2 | Problem | 0:05–0:15 | Consistent across all hooks |
| 3 | Solution | 0:15–0:25 | Consistent across all hooks |
| N | CTA | 0:25–0:30 | Consistent across all hooks |

---

## SCENE 1 — HOOK (N VARIATIONS)

> All variations share the same Scene 2–N structure. Only Scene 1 differs.

### Hook A — [Type]
**Visual:** 
**On-Screen Text:** 
**VO:** 

### Hook B — [Type]
**Visual:** 
**On-Screen Text:** 
**VO:** 

### Hook C — [Type]
**Visual:** 
**On-Screen Text:** 
**VO:** 

### Hook D — [Type]
**Visual:** 
**On-Screen Text:** 
**VO:** 

### Hook E — [Type]
**Visual:** 
**On-Screen Text:** 
**VO:** 

---

## SCENES 2–N (CONSISTENT ACROSS ALL HOOK VARIATIONS)

### Scene 2 — [Name]
**Visual:** 
**On-Screen Text:** 
**VO:** 

### Scene 3 — [Name]
**Visual:** 
**On-Screen Text:** 
**VO:** 

### Scene N — CTA
**Visual:** 
**On-Screen Text:** 
**VO:** `[CTA text from brand kit]`

---

## EDITING GUIDELINES

- **Pacing:** Cut every ~3s unless specified otherwise
- **Music:** [direction]
- **Captions:** ON — match VO rhythm
- **Color grade:** [direction]
- **Aspect ratios:** 9:16 primary, 1:1 secondary
- **NO list:** [pull from brand-kit.md messaging_guardrails]

---

## APPENDIX — AI GENERATION PROMPTS (OPTIONAL)

> These prompts feed Stage 2 of the pipeline. Each prompt maps to one scene / one clip.
> Keep prompts in this appendix only. Never inline in scene blocks above.

### Video prompt — Scene 1 (Hook A)

```
[Scene description for video-generation CMS node]
Brand: [brand name], style: [style from brand kit], no text overlays,
[aspect ratio], [duration]s
```

### Video prompt — Scene 2

```
[Scene description]
```

### Image prompt — [Scene N background / reference]

```
[Image description]
```
