# Email Format Library — INDEX

> Check this index FIRST before creating any campaign structure.
> If a frozen format matches the campaign type, use it — do not reinvent the arc.
> If no format matches, build from `templates/sequence-planner.md` and freeze after delivery.

---

## FORMAT LOOKUP TABLE

| # | Format Name | Campaign Type | Emails | Duration | Pillar Fit | File |
|---|---|---|---|---|---|---|
| 1 | Lead Nurture — 5 Email | Nurture sequence for new leads | 5 | 14 days | 1, 2, 4 | `nurture-sequence.md` |
| 2 | Cold Outbound — 4 Email | Cold outreach to new prospect | 4 | 9 days | 2, 4, 5 | `outbound-cold-sequence.md` |
| 3 | Promotional Broadcast | Single one-off promotional email | 1 | Single send | 2, 3, 5 | `promotional-broadcast.md` |
| 4 | Re-Engagement — 3 Email | Win-back for silent or stalled contacts | 3 | 15 days | 3, 5 | `re-engagement.md` |
| 5 | Post-Demo Follow-Up — 3 Email | Follow-up after demo or discovery call | 3 | 4 days | 1, 3, 5 | `follow-up-sequence.md` |

---

## FORMAT SELECTION GUIDE

**"I have a new lead from a form fill or ad opt-in"**
→ Use Format 1: Lead Nurture — 5 Email

**"I want to reach out cold to a prospect list"**
→ Use Format 2: Cold Outbound — 4 Email

**"I want to send one email about an offer, event, or announcement"**
→ Use Format 3: Promotional Broadcast

**"I have contacts who went silent or didn't convert — I want to re-engage them"**
→ Use Format 4: Re-Engagement — 3 Email

**"Someone just had a demo or discovery call and I need to follow up"**
→ Use Format 5: Post-Demo Follow-Up — 3 Email

**"None of these match what I need"**
→ Build a custom arc using `templates/sequence-planner.md`. After delivery, freeze it here.

---

## HOW TO FREEZE A NEW FORMAT

When you create a custom campaign arc that works well:

1. Document it using the format structure from any existing format file
2. Save to `templates/email-formats/<format-id>.md`
3. Add a row to this INDEX
4. Note the client and campaign it was first used for in the format file header

---

## SACRED RULES FOR FORMATS

- **Format email count is sacred.** If a format has 5 emails, the sequence has 5 emails. Don't compress unless the user explicitly requests a shorter version.
- **Format arc is sacred.** The emotional arc (e.g. problem → insight → proof → activation) does not change. Only the content and copy change.
- **Pillar determines angle.** The same format used with Pillar 2 vs Pillar 4 produces completely different copy — that's intentional.
- **One format per campaign.** Never blend nurture and cold outbound logic in the same sequence.
