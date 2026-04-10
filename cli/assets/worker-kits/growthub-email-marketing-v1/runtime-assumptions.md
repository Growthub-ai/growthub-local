# Runtime Assumptions — Email Marketing Strategist v1

This document defines all runtime assumptions for this kit. Read before any platform integration work.

---

## OVERVIEW

This kit supports **platform-agnostic email delivery**. Email platform integration is handled through a pluggable adapter pattern. The first reference implementation is GoHighLevel (GHL). Future platforms are added by implementing the same adapter interface without modifying existing kit files.

**Three integration modes:**

| Mode | When to use | Requires |
|---|---|---|
| A — API | Platform has REST API and credentials are configured | Platform API key in env var |
| B — Browser-assisted | Platform lacks needed API endpoint, or visual QA required | Chrome browser tools available |
| C — Export only | No platform integration needed — human uploads copy | Nothing — default mode |

**Default mode is C (Export only).** The agent should confirm the mode in Step 3 of CLAUDE.md before any platform work.

---

## PLATFORM ADAPTER INTERFACE

Any email platform integration must implement these operations. GHL implements all of them. Future adapters implement the same interface.

### Required operations

```
LIST_TEMPLATES
  Input:  platform credentials (from env var)
  Output: list of available email templates [{id, name, slots}]
  Purpose: lets the agent match output copy to a platform template

GET_TEMPLATE
  Input:  template_id
  Output: template structure with slot definitions [{slot_name, slot_type, description}]
  Purpose: maps platform template slots to email draft sections

CREATE_CAMPAIGN
  Input:  campaign metadata + sequence plan
  Output: campaign_id
  Purpose: creates the campaign/sequence container in the platform

ADD_EMAIL_TO_CAMPAIGN
  Input:  campaign_id, email_draft (with slot map), send_delay
  Output: email_id
  Purpose: adds one email draft to the campaign sequence

TRIGGER_TEST_SEND
  Input:  email_id, test_recipient_email
  Output: confirmation
  Purpose: sends a test version of the email for visual QA

SET_SEGMENT_TRIGGER
  Input:  campaign_id, segment_tag or trigger_condition
  Output: confirmation
  Purpose: sets which audience segment triggers the sequence
```

### Optional operations (platform-specific)

```
LIST_CONTACTS_BY_TAG
  Purpose: look up contacts in a segment before sending

GET_CAMPAIGN_STATS
  Purpose: retrieve open/click/reply stats for a completed campaign

UPDATE_EMAIL
  Purpose: modify an existing email draft in a campaign
```

---

## GHL ADAPTER — REFERENCE IMPLEMENTATION

GoHighLevel (GHL) is the reference platform. All adapter operations map to GHL REST API endpoints.

### Authentication

```
API Key:     env var GHL_API_KEY
Location ID: env var GHL_LOCATION_ID
Base URL:    https://rest.gohighlevel.com/v1
```

**Never hardcode credentials in any kit file, output file, or example.**  
**Always read from environment variables.**

### Endpoint mapping

| Adapter operation | GHL endpoint |
|---|---|
| `LIST_TEMPLATES` | `GET /email-templates/?locationId={GHL_LOCATION_ID}` |
| `GET_TEMPLATE` | `GET /email-templates/{id}` |
| `CREATE_CAMPAIGN` | `POST /campaigns/` |
| `ADD_EMAIL_TO_CAMPAIGN` | `POST /campaigns/{id}/emails` |
| `TRIGGER_TEST_SEND` | `POST /emails/send` |
| `SET_SEGMENT_TRIGGER` | `PUT /campaigns/{id}/trigger` |
| `LIST_CONTACTS_BY_TAG` | `GET /contacts/?tags={tag}` |

### GHL template slot convention

GHL email templates expose these standard slots:

| Slot name | Maps to email draft section |
|---|---|
| `subject_line` | Subject line (primary) |
| `preview_text` | Preview text |
| `from_name` | `brand_kit.email_from_name` |
| `from_email` | `brand_kit.email_from_address` |
| `body_html` | Email body (HTML rendered from Markdown) |
| `cta_text` | Primary CTA text |
| `cta_url` | Primary CTA URL |
| `footer_text` | Unsubscribe + physical address |

### GHL API call pattern (agent reference)

```bash
# List available templates
curl -H "Authorization: Bearer $GHL_API_KEY" \
     "https://rest.gohighlevel.com/v1/email-templates/?locationId=$GHL_LOCATION_ID"

# Get a specific template structure
curl -H "Authorization: Bearer $GHL_API_KEY" \
     "https://rest.gohighlevel.com/v1/email-templates/{template_id}"

# Trigger a test send
curl -X POST \
     -H "Authorization: Bearer $GHL_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"templateId":"{id}","to":"{test_email}"}' \
     "https://rest.gohighlevel.com/v1/emails/send"
```

