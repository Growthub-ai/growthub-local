# Caption Copy Deck — [Client Name] · [Project Name]

**Kit:** `growthub-zernio-social-v1`
**Generated:** [YYYY-MM-DD]
**Mode:** [api-live | agent-only | hybrid]
**Version:** `v1`

---

## Usage

One entry per scheduled post. Each entry carries exactly three variants (A direct, B narrative, C question). The operator selects one variant per post for the scheduling manifest; all three variants remain in this deck for client review.

Every variant must:

- Respect the platform's hard character limit (`docs/platform-coverage.md`)
- Match the brand voice guardrails (from the brand kit)
- Carry an explicit CTA
- Reference a real or clearly-placeholdered media asset when the post is image/video/carousel/reel/short/story

---

## Post Entry Template

### Post: [clientPostId — e.g., urban-cycle-20260501-001]

| Field | Value |
|---|---|
| clientPostId | `urban-cycle-20260501-001` |
| Date | [YYYY-MM-DD] |
| Platform | `instagram` |
| Account | [@handle or accountId] |
| Theme pillar | [Pillar name] |
| Post type | [image / video / carousel / text / reel / short / story] |
| Media | [mediaId or placeholder, with asset path reference] |
| CTA | [selected CTA] |

**Variant A — Direct**

```
[Direct-hook opening line. Declarative. Leads with benefit or fact.]

[Body — 1–2 sentences of supporting detail.]

[CTA] · [1–2 hashtags if platform allows]
```

Character count: [N]

**Variant B — Narrative**

```
[Story-beat opening. Anecdote or "we used to..." / "last week..."]

[Body — 1–2 sentences, keep the narrative voice.]

[CTA] · [hashtags if applicable]
```

Character count: [N]

**Variant C — Question / Hook**

```
[Question or provocation as opener.]

[Body — short answer or frame.]

[CTA] · [hashtags if applicable]
```

Character count: [N]

**Selection:** Variant [A/B/C] — [One-line reason for selection]

---

### Post: [next clientPostId]

[Repeat the block above for every entry in the Content Calendar.]

---

## Hashtag Reference

| Platform | Count rule | Notes |
|---|---|---|
| `instagram` | 3–5 | Mix branded + niche |
| `linkedin` | 3–5 | Professional only |
| `tiktok` | 3–6 | Trending + niche |
| `twitter` | 1–2 | One branded max |
| `bluesky` | 0 | No hashtags |
| `threads` | 0–1 | Sparse |

Full hashtag rules: `docs/ai-caption-layer.md`.

---

## Quality Checks

- [ ] All three variants per post are meaningfully different (not minor word swaps)
- [ ] Every variant ≤ the platform hard limit
- [ ] Every variant contains the selected CTA
- [ ] No `[INSERT CAPTION HERE]` style fragments remain
- [ ] No secrets, API keys, or internal references leaked into copy
