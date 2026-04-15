# Workspace Config Checklist — [CLIENT NAME]

**Date:** YYYY-MM-DD  
**Kit:** `growthub-twenty-crm-v1`  
**Mode:** `[cloud / self-hosted / local-fork / agent-only]`

---

## PRE-LAUNCH CONFIGURATION CHECKLIST

Complete these tasks before the team starts using the CRM in production.

---

## 1. WORKSPACE SETTINGS

- [ ] Workspace display name set (Settings > General)
- [ ] Workspace logo uploaded
- [ ] Default currency set
- [ ] Timezone confirmed
- [ ] Domain / subdomain configured (for self-hosted)

---

## 2. TEAM MEMBERS AND ROLES

| Member | Email | Role | Status |
|---|---|---|---|
| [CRM Admin] | [email] | Admin | [invited / active] |
| [Sales Rep 1] | [email] | Member | [invited / active] |
| [Sales Rep 2] | [email] | Member | [invited / active] |
| [CS Manager] | [email] | Member | [invited / active] |

- [ ] All invites sent (Settings > Members)
- [ ] All members have accepted and set passwords
- [ ] Roles confirmed for each member
- [ ] No test accounts remaining in member list

---

## 3. STANDARD OBJECTS CONFIGURED

| Object | Enabled | Custom fields added | Default view set |
|---|---|---|---|
| `Person` | [Yes] | [list custom fields] | [Yes / No] |
| `Company` | [Yes] | [list custom fields] | [Yes / No] |
| `Opportunity` | [Yes] | Stage options confirmed | [Yes / No] |
| `Note` | [Yes] | n/a | n/a |
| `Task` | [Yes] | n/a | n/a |

---

## 4. CUSTOM OBJECTS CONFIGURED

| Object | Created | Fields added | Relationships set | Default view set |
|---|---|---|---|---|
| [CustomObject1] | [Yes / No] | [Yes / No] | [Yes / No] | [Yes / No] |

---

## 5. VIEWS AND FILTERS

| View | Object | Filter | Sort | Assigned to |
|---|---|---|---|---|
| My Open Leads | Opportunity | stage IN [LEAD, QUALIFIED], assignee = me | createdAt desc | All sales reps |
| Pipeline Board | Opportunity | stage NOT IN [CLOSED_WON, CLOSED_LOST] | closeDate asc | All team |
| New Contacts (30d) | Person | createdAt > 30 days ago | createdAt desc | CRM Admin |
| [View name] | [Object] | [filter] | [sort] | [who] |

- [ ] All views created and tested
- [ ] Views shared with the correct team members

---

## 6. INTEGRATIONS ENABLED

| Integration | Status | Configured by | Notes |
|---|---|---|---|
| [Apollo enrichment] | [enabled / pending] | [developer] | See Lead Enrichment Pipeline doc |
| [Stripe webhook] | [enabled / pending] | [developer] | See Webhook Integration Spec |
| [Intercom webhook] | [enabled / pending] | [developer] | See Webhook Integration Spec |
| Email sync | [enabled / pending] | [CRM Admin] | Settings > Integrations > Email |

---

## 7. WORKFLOW AUTOMATIONS ACTIVE

| Automation name | Trigger | Status | Tested? |
|---|---|---|---|
| [Automation 1] | [trigger] | [active / draft] | [Yes / No] |
| [Automation 2] | [trigger] | [active / draft] | [Yes / No] |

- [ ] All automations tested with a sample record
- [ ] No automations in draft state that should be live

---

## 8. API TOKENS GENERATED AND DISTRIBUTED

| Token name | Scope | Assigned to | Stored in |
|---|---|---|---|
| `growthub-production` | Workspace | CRM Admin | `.env` file on enrichment server |
| `enrichment-pipeline` | Workspace | [developer] | CI secrets / env |
| [token name] | [scope] | [assigned] | [stored where] |

- [ ] No tokens are hard-coded in application source code
- [ ] Tokens are stored in environment variables or a secrets manager
- [ ] Old/test tokens are revoked

---

## 9. EMAIL AND NOTIFICATION SETTINGS

- [ ] Email sync confirmed for CRM admin (or disabled if not in scope)
- [ ] In-app notification preferences set per role
- [ ] External notification webhooks (Slack, etc.) tested if in scope

---

## 10. FINAL SIGN-OFF

| Item | Confirmed by | Date |
|---|---|---|
| Data model correct | [CRM Admin] | YYYY-MM-DD |
| All members onboarded | [CRM Admin] | YYYY-MM-DD |
| Enrichment pipeline live | [Developer] | YYYY-MM-DD |
| Automations active and tested | [Developer] | YYYY-MM-DD |
| CRM Playbook distributed to team | [CRM Admin] | YYYY-MM-DD |
| Go-live approval | [Stakeholder] | YYYY-MM-DD |
