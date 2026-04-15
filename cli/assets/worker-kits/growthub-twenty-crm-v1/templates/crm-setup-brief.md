# CRM Setup Brief — [CLIENT NAME]

**Date:** YYYY-MM-DD  
**Operator:** `twenty-crm-operator`  
**Kit:** `growthub-twenty-crm-v1`  
**Mode:** `[cloud / self-hosted / local-fork / agent-only]`

---

## 1. CLIENT CONTEXT AND CRM OBJECTIVE

**Client:** [CLIENT NAME]  
**Industry:** [industry]  
**Company size:** [N employees]  
**CRM objective:** [primary objective — e.g. "Build a structured outbound sales pipeline with automated lead enrichment from Apollo"]

**Why Twenty:**
- [reason 1]
- [reason 2]

---

## 2. DEPLOYMENT MODE

**Selected mode:** `[cloud / self-hosted / local-fork]`  
**API URL:** [URL or TBD]  
**Environment:** [production / staging / development]

**Prerequisites confirmed:**
- [ ] Twenty workspace created
- [ ] API token generated
- [ ] `node setup/verify-env.mjs` passes

---

## 3. TEAM SIZE AND USER ROLES

| Role | User | Permissions |
|---|---|---|
| CRM Admin | [name] | Full access |
| Sales Rep | [name] | Create/edit Opportunities and Persons |
| CS Manager | [name] | Read/edit Opportunities post-close |

**Total workspace members:** [N]

---

## 4. DATA SOURCES AND VOLUME ESTIMATES

| Source | Object type | Estimated volume | Import method |
|---|---|---|---|
| [Apollo CSV export] | Person + Company | [N contacts] | CSV import |
| [Stripe webhooks] | [custom object or Note] | [events/month] | Webhook |
| [Intercom] | Note | [conversations/month] | Webhook |

---

## 5. INTEGRATION SCOPE

| Integration | Direction | Priority |
|---|---|---|
| [Apollo] | Inbound enrichment | High |
| [Stripe] | Inbound webhook | High |
| [Intercom] | Inbound webhook | Medium |
| [Slack] | Outbound notification | Low |

---

## 6. GO-LIVE TIMELINE AND MILESTONES

| Milestone | Target date | Owner |
|---|---|---|
| Data model finalized | YYYY-MM-DD | [CRM admin] |
| Initial import complete | YYYY-MM-DD | [CRM admin] |
| Enrichment pipeline live | YYYY-MM-DD | [developer] |
| Automations active | YYYY-MM-DD | [developer] |
| Team onboarded | YYYY-MM-DD | [CRM admin] |

---

## 7. SUCCESS CRITERIA

- [ ] All [N] contacts imported and deduplicated against domain
- [ ] Pipeline visible with [N] stages
- [ ] At least [N] automations active (stage transitions, follow-up tasks)
- [ ] Enrichment pipeline running on [cadence] cadence
- [ ] All team members onboarded and using the CRM daily

---

## OPEN QUESTIONS

- [ ] [Open question 1]
- [ ] [Open question 2]
