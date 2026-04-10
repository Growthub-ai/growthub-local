# Email Draft Template

> One file per email. Copy this template for each email in the sequence.
> File naming: `<ClientSlug>_Email<NN>_<Theme>_v<N>_<YYYYMMDD>.md`

---

## METADATA

```
EMAIL:        [N of N in sequence]
THEME:        [theme name from sequence plan]
SEND DAY:     [Day X]
PILLAR:       [pillar name]
SEGMENT:      [segment tag]
CAMPAIGN:     [campaign name]
CLIENT:       [client slug]
VERSION:      v1
DATE:         YYYY-MM-DD
```

---

## SUBJECT LINE (PRIMARY)

**Subject:** [subject line — from subject line matrix]  
**Preview:** [preview text — complements, does not repeat the subject]

> Note: Always write subject line and preview text as a pair.
> Full subject line variants in: `<ClientSlug>_SubjectLineMatrix_v1_<YYYYMMDD>.md`

---

## EMAIL BODY

---

### OPENING HOOK

> 1–2 sentences. Earns the scroll. Names the tension, opens a loop, or delivers an insight.
> Rule: If the reader stops here, they should still feel like they got something.

[Opening hook — write here]

---

### BODY BLOCK 1

> Choose block type from module library. 2–4 sentences. One idea.
> Module: `templates/email-modules/body/[problem-agitate | value-reveal | story-bridge | education-block].md`

[Body block 1 — write here]

---

### BODY BLOCK 2

> Second block. Advance the arc. 2–4 sentences.
> If this is a short email (cold/follow-up), Body Block 2 may be the CTA setup.

[Body block 2 — write here]

---

### BODY BLOCK 3 (OPTIONAL)

> Use for nurture and educational emails. Skip for cold/follow-up.

[Body block 3 — write here if needed]

---

### PRIMARY CTA

> One CTA. Verb-first. Specific outcome. Repeat in PS.
> Module: `templates/email-modules/cta/[primary-cta | soft-cta | reply-cta].md`

**[CTA text — e.g. "Book your growth call →"]**

[CTA URL or action]

---

### PS LINE

> High-readership. Reinforce the primary CTA or add a secondary angle.
> Rule: Always include a PS. It's often the second thing the reader reads.

**PS:** [PS line — 1–2 sentences max]

---

## PLAIN-TEXT FALLBACK

> Required in every draft. Used by platform for plain-text version of the email.
> No formatting, no links except raw URLs.

```
Subject: [subject line]
Preview: [preview text]

[Full email in plain text]

[Primary CTA text]: [URL]

---

You're receiving this because [reason]. Unsubscribe: [link]
[Physical mailing address]
```

---

## PLATFORM SLOT MAP

> Complete only if platform handoff is in scope.
> Maps email copy into platform template slots for API or browser transfer.

```yaml
subject_line:    "[value]"
preview_text:    "[value]"
from_name:       "[value from brand kit]"
from_email:      "[value from brand kit]"
body_block_1:    "[copy]"
body_block_2:    "[copy]"
body_block_3:    "[copy — or 'N/A']"
cta_text:        "[value]"
cta_url:         "[value]"
ps_line:         "[value]"
footer_text:     "[unsubscribe + physical address from brand kit]"
platform_tag:    "[segment tag from sequence plan]"
send_delay:      "[Day X of sequence]"
```

---

## NOTES & VARIANTS

> Optional. Use to log review notes, copy variants, or decisions made during writing.

- [ ] Subject line A/B test selected: **[variant X]** vs **[variant Y]**
- [ ] Reviewed against brand kit guardrails
- [ ] Compliance footer confirmed
- [ ] Plain-text fallback complete
- [ ] Platform slot map complete
