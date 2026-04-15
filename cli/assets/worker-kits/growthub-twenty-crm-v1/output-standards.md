# Output Standards — Twenty CRM v1

This document defines the output contract for every artifact produced by this kit.

---

## OUTPUT FOLDER STRUCTURE

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

## REQUIRED OUTPUT TYPES

Every full CRM implementation package must include:
- CRM setup brief
- data model design
- lead enrichment pipeline
- pipeline automation brief
- webhook integration spec
- API query plan
- workspace config checklist
- integration handoff
- CRM playbook

Custom object design and import mapping are included when the scope requires them.

---

## REQUIRED SECTIONS

### CRM setup brief
1. Client context and CRM objective
2. Deployment mode (cloud / self-hosted / local-fork)
3. Team size and user roles
4. Data sources and volume estimates
5. Integration scope
6. Go-live timeline and milestones
7. Success criteria

### Data model design
1. Standard objects in use and configuration notes
2. Custom objects (if any) with full field definitions
3. Relationship map (which objects link to which)
4. Field type table per object
5. Display configuration (labels, icons, default views)
6. Open questions / decisions required

### Lead enrichment pipeline
1. Enrichment provider(s) and auth mechanism
2. Source fields provided
3. Target Twenty fields
4. Deduplication strategy and match key
5. Insert vs. merge behavior
6. Update frequency
7. Error and failure handling

### Pipeline automation brief
1. Pipeline name and purpose
2. Trigger type and object
3. Trigger conditions (field, value, timing)
4. Action sequence
5. Failure / timeout behavior
6. Monitoring and alerting plan

### Webhook integration spec
1. Inbound vs. outbound classification
2. Event name and trigger object
3. Payload schema
4. Target endpoint or source
5. Auth mechanism
6. Retry policy
7. Test procedure

### API query plan
1. Query type (GraphQL / REST)
2. Object(s) targeted
3. Filter conditions
4. Field selection
5. Expected response structure
6. Use case and consumer

### Custom object design
1. Object name and purpose
2. Field table (name, type, required, options)
3. Relationship definitions
4. Creation method (UI vs. metadata API)
5. Default view configuration
6. Validation rules

### Import mapping
1. Source CRM / export format
2. Column-by-column mapping table
3. Transformation rules
4. Deduplication key
5. Import mode (insert / merge)
6. Post-import validation steps

### Workspace config checklist
1. Settings to configure (auth, members, roles, branding)
2. Integrations to enable
3. Objects to activate or create
4. Views and filters to configure
5. Email and notification settings
6. API token generation and distribution

### Integration handoff
1. System integration diagram
2. Auth credentials required (types only — no values)
3. Endpoint contracts
4. Sequence diagram for data flow
5. Environment checklist (dev / staging / prod)
6. Rollback plan

### Enrichment field map
1. Provider name
2. Provider field → Twenty field table with types and transformations
3. Deduplication key
4. Update frequency
5. Notes and edge cases

### CRM playbook
1. Team roles and permissions
2. Daily workflow (record creation, updates, activities)
3. Pipeline management procedures
4. Enrichment cadence
5. Reporting and dashboard instructions
6. Escalation and handoff protocols
7. Maintenance and data hygiene checklist

---

## FILE NAMING RULES

Pattern:

```text
<ClientSlug>_<OutputType>_v<N>_<YYYYMMDD>.md
```

Rules:
- `ClientSlug` is PascalCase
- never overwrite an existing version
- keep one artifact per file
- Markdown only

---

## QUALITY BAR

An output is complete when:
- no placeholder text remains
- all object and field names match Twenty's naming conventions
- deduplication keys are named in every enrichment or import artifact
- every automation trigger-action pair has a documented failure path
- webhook specs include full payload schemas
- GraphQL queries are syntactically correct
- the CRM playbook is written at a level a non-technical team member can execute
- integration handoff provides enough detail for a developer to implement without asking follow-up questions
