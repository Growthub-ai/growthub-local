# Adding a New Client

This guide explains how to create a brand kit for a new client in the Postiz Social Media Studio.

---

## Steps

### 1. Copy the Template

```bash
cp brands/_template/brand-kit.md brands/<client-slug>/brand-kit.md
```

Replace `<client-slug>` with a lowercase, hyphenated version of the client name. Examples:
- "Urban Cycle" → `urban-cycle`
- "Acme SaaS Corp" → `acme-saas`
- "The Bloom Studio" → `bloom-studio`

### 2. Fill in the Brand Kit

Open the new file and fill in every section:
- **Client Identity** — name, slug, industry, website
- **Social Media Presence** — existing accounts, follower counts, current activity level
- **Target Audience** — primary and secondary audience profiles
- **Campaign Objectives** — metrics, targets, and timelines
- **Brand Voice** — tone, personality, approved/blocked words, emoji usage
- **Content Theme Pillars** — 3–5 recurring themes with platform assignments
- **Competitor Reference Accounts** — 2–3 accounts to reference for format benchmarking
- **Agency Context** — engagement stage, retainer, reporting cadence

### 3. Verify the Brand Kit

Before using the brand kit in a session, confirm:
- [ ] `client-slug` in the filename matches the `Client Slug` field in the kit
- [ ] At least one platform is listed in `Social Media Presence`
- [ ] At least one campaign objective has a measurable target
- [ ] Brand voice section is complete — no empty `[fill in]` placeholders
- [ ] At least 3 content theme pillars are defined

### 4. Tell the Operator

Start your Claude Code session and say:
> "Load the brand kit for [client-name] and begin a [campaign objective] campaign."

The operator will read the brand kit and ask the 4-question gate before producing any output.

---

## Brand Kit Naming Rules

| Rule | Correct | Incorrect |
|---|---|---|
| Directory name is lowercase kebab-case | `brands/urban-cycle/` | `brands/UrbanCycle/` |
| Filename is always `brand-kit.md` | `brands/urban-cycle/brand-kit.md` | `brands/urban-cycle/UrbanCycle.md` |
| Slug contains no spaces | `acme-saas` | `acme saas` |
| Slug contains no special chars | `bloom-studio` | `bloom/studio` |

---

## Note on Public Brand Kits

Brand kits are **not included in kit exports by default**. The only brand kits included in exports are:
- `brands/_template/brand-kit.md` — the blank template
- `brands/growthub/brand-kit.md` — the public reference example

Client brand kits you create live in your local kit installation only. They are not bundled into the export zip or submitted to any external service.
