# Output Directory

All operator deliverables are saved here, organized by client and project.

## Structure

```
output/
  <client-slug>/
    <project-slug>/
      <ClientSlug>_<Domain>_<Type>_v<N>_<YYYYMMDD>.md
```

## Examples

```
output/
  acme/
    homepage-redesign/
      Acme_CRO_AuditBrief_v1_20260415.md
    q2-content/
      Acme_Content_StrategyPlan_v1_20260415.md
  growthub/
    welcome-flow/
      Growthub_Email_SequencePlan_v1_20260415.md
```

## Rules

- Never overwrite existing files — increment version (`v1` → `v2`)
- Always update the deliverables log in the client's product-marketing-context.md
- Use the exact naming convention — no variations
