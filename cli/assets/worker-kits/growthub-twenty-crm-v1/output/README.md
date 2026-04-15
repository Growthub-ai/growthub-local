# Output Directory — Twenty CRM v1

This directory is where the agent writes all client deliverables.

---

## Structure

```text
output/
└── <client-slug>/
    └── <project-slug>/
        ├── <ClientSlug>_CRMSetupBrief_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_DataModelDesign_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_LeadEnrichmentPipeline_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_PipelineAutomationBrief_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_WebhookIntegrationSpec_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_APIQueryPlan_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_CustomObjectDesign_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_ImportMapping_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_WorkspaceConfigChecklist_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_IntegrationHandoff_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_EnrichmentFieldMap_v<N>_<YYYYMMDD>.md
        └── <ClientSlug>_CRMPlaybook_v<N>_<YYYYMMDD>.md
```

---

## File naming

Pattern: `<ClientSlug>_<OutputType>_v<N>_<YYYYMMDD>.md`

- `ClientSlug` is PascalCase (e.g. `AcmeCorp`, `Growthub`)
- `OutputType` matches the artifact type exactly (e.g. `CRMSetupBrief`, `DataModelDesign`)
- `v<N>` is the version number (start at `v1`, increment on revision)
- `YYYYMMDD` is the date of production

---

## Rules

- never overwrite an existing version file — create a new version
- keep one artifact per file
- Markdown only
- no placeholder text in any delivered file
- brand kit DELIVERABLES LOG must be updated after each delivery