---

## BROWSER-ASSISTED WORKFLOWS (MODE B)

When API operations are not sufficient or visual QA is needed, the agent uses browser tools.

**Available browser tools:**
- `mcp__Claude_in_Chrome__navigate` — navigate to GHL URL
- `mcp__Claude_Preview__preview_screenshot` — screenshot for review log
- `mcp__Claude_in_Chrome__get_page_text` — read campaign builder state
- `mcp__Claude_in_Chrome__form_input` — fill template slot fields
- `mcp__Claude_in_Chrome__find` — locate elements in GHL UI

### Documented browser workflows

**Workflow B1 — Navigate to GHL campaign builder and copy-paste email copy**

```
1. Navigate to GHL: https://app.gohighlevel.com/campaigns
2. Open or create the target campaign
3. Open the email at position N in the sequence
4. Transfer copy from <ClientSlug>_Email0N_<Theme>_v1_<YYYYMMDD>.md into template slots
5. Screenshot the completed email for the review log
6. Repeat for each email in the sequence
7. Log completion in deliverables log
```

**Workflow B2 — Visual QA of a completed campaign**

```
1. Navigate to the campaign in GHL
2. Open each email preview
3. Screenshot subject line, preview text, and rendered email body
4. Verify: correct subject/preview, links active, CTA text matches spec, footer present
5. Flag any discrepancies in the QA checklist
```

**Workflow B3 — Pull existing GHL email template HTML**

```
1. Navigate to GHL email templates
2. Open the target template
3. Use get_page_text to extract the HTML structure
4. Map template slots to the platform slot map in the email draft
5. Document slot names in the campaign brief platform notes
```

### What browser CANNOT do

- Cannot click "Send" on a live broadcast without explicit human confirmation
- Cannot modify GHL account-level settings (sender domain, DKIM, etc.)
- Cannot create new GHL sub-accounts
- Cannot handle GHL 2FA or login flows without manual intervention
- All browser actions are logged — no silent changes

### Browser confirmation requirement

**Before any browser-assisted change to a live campaign or send:**
```
The agent must state:
"I am about to [action] in GHL. This will [consequence]. Confirm to proceed."

The user must confirm before the action is taken.
```

---

## ADDING A NEW PLATFORM ADAPTER

To add support for a new email platform (ActiveCampaign, Klaviyo, HubSpot, etc.):

1. Add a new section to this file: `## <PLATFORM_NAME> ADAPTER`
2. Map all required adapter operations to the platform's API endpoints
3. Document authentication env var names
4. Document the template slot convention for that platform
5. Do NOT modify any other kit file

**New adapter template:**

```markdown
## <PLATFORM_NAME> ADAPTER

### Authentication
API Key:    env var <PLATFORM_NAME>_API_KEY
[other auth fields as needed]
Base URL:   [platform API base URL]

### Endpoint mapping
| Adapter operation | <Platform> endpoint |
|---|---|
| LIST_TEMPLATES | [endpoint] |
| GET_TEMPLATE | [endpoint] |
...

### Template slot convention
| Slot name | Maps to email draft section |
|---|---|
...
```

---

## ENVIRONMENT VARIABLE NAMING CONVENTION

| Variable | Purpose |
|---|---|
| `GHL_API_KEY` | GHL REST API authentication token |
| `GHL_LOCATION_ID` | GHL location/account ID |
| `<PLATFORM>_API_KEY` | Future platform API keys follow this pattern |
| `EMAIL_PLATFORM` | Active platform name (e.g., `GHL`, `KLAVIYO`) — used by agent to select adapter |

**Never store credentials in:**
- Kit files (any `.md`, `.json`, `.js`)
- Output files
- Brand kit files
- Example files
- Git-tracked files of any kind

---

## RUNTIME CHECKLIST

Before beginning any platform integration work:

- [ ] `EMAIL_PLATFORM` env var is set and matches an implemented adapter
- [ ] Platform API key env var is set and valid (test with `LIST_TEMPLATES`)
- [ ] Platform location/account ID is set (if required by platform)
- [ ] `email_from_name` and `email_from_address` are confirmed in brand kit
- [ ] Test send recipient email is confirmed
- [ ] User has confirmed platform handoff mode (API / Browser / Export)
- [ ] All email drafts are complete and QA-checked before platform upload
- [ ] No browser actions taken without explicit user confirmation
