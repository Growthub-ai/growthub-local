# CRM Setup Brief — Growthub (SAMPLE)

**Date:** 2026-04-15  
**Operator:** `twenty-crm-operator`  
**Kit:** `growthub-twenty-crm-v1`  
**Mode:** `cloud`

> **Note:** This is a sample output illustrating the quality and format expected from this kit. Adapt all values to the actual client context.

---

## 1. CLIENT CONTEXT AND CRM OBJECTIVE

**Client:** Growthub  
**Industry:** B2B SaaS / Growth Platform  
**Company size:** 12 employees  
**CRM objective:** Build a structured outbound sales pipeline with automated lead enrichment from Apollo, Stripe event capture, and Intercom conversation logging.

**Why Twenty:**
- Open-source, MIT license — no vendor lock-in risk for a growing platform company
- TypeScript/React/NestJS stack matches Growthub's existing codebase — easier to self-host and extend
- REST and GraphQL APIs make it straightforward to build custom enrichment pipelines
- Custom object support handles the non-standard Growthub product-led-growth workflow

---

## 2. DEPLOYMENT MODE

**Selected mode:** `cloud`  
**API URL:** `https://api.twenty.com`  
**Environment:** production

**Prerequisites confirmed:**
- [x] Twenty workspace created at app.twenty.com
- [x] API token generated: `growthub-production` token (stored in `.env`)
- [x] `node setup/verify-env.mjs` exits 0 — connected to workspace "Growthub" (id: abc123)

---

## 3. TEAM SIZE AND USER ROLES

| Role | User | Permissions |
|---|---|---|
| CRM Admin | Antonio Romero | Full access |
| Sales Rep | [Sales Rep 1] | Create/edit Opportunities and Persons |
| Sales Rep | [Sales Rep 2] | Create/edit Opportunities and Persons |
| CS Manager | [CS Manager] | Read/edit Opportunities post-close |

**Total workspace members:** 4

---

## 4. DATA SOURCES AND VOLUME ESTIMATES

| Source | Object type | Estimated volume | Import method |
|---|---|---|---|
| Apollo CSV export | Person + Company | ~1,200 contacts, ~400 companies | CSV import |
| Stripe | Company + Note | ~50 new customers/month | Webhook (customer.created) |
| Intercom | Note | ~150 conversations/month | Webhook (conversation.created) |

---

## 5. INTEGRATION SCOPE

| Integration | Direction | Priority |
|---|---|---|
| Apollo | Inbound enrichment | High |
| Stripe | Inbound webhook | High |
| Intercom | Inbound webhook | Medium |
| Slack | Outbound notification (Closed Won) | Low |

---

## 6. GO-LIVE TIMELINE AND MILESTONES

| Milestone | Target date | Owner |
|---|---|---|
| Data model finalized | 2026-04-18 | Antonio (CRM Admin) |
| Initial Apollo import complete | 2026-04-20 | Antonio |
| Stripe webhook live | 2026-04-22 | Developer |
| Intercom webhook live | 2026-04-25 | Developer |
| Stage automations active | 2026-04-25 | Developer |
| Team onboarded | 2026-04-28 | Antonio |

---

## 7. SUCCESS CRITERIA

- [x] All 1,200 contacts imported and deduplicated against email
- [x] Pipeline visible with 6 stages (Lead → Closed Won/Lost)
- [x] 3 automations active (stage change → task creation, Closed Won → Slack notify, Intercom → Note)
- [x] Stripe enrichment running on customer.created event
- [x] All 4 team members onboarded and logging daily activity in the CRM

---

## OPEN QUESTIONS

- [ ] Does the head of sales want round-robin assignment or territory-based routing?
- [ ] Should Intercom conversations be logged as Notes on Person or as a custom Activity object?
