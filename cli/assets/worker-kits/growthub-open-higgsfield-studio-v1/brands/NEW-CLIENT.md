# Creating a New Client Brand Kit

Each client you run campaigns for should have their own brand kit. The agent uses this as its primary brand reference during Step 1 of every session.

---

## Setup

```bash
cp brands/_template/brand-kit.md brands/<client-slug>/brand-kit.md
```

Replace `<client-slug>` with a lowercase hyphenated identifier (e.g. `acme-corp`, `solo-founder`, `ecom-brand-x`).

---

## Required fields to fill in

Open your new `brands/<client-slug>/brand-kit.md` and complete:

| Field | What to write |
|---|---|
| Brand name | Full brand name as it appears in content |
| Visual identity | Colors, typography, logo usage notes |
| Tone and voice | Adjectives that describe how the brand communicates |
| Target audience | Who the content is for |
| Content restrictions | What to avoid in visuals or copy |
| Reference assets | Paths to existing brand images, videos, or logo files |

Fill in every section. Incomplete brand kits result in generic outputs.

---

## Telling the agent to use your brand kit

At the start of your session, say:

> "Use `brands/<client-slug>/brand-kit.md` as the active brand kit."

The agent will load it in Step 1 instead of the Growthub default.

---

## Multiple clients

Keep one subdirectory per client under `brands/`. Each session uses exactly one active brand kit.
