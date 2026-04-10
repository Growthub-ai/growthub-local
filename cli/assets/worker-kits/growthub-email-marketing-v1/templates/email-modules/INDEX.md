# Email Module Library — INDEX

> Check this index before writing any copy block.
> Each module is a reusable, fill-in-the-blank primitive.
> Mix and match modules to build any email arc.
> Placeholder schema is universal across all modules.

---

## SUBJECT LINE MODULES

| Module | Type | What it does | File |
|---|---|---|---|
| Curiosity | Subject line | Opens a loop — reader must open to close it | `subject-lines/curiosity.md` |
| Social Proof | Subject line | Anchors credibility with a result or number | `subject-lines/social-proof.md` |
| Urgency | Subject line | Creates a reason to act now | `subject-lines/urgency.md` |
| Personal | Subject line | Speaks directly to the individual | `subject-lines/personal.md` |

**Selection guide:**

| Audience stage | Subject line type to lead with |
|---|---|
| Cold / first touch | Personal or Curiosity |
| Early nurture | Curiosity |
| Mid nurture | Curiosity or Social Proof |
| Late nurture / activation | Social Proof or Urgency |
| Re-engagement | Personal or Curiosity |
| Promotional | Urgency or Social Proof |
| Post-demo follow-up | Personal |

---

## BODY BLOCK MODULES

| Module | What it does | Use in | File |
|---|---|---|---|
| Problem/Agitate | Names and sharpens the pain | Email 1–2, cold outbound | `body/problem-agitate.md` |
| Value/Reveal | Introduces the insight or mechanism | Email 2–3, educational | `body/value-reveal.md` |
| Story/Bridge | Bridges insight to real-world proof | Email 3–4, proof emails | `body/story-bridge.md` |
| Education Block | Framework, how-to, structured teaching | Email 3, educational campaigns | `body/education-block.md` |

**Body arc assembly reference:**

| Campaign goal | Block sequence |
|---|---|
| Problem-aware cold prospect | Problem/Agitate → Value/Reveal |
| Early nurture (teach first) | Value/Reveal → Education Block |
| Proof-forward (warm audience) | Story/Bridge → Value/Reveal |
| Activation (late nurture) | Value/Reveal → Story/Bridge |
| Re-engagement | Value/Reveal (new angle) |

---

## CTA MODULES

| Module | What it does | Commitment level | File |
|---|---|---|---|
| Primary CTA | Direct ask — book, start, demo | High | `cta/primary-cta.md` |
| Soft CTA | Lower ask — resource, read, watch | Medium | `cta/soft-cta.md` |
| Reply CTA | Conversational ask | Low | `cta/reply-cta.md` |

**CTA selection guide:**

| Email position | CTA type |
|---|---|
| Cold Email 1 | Reply CTA |
| Cold Email 2 | Soft CTA or Reply CTA |
| Cold Email 3–4 | Soft CTA → Primary CTA |
| Nurture Email 1–2 | Soft CTA or Reply CTA |
| Nurture Email 3 | Soft CTA |
| Nurture Email 4–5 | Primary CTA |
| Re-engagement Email 1–2 | Reply CTA or Soft CTA |
| Re-engagement Email 3 | Reply CTA (yes/no/later) |
| Post-demo Email 1 | Primary CTA or Soft CTA |
| Post-demo Email 2–3 | Primary CTA |
| Promotional | Primary CTA |

---

## UNIVERSAL PLACEHOLDER SCHEMA

All modules use these placeholders. Pull values from the active brand kit.

| Placeholder | Source | Example |
|---|---|---|
| `[BRAND_NAME]` | `brand_kit.client_name` | Growthub |
| `[PERSONA_ROLE]` | `brand_kit.primary_persona.role` | agency owner, CGO |
| `[PAIN_POINT]` | `brand_kit.primary_persona.pain_point` | creative bottleneck |
| `[DESIRED_OUTCOME]` | `brand_kit.primary_persona.desired_outcome` | scale spend without increasing production cost |
| `[CAMPAIGN_ANGLE]` | Confirmed in CLAUDE.md Step 4 | the bottleneck isn't your team... |
| `[PROOF_POINT]` | `brand_kit.proof_points` (approved only) | went from 100K to 500K in ad spend |
| `[PRIMARY_CTA_TEXT]` | `brand_kit.primary_cta_text` | Book your growth call |
| `[PRIMARY_CTA_URL]` | `brand_kit.primary_cta_url` | [URL] |
| `[APPROVED_PHRASE]` | `brand_kit.approved_phrases` | creative velocity |
| `[PILLAR_LANGUAGE]` | `skills.md → STEP 4` language patterns | growth infrastructure |
| `[SENDER_NAME]` | `brand_kit.email_from_name` | [Name] at Growthub |
| `[SEGMENT_TAG]` | Confirmed in Step 3 | new-lead, warm-prospect |
