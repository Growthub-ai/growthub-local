# Broadcast Format Library — INDEX

> Broadcast formats are single-send email containers.
> They pair with vault assets from `broadcasts/<client>/broadcast-vault.md`.
> Check this index FIRST — match campaign goal to format, then load the format file.
>
> Broadcast formats ≠ sequence formats. Broadcasts are one-and-done sends to a list segment.
> For multi-email sequences, use `templates/email-formats/INDEX.md`.

---

## FORMAT LOOKUP TABLE

| # | Format ID | Campaign Goal | Vault Asset Types | File |
|---|---|---|---|---|
| 1 | `value-delivery` | Deliver a free resource directly — build goodwill | Lead magnets (lm-*) | `value-delivery.md` |
| 2 | `lead-magnet-traffic` | Drive traffic to a lead magnet landing page | Lead magnets with URLs | `lead-magnet-traffic.md` |
| 3 | `showcase-proof` | Share a case study, gallery, or proof asset — build credibility | Case studies, showcases | `showcase-proof.md` |
| 4 | `engagement-nudge` | Warm up cold/cool leads — nudge toward content consumption | YouTube, community, educational LMs | `engagement-nudge.md` |
| 5 | `activation-booking` | Move warm/nurtured leads toward booking a call | Testimonials, case studies + CTA | `activation-booking.md` |

---

## FORMAT SELECTION GUIDE

**"I want to give subscribers something valuable with no ask"**
→ Use `value-delivery` — lead magnet straight to inbox, CTA to access

**"I have a resource with a landing page and want to drive traffic"**
→ Use `lead-magnet-traffic` — teaser copy + CTA to landing page

**"I want to show what we've done for clients and build credibility"**
→ Use `showcase-proof` — case study or gallery highlight, soft CTA

**"My list has gone quiet or needs warming — I want to re-engage with value"**
→ Use `engagement-nudge` — low-friction value: YouTube, community, educational content

**"I have warm leads who have gotten value but haven't booked yet"**
→ Use `activation-booking` — proof + urgency + direct booking CTA

---

## BROADCAST FORMAT RULES

- **One vault asset per broadcast.** Feature one thing clearly — not a roundup of 5 items.
- **Segment before sending.** Each format has a recommended segment. Don't send activation emails to cold leads.
- **Follow cadence rules.** Check `broadcasts/<client>/broadcast-vault.md` for cadence_rules before scheduling.
- **Match CTA to format intent.** Value-delivery CTAs = access. Traffic CTAs = click to page. Activation CTAs = book/apply.
- **No pitch in value-delivery sends.** If the email is delivering free value, the CTA should be to access the resource — not to buy anything.
- **Format arc is fixed.** Subject → hook → context → value bridge → CTA → PS. Don't reorder.

---

## HOW BROADCASTS CONNECT TO THE VAULT

```
broadcast-vault.md          broadcast format file
──────────────────          ────────────────────
vault asset (lm-01)   →     value-delivery.md
  title                       [ASSET_TITLE]
  description                 [ASSET_DESCRIPTION]
  url                         [ASSET_URL]
  cta_text                    [PRIMARY_CTA_TEXT]
  audience                    → informs subject line angle
  pillar                      → informs tone and language patterns
```

Agent workflow per broadcast:
1. Load `broadcast-vault.md` — read full vault into context
2. Identify campaign goal → look up format in this INDEX
3. Select vault asset(s) that match the goal
4. Load the format file
5. Fill all `[PLACEHOLDER]` slots from vault + brand kit
6. Generate subject line matrix (3–5 options)
7. Platform handoff per `runtime-assumptions.md`
