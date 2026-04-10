# Output Standards — Email Marketing Strategist v1

This document defines the output format contract for all artifacts produced by this kit.
Every output must conform to these standards before platform handoff or delivery to the user.

---

## OUTPUT FOLDER STRUCTURE

```
output/
└── <client-slug>/
    └── <campaign-slug>/
        ├── <ClientSlug>_CampaignBrief_<Pillar>_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_SequencePlan_<Type>_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_Email01_<Theme>_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_Email02_<Theme>_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_Email03_<Theme>_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_Email04_<Theme>_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_Email05_<Theme>_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_SubjectLineMatrix_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_CTAMatrix_v<N>_<YYYYMMDD>.md
        └── <ClientSlug>_QAChecklist_v<N>_<YYYYMMDD>.md
```

---

## FILE NAMING CONVENTION

**Pattern:** `<ClientSlug>_<OutputType>_<Qualifier>_v<N>_<YYYYMMDD>.md`

| Token | Format | Example |
|---|---|---|
| `ClientSlug` | PascalCase, no spaces | `Growthub`, `AcmeAgency` |
| `OutputType` | PascalCase | `CampaignBrief`, `Email01`, `SequencePlan`, `SubjectLineMatrix`, `CTAMatrix`, `QAChecklist` |
| `Qualifier` | PascalCase — Pillar, Theme, or Type | `AutomationAI`, `WelcomeHook`, `NurtureV1`, `Promo` |
| `v<N>` | Integer version | `v1`, `v2`, `v3` |
| `YYYYMMDD` | ISO date, no separators | `20260410` |

**Examples:**
- `Growthub_CampaignBrief_AutomationAI_v1_20260410.md`
- `Growthub_Email01_RealBottleneck_v1_20260410.md`
- `Growthub_SubjectLineMatrix_v1_20260410.md`
- `AcmeAgency_SequencePlan_ColdOutbound_v2_20260415.md`

---

## REQUIRED OUTPUT TYPES PER CAMPAIGN

| Campaign type | Required outputs |
|---|---|
| Nurture (5 email) | Campaign brief, sequence plan, 5 email drafts, subject line matrix |
| Cold outbound (4 email) | Campaign brief, sequence plan, 4 email drafts, subject line matrix |
| Follow-up (3 email) | Campaign brief, sequence plan, 3 email drafts, subject line matrix |
| Re-engagement (3 email) | Campaign brief, sequence plan, 3 email drafts, subject line matrix |
| Promotional broadcast | Campaign brief, 1 email draft, subject line matrix |

**Optional but recommended:**
- CTA matrix (for campaigns with multiple CTA variants)
- QA checklist (required before platform push, optional for export-only)

---

## REQUIRED SECTIONS PER OUTPUT TYPE

### Campaign Brief
1. Campaign overview table
2. Audience table
3. Campaign angle table
4. Sequence map table
5. CTA spec table
6. Voice & tone notes
7. Compliance notes
8. Platform notes
9. Sign-off

### Sequence Plan
1. Sequence identity
2. Sequence map table (one row per email)
3. Arc notes
4. Module selection guide (which modules used per email)

### Email Draft
1. Metadata block (email #, theme, send day, pillar, segment, campaign, client, version, date)
2. Subject line (primary) + preview text
3. Opening hook
4. Body blocks (2–4)
5. Primary CTA (on its own line)
6. PS line
7. Plain-text fallback block
8. Platform slot map (if platform handoff in scope)

### Subject Line Matrix
1. Matrix metadata block
2. 5+ variants per email, with type tag (curiosity / urgency / proof / personal / direct)
3. Preview text for each variant
4. Recommended A/B test pairing with rationale

### CTA Matrix
1. Primary CTAs (minimum 2 variants)
2. Soft CTAs (minimum 2 variants)
3. Reply CTAs (minimum 2 variants)
4. PS line CTAs (minimum 2 variants)

### QA Checklist
1. Copy review (subject, preview, body, CTA)
2. Compliance review
3. Platform review
4. Sign-off

---

## MARKDOWN FORMATTING RULES

- **H1** (`#`) — document/campaign title only (one per file)
- **H2** (`##`) — major sections (Campaign Overview, Audience, etc.)
- **H3** (`###`) — sub-sections (individual emails, CTA types)
- **Bold** (`**text**`) — used for CTA text, key terms, section labels inside tables
- **Tables** — used for structured data (sequence maps, CTAs, matrices, metadata)
- **Code blocks** (` ``` `) — used for metadata blocks, plain-text fallbacks, platform slot maps
- No embedded HTML — plain Markdown only
- No emojis unless explicitly approved in brand kit
- Horizontal rules (`---`) used between major sections and between emails in a sequence file

---

## VERSIONING RULES

- Never overwrite an existing output file — always create a new version (`v2`, `v3`)
- Version numbers are integers — `v1`, `v2`, not `v1.1`
- When creating a revised version, note the change in the file header or in a `REVISION NOTES` section
- Both versions are retained in the output folder — old versions are not deleted

---

## PLATFORM READINESS REQUIREMENTS

Every email draft must include:

1. **Plain-text fallback** — complete, formatted for plain text, no HTML, raw URLs only
2. **Platform slot map** — if platform handoff is in scope (see `runtime-assumptions.md`)
3. **Subject + preview pair** — never subject line without preview text
4. **Compliance footer elements** — unsubscribe link text and physical address reference

---

## DELIVERABLES LOG FORMAT

After every completed campaign, append to the client brand kit deliverables log:

```
- YYYY-MM-DD | <CampaignType> v<N> — <CampaignName> | output/<client-slug>/<campaign-slug>/
```

Example:
```
- 2026-04-10 | Nurture Sequence v1 — Creative Velocity Nurture Q2 2026 | output/growthub/q2-nurture-automation/
```

---

## OUTPUT QUALITY STANDARDS

An output is complete when:

- [ ] All required sections are present and filled (no placeholder text remaining)
- [ ] Subject line matrix has minimum 5 variants per email with preview text
- [ ] Every email draft has a plain-text fallback
- [ ] Brand kit guardrails reviewed — no violations
- [ ] No fabricated proof points — all results from approved brand kit
- [ ] CTA text is verb-first and outcome-specific
- [ ] Platform slot map complete (if platform handoff in scope)
- [ ] QA checklist run and signed off
- [ ] Deliverables log updated in brand kit
