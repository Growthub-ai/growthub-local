# Output Standards

**All Postiz Social + AEO Studio outputs must meet these standards before delivery.**

---

## Output Directory Structure

```
output/
  <client-slug>/
    <project-slug>/
      CalendarWeekPlan_v<N>_<YYYYMMDD>.md
      ChannelMixMatrix_v<N>_<YYYYMMDD>.md
      ContentSprintBrief_v<N>_<YYYYMMDD>.md
      LaunchPostPack_v<N>_<YYYYMMDD>.md
      AnalyticsReadout_v<N>_<YYYYMMDD>.md
```

---

## File Naming Convention

```
<ClientSlug>_<OutputType>_v<N>_<YYYYMMDD>.md
```

| Part | Rules | Example |
|---|---|---|
| ClientSlug | TitleCase, no spaces | `Northwind` |
| OutputType | CamelCase from the list below | `LaunchPostPack` |
| Version | `v` + integer | `v1` |
| Date | `YYYYMMDD` | `20260415` |

**Output type names:**

| Artifact | OutputType string |
|---|---|
| Calendar Week Plan | `CalendarWeekPlan` |
| Channel Mix Matrix | `ChannelMixMatrix` |
| Content Sprint Brief | `ContentSprintBrief` |
| Launch Post Pack | `LaunchPostPack` |
| Analytics Readout | `AnalyticsReadout` |

---

## Required Sections Per Artifact

Each artifact must include all sections from its template. Incomplete sections must be marked `<!-- data-gap: reason -->` — never left blank without explanation.

| Artifact | Minimum required sections |
|---|---|
| CalendarWeekPlan | North star, Week grid, UTM and links, Dependencies, Execution notes |
| ChannelMixMatrix | Strategy summary, Audience × channel fit, AEO/SEO tie-in, Measurement |
| ContentSprintBrief | Goal, Scope, Inputs, Deliverables, Automation blueprint, Risks |
| LaunchPostPack | Messaging spine, Variant tables per channel, Compliance checklist, Scheduling notes |
| AnalyticsReadout | Executive summary, Funnel snapshot, Channel breakdown, Next sprint recommendations, Data caveats |

---

## Quality bar

- Every CTA must map to a measurable event (signup, demo, content download).
- Channel copy must respect platform character limits declared in the table or note gaps explicitly.
- No secrets in Markdown (tokens, cookies, private keys).

---

## Relationship to Postiz

Kit outputs are **plans and packs**. Applying them inside Postiz requires a configured fork or hosted workspace — document that boundary in the Execution notes section.
