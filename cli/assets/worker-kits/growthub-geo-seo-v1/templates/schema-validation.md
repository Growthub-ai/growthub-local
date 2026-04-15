# Schema Validation Report

> Template: `templates/schema-validation.md`
> Save output to: `output/<client-slug>/<project-slug>/SchemaValidation_v<N>_<YYYYMMDD>.md`

---

## URL Analyzed

| Field | Value |
|---|---|
| Target URL | <!-- https://... --> |
| Client | <!-- client_name --> |
| Page Type | <!-- homepage / article / product / local business / other --> |
| Analysis Date | <!-- YYYY-MM-DD --> |
| Execution Mode | <!-- local-fork / agent-only --> |
| Schema Format Found | <!-- JSON-LD / Microdata / RDFa / none --> |

---

## Schema Types Found

| Schema Type | Format | Count | Location | Complete? |
|---|---|---|---|---|
| <!-- e.g., Organization --> | <!-- JSON-LD --> | <!-- N --> | <!-- <head> / inline --> | <!-- yes / partial / no --> |
| <!-- e.g., WebSite --> | <!-- JSON-LD --> | <!-- N --> | <!-- <head> / inline --> | <!-- yes / partial / no --> |
| <!-- e.g., Article --> | <!-- JSON-LD --> | <!-- N --> | <!-- <head> / inline --> | <!-- yes / partial / no --> |
| <!-- e.g., BreadcrumbList --> | <!-- JSON-LD --> | <!-- N --> | <!-- <head> / inline --> | <!-- yes / partial / no --> |
| <!-- e.g., FAQPage --> | <!-- JSON-LD --> | <!-- N --> | <!-- <head> / inline --> | <!-- yes / partial / no --> |
| <!-- e.g., HowTo --> | <!-- JSON-LD --> | <!-- N --> | <!-- <head> / inline --> | <!-- yes / partial / no --> |
| <!-- e.g., Product --> | <!-- JSON-LD --> | <!-- N --> | <!-- <head> / inline --> | <!-- yes / partial / no --> |
| <!-- e.g., LocalBusiness --> | <!-- JSON-LD --> | <!-- N --> | <!-- <head> / inline --> | <!-- yes / partial / no --> |

**Total schema types found:** <!-- N -->

---

## Raw Schema Markup

```json
// Paste JSON-LD block(s) found on the page, or mark as "No JSON-LD found"
```

---

## Validation Errors

| Schema Type | Property | Error Type | Severity | Notes |
|---|---|---|---|---|
| <!-- e.g., Organization --> | <!-- e.g., `url` --> | <!-- Missing required / Incorrect type / Invalid value --> | <!-- Critical / Warning / Info --> | <!-- description of the error --> |
| <!-- schema type --> | <!-- property --> | <!-- error type --> | <!-- severity --> | <!-- notes --> |
| <!-- schema type --> | <!-- property --> | <!-- error type --> | <!-- severity --> | <!-- notes --> |

**Total errors found:** <!-- N critical / N warnings / N info -->

---

## Missing Recommended Schema Types

| Schema Type | Why It Matters | Page Type It Applies To | Priority |
|---|---|---|---|
| Organization | Required for brand entity graph — enables Knowledge Panel signals | Homepage | P0 |
| WebSite | Enables Sitelinks search box in Google; signals site structure to AI | Homepage | P0 |
| FAQPage | Directly feeds Google AI Overviews and Perplexity answer blocks | FAQ / Service pages | P1 |
| Article | Required for Google News inclusion and AI content citation | Blog posts | P1 |
| BreadcrumbList | Improves AI understanding of site hierarchy | All pages | P1 |
| HowTo | Direct AI-citable structured content for how-to queries | Tutorial pages | P2 |
| Product | Required for e-commerce AI visibility | Product pages | P2 |
| LocalBusiness | Required for local AI search and map packs | Location pages | P2 |
| SpeakableSpecification | Signals to Google which content is suitable for voice / AI reading | Articles | P3 |

> Note: Only list types that apply to this site's actual page types. Remove rows that don't apply.

---

## Schema Coverage Score

| Metric | Value | Notes |
|---|---|---|
| Schema types present | <!-- N --> | |
| Schema types with no errors | <!-- N --> | |
| Schema types with errors | <!-- N --> | |
| Coverage completeness | <!-- N% --> | <!-- types complete / total types found --> |
| Schema score | <!-- 0–100 --> | |

---

## Implementation Priority Table

| Priority | Schema Type | Action | Effort | Expected Impact |
|---|---|---|---|---|
| P0 | <!-- type --> | <!-- Add / Fix / Remove --> | <!-- Low / Medium / High --> | <!-- Critical / High --> |
| P0 | <!-- type --> | <!-- Add / Fix / Remove --> | <!-- Low / Medium / High --> | <!-- Critical / High --> |
| P1 | <!-- type --> | <!-- Add / Fix / Remove --> | <!-- Low / Medium / High --> | <!-- High --> |
| P1 | <!-- type --> | <!-- Add / Fix / Remove --> | <!-- Low / Medium / High --> | <!-- High --> |
| P2 | <!-- type --> | <!-- Add / Fix / Remove --> | <!-- Low / Medium / High --> | <!-- Medium --> |
| P3 | <!-- type --> | <!-- Add / Fix / Remove --> | <!-- Low / Medium / High --> | <!-- Low --> |

---

## Code Snippets: Recommended Additions

### Organization (add to homepage `<head>`)

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "<!-- Company Name -->",
  "url": "<!-- https://domain.com -->",
  "logo": "<!-- https://domain.com/logo.png -->",
  "sameAs": [
    "<!-- https://twitter.com/handle -->",
    "<!-- https://linkedin.com/company/slug -->",
    "<!-- https://github.com/org -->"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer support",
    "email": "<!-- support@domain.com -->"
  }
}
```

### FAQPage (add to FAQ or service pages)

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "<!-- Question 1? -->",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "<!-- Answer 1. Be specific and self-contained. -->"
      }
    },
    {
      "@type": "Question",
      "name": "<!-- Question 2? -->",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "<!-- Answer 2. Be specific and self-contained. -->"
      }
    }
  ]
}
```

### Article (add to blog post pages)

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "<!-- Article title -->",
  "author": {
    "@type": "Person",
    "name": "<!-- Author Name -->",
    "url": "<!-- https://domain.com/author/slug -->"
  },
  "datePublished": "<!-- YYYY-MM-DD -->",
  "dateModified": "<!-- YYYY-MM-DD -->",
  "publisher": {
    "@type": "Organization",
    "name": "<!-- Company Name -->",
    "logo": {
      "@type": "ImageObject",
      "url": "<!-- https://domain.com/logo.png -->"
    }
  },
  "image": "<!-- https://domain.com/article-image.jpg -->",
  "description": "<!-- 155-character description -->"
}
```
