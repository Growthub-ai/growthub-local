# CRM Playbook — [CLIENT NAME]

**Date:** YYYY-MM-DD  
**Kit:** `growthub-twenty-crm-v1`  
**Version:** v1

---

## ABOUT THIS PLAYBOOK

This playbook is the operating manual for the [CLIENT NAME] Twenty CRM workspace. It defines roles, daily workflows, pipeline procedures, enrichment cadences, and data hygiene rules. Every team member with CRM access should read and follow this document.

---

## 1. TEAM ROLES AND PERMISSIONS

| Role | Name | Access level | Responsibilities |
|---|---|---|---|
| CRM Admin | [name] | Full access | Object configuration, user management, integration maintenance |
| Sales Rep | [name] | Create/edit own records | Lead creation, pipeline updates, note-taking |
| CS Manager | [name] | Read + edit post-close | Customer success tracking, renewal management |

**Onboarding new members:** CRM Admin creates workspace member in Settings > Members and assigns the correct role.

---

## 2. DAILY WORKFLOW

### Sales rep daily workflow

1. Log in to Twenty and open the Opportunity pipeline view
2. Review any new leads assigned to you (filter: `assignee = me`, `stage = LEAD`)
3. Update stage for any leads that progressed since yesterday
4. Add a Note for every contact or company you spoke with
5. Check open Tasks due today and complete or reschedule them
6. Before end of day: all new contacts from today's calls must be in Twenty

### CRM admin daily workflow

1. Check the import error log (if enrichment pipeline is running)
2. Review any automation failures in the workflow logs
3. Confirm new workspace members have correct permissions
4. Spot-check 3–5 records for data quality (no blank required fields)

---

## 3. PIPELINE MANAGEMENT PROCEDURES

### Creating a new Opportunity

1. Navigate to Opportunities
2. Click `+ New`
3. Fill in: name, stage, linked Person (pointOfContact), linked Company, amount, close date
4. Set the assignee to the responsible sales rep
5. Add a first Note with context

### Moving a stage

1. Open the Opportunity record
2. Click the stage selector and choose the new stage
3. Add a Note explaining the stage change (what happened, next step)
4. If moving to `CLOSED_WON`: confirm amount and close date are accurate
5. If moving to `CLOSED_LOST`: add a Note with the loss reason

### Pipeline review (weekly — team)

Run the pipeline report query (see API Query Plan) or filter in Twenty:
- All Opportunities: stage in [QUALIFIED, DEMO, PROPOSAL]
- Sort by close date ascending
- Review top 10 by close date

---

## 4. ENRICHMENT CADENCE

**Enrichment schedule:** [one-time / weekly on [day] / monthly on [day] / event-triggered]

**Enrichment procedure (if CSV-based):**

1. Export contacts from [Apollo / Clay / source] with the filters defined in the Lead Enrichment Pipeline doc
2. Open the CSV and remove any test or duplicate entries
3. Import via Twenty: navigate to [Person / Company] > Import
4. Select the field mapping profile saved as `[mapping-profile-name]`
5. Run the import
6. After import: check the error log and resolve skipped records

**Enrichment procedure (if API/webhook-based):**

The enrichment pipeline runs automatically via [webhook / scheduled API call]. Review the error log weekly and resolve any skipped records.

---

## 5. REPORTING AND DASHBOARD INSTRUCTIONS

### Pipeline health view

**Filter:** Opportunities where stage is in [LEAD, QUALIFIED, DEMO, PROPOSAL]  
**Group by:** Stage  
**Sort by:** Close date ascending

**Reading the view:**
- Count of opportunities in each stage = pipeline coverage
- Total amount in DEMO + PROPOSAL = near-term revenue signal
- Opportunities with no stage update in 14+ days = stale — review and update or close

### Contact view

**Filter:** Persons created in the last 30 days  
**Sort:** Created at descending

Use this view weekly to confirm all new contacts are properly linked to Companies and have no missing required fields.

---

## 6. ESCALATION AND HANDOFF PROTOCOLS

### CRM data dispute

If a record looks incorrect (wrong company, wrong stage, stale data):
1. Do not delete — add a Note documenting the issue
2. Tag `@[CRM Admin]` in the note
3. CRM Admin resolves within 2 business days

### Integration failure

If the enrichment pipeline or a webhook stops working:
1. CRM Admin checks the workflow logs in Twenty > Settings > Workflows
2. If logs are inconclusive, check the error log from the enrichment provider
3. Escalate to [developer contact] with the error message and timestamp

### Offboarding a team member

1. CRM Admin reassigns all open Opportunities from the departing member
2. Reassign all open Tasks
3. Deactivate the workspace member in Settings > Members

---

## 7. MAINTENANCE AND DATA HYGIENE CHECKLIST

**Weekly:**
- [ ] Review import error log — resolve skipped records
- [ ] Check open Opportunities for stale records (no update in 14 days)
- [ ] Confirm all Closed Won / Closed Lost opportunities have a close reason Note

**Monthly:**
- [ ] Audit duplicate Person records (same email) — merge or remove
- [ ] Audit Companies with no linked Persons — flag for review
- [ ] Review workflow automation logs for failures
- [ ] Update the CRM Playbook if any procedures have changed

**Quarterly:**
- [ ] Review custom object field usage — deprecate unused fields
- [ ] Review pipeline stage definitions — adjust if the sales process has changed
- [ ] Evaluate enrichment provider quality and coverage
