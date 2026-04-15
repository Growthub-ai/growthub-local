# CRM Playbook — Growthub (SAMPLE)

**Date:** 2026-04-15  
**Kit:** `growthub-twenty-crm-v1`  
**Version:** v1

> **Note:** This is a sample output. Adapt all procedures to the actual client context.

---

## ABOUT THIS PLAYBOOK

This playbook is the operating manual for the Growthub Twenty CRM workspace. It defines roles, daily workflows, pipeline procedures, and data hygiene rules. All four team members with CRM access must read this before their first session.

---

## 1. TEAM ROLES AND PERMISSIONS

| Role | Name | Access level | Responsibilities |
|---|---|---|---|
| CRM Admin | Antonio Romero | Full access | Object config, member management, integration maintenance, data hygiene |
| Sales Rep | [Rep 1] | Create/edit own records | Lead creation, pipeline updates, notes |
| Sales Rep | [Rep 2] | Create/edit own records | Lead creation, pipeline updates, notes |
| CS Manager | [CS] | Read/edit post-close | Customer success tracking, renewal notes |

**Onboarding new members:** CRM Admin creates the workspace member in Settings > Members, assigns the correct role, and shares this playbook.

---

## 2. DAILY WORKFLOW

### Sales rep daily workflow (10–15 min)

1. Log in to Twenty and open **Pipeline Board** view (pre-filtered: open opportunities, my records)
2. Review new leads assigned to you in the LEAD stage — move any that are ICP-qualified to QUALIFIED
3. For every call or email from today: add a Note on the Person record (what you discussed, next step, date)
4. Check Tasks due today — complete each or reschedule with a Note explaining the delay
5. End of day: every new contact from today's outreach must be in Twenty before logging off

**Expected daily time investment:** 10–15 minutes

### CRM Admin daily workflow (5–10 min)

1. Check import error log if enrichment pipeline ran overnight
2. Spot-check 3 records for data quality (no blank required fields, company linked, stage current)
3. Check workflow logs (Settings > Workflows) for any automation failures

---

## 3. PIPELINE MANAGEMENT PROCEDURES

### Creating a new Opportunity

1. Navigate to Opportunities → click `+ New`
2. Fill in: **Name** (e.g. "Acme Corp — Growthub Platform"), **Stage** (start at LEAD), **Amount**, **Close Date**
3. Link **Point of Contact** (Person) and **Company**
4. Set **Assignee** to yourself or the responsible rep
5. Add a first Note: where did this lead come from, what is the hook?

### Moving a stage

1. Open the Opportunity → click the stage badge at the top
2. Select the new stage
3. Add a Note immediately explaining what happened and what the next step is
4. If moving to **CLOSED_WON**: confirm Amount and Close Date are accurate before saving
5. If moving to **CLOSED_LOST**: add a Note with the reason (e.g. "No budget Q2", "Chose competitor", "Ghosted after demo")

**Pipeline stages and exit criteria:**

| Stage | Exit criteria |
|---|---|
| LEAD | ICP fit confirmed + email opened or replied |
| QUALIFIED | Discovery call complete, pain confirmed, budget range known |
| DEMO | Product demo complete, specific use case validated |
| PROPOSAL | Commercial terms sent or under negotiation |
| CLOSED_WON | Contract signed, payment confirmed |
| CLOSED_LOST | Explicitly lost or no response after 3 follow-ups past close date |

### Weekly pipeline review (team — 30 min)

**View:** Pipeline Board filtered to QUALIFIED + DEMO + PROPOSAL  
**Sort:** Close Date ascending

For each open opportunity in the top 10 by close date:
- Is the stage accurate?
- When was the last Note added? (if >7 days, flag as stale)
- What is the next action and who owns it?
- Is there a Task assigned for the next action?

---

## 4. ENRICHMENT CADENCE

**Schedule:** Weekly on Monday at 6 AM (automated cron job)

**What runs automatically:**
- Apollo enrichment job pulls the latest saved search export and runs a merge import into Twenty
- New Person records are created; existing records are updated with latest enrichment data

**What to do if the enrichment job fails:**
1. CRM Admin checks the error log file `enrichment-errors.csv` (stored in the enrichment job output)
2. Review skipped records — most common reason is missing email
3. Manually add missing contacts from Apollo if volume is small (< 20 records)
4. Contact [developer] if the job fails to run at all (check cron logs)

---

## 5. REPORTING AND DASHBOARD INSTRUCTIONS

### Pipeline health view (built in Twenty)

**Filter:** Opportunities where stage IN [QUALIFIED, DEMO, PROPOSAL]  
**Group by:** Stage  
**Sort:** Close Date ascending

**Reading the view:**
- Count in each stage = pipeline coverage (healthy = more in LEAD/QUALIFIED than PROPOSAL)
- Total amount in DEMO + PROPOSAL = near-term revenue signal
- Opportunities with last Note > 14 days old = stale — review in weekly pipeline call

### Weekly metrics to track (manual, 5 min)

Count from Twenty each Friday:
- New Opportunities created this week
- Opportunities moved to CLOSED_WON this week
- Opportunities moved to CLOSED_LOST this week + note the loss reasons
- Opportunities moved to DEMO this week (pipeline velocity indicator)

---

## 6. ESCALATION AND HANDOFF PROTOCOLS

### Record dispute (wrong data)

1. Do **not** delete the record
2. Add a Note: "Data quality issue — [describe problem]" and tag `@antonio`
3. CRM Admin reviews and resolves within 2 business days

### Integration failure

1. Check Settings > Workflows for automation errors
2. Check enrichment error log file
3. If unresolved: email [developer contact] with the error message and timestamp
4. CRM Admin documents the gap in a Note on the affected object if data is missing

### Offboarding a team member

1. CRM Admin reassigns all open Opportunities from the departing member to the remaining rep
2. Reassigns all open Tasks
3. Deactivates the workspace member (Settings > Members > Deactivate)
4. Revokes any API tokens the member had access to

---

## 7. MAINTENANCE AND DATA HYGIENE CHECKLIST

**Weekly (CRM Admin — 15 min):**
- [ ] Review import error log — resolve skipped records
- [ ] Check stale Opportunities (no update in 14 days) — flag for reps to update
- [ ] Confirm all Closed Won / Closed Lost opportunities have a loss/win reason Note

**Monthly (CRM Admin — 30 min):**
- [ ] Search for duplicate Person records (same email) — merge duplicates
- [ ] Search for Companies with no linked Persons — flag for review or archive
- [ ] Review workflow logs for repeated failures — escalate to developer if pattern
- [ ] Update this playbook if any procedures have changed

**Quarterly (CRM Admin + head of sales — 60 min):**
- [ ] Review pipeline stage definitions — do they still match how we sell?
- [ ] Evaluate enrichment provider data quality — are enriched fields accurate?
- [ ] Review custom field usage — archive any fields the team stopped using
- [ ] Check if new automation opportunities exist based on team pain points
