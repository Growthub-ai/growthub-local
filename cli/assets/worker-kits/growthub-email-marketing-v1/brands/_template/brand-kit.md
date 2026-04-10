# Brand Kit — [CLIENT NAME]

> Copy this file to `brands/<client-slug>/brand-kit.md` and fill in all fields before writing any copy.
> Fields marked [REQUIRED] must be filled before the agent can proceed. Fields marked [OPTIONAL] can be added later.

---

## IDENTITY

```yaml
client_name:         "[CLIENT NAME]"                   # [REQUIRED]
slug:                "[client-slug]"                    # [REQUIRED] lowercase-hyphen, no spaces
industry:            "[industry description]"           # [REQUIRED]
primary_service:     "[core service or product]"        # [REQUIRED]
campaign_owner:      "[name or team]"                  # [OPTIONAL]
date_onboarded:      "YYYY-MM-DD"                      # [REQUIRED]
account_owner:       "[agent or operator name]"        # [OPTIONAL]
```

---

## AUDIENCE

```yaml
primary_persona:
  name:              "[persona name or description]"    # [REQUIRED]
  age_range:         "[e.g. 35–55]"                    # [OPTIONAL]
  role:              "[e.g. agency owner, CGO, founder]" # [REQUIRED]
  company_type:      "[e.g. local business, agency, B2B SaaS]" # [REQUIRED]
  pain_point:        "[primary pain — specific, not generic]"   # [REQUIRED]
  desired_outcome:   "[what they actually want — see brand doc]" # [REQUIRED]
  current_stage:     "[what they've tried / where they are now]" # [OPTIONAL]
  awareness_level:   "[unaware / problem-aware / solution-aware / product-aware]" # [REQUIRED]

do_not_attract:      # [REQUIRED] — who this is NOT for
  - "[anti-audience type 1]"
  - "[anti-audience type 2]"
```

---

## POSITIONING

```yaml
core_positioning:    "[one-sentence positioning statement]"  # [REQUIRED]
what_they_buy:       "[what the ICP is actually buying — outcome/feeling, not feature]" # [REQUIRED]
what_you_sell:       "[how you frame it to them]"           # [REQUIRED]
category_frame:      "[what category do you put yourself in]" # [OPTIONAL]

unique_mechanism:    "[what makes the outcome possible — the HOW]" # [OPTIONAL]

proof_points:        # [OPTIONAL] — approved numbers and results only, never fabricate
  - "[proof point 1 — e.g. X clients scaled to Y in Z timeframe]"
  - "[proof point 2]"
```

---

## MESSAGING

```yaml
voice_and_tone:      # [REQUIRED]
  - "[tone adjective 1 — e.g. direct]"
  - "[tone adjective 2 — e.g. operator-level]"
  - "[tone adjective 3 — e.g. no-fluff]"

voice_notes:         "[how to write for this brand — e.g. 'speak like a knowledgeable operator, not a marketer']" # [REQUIRED]

approved_phrases:    # [REQUIRED] — verbatim, use in copy
  - "[phrase 1]"
  - "[phrase 2]"
  - "[phrase 3]"

messaging_guardrails: # [REQUIRED] — absolute no-go items
  - "[do not say or claim: X]"
  - "[do not say or claim: Y]"

emotional_arc:       "[default emotional arc — e.g. Overwhelmed → Systematized → Scaling]" # [REQUIRED]
```

---

## CONTENT PILLARS

```yaml
content_pillars:     # [REQUIRED] — define which pillars are active for this client
  pillar_1:
    name:            "[pillar name]"
    angle:           "[default campaign angle for this pillar]"
    tone:            "[tone variation for this pillar]"
  pillar_2:
    name:            "[pillar name]"
    angle:           "[default campaign angle]"
    tone:            "[tone variation]"
  pillar_3:          # add as needed
    name:            "[pillar name]"
    angle:           "[default campaign angle]"
    tone:            "[tone variation]"
```

---

## CTA & OFFERS

```yaml
primary_cta_text:    "[exact CTA text — e.g. 'Book your growth call']"  # [REQUIRED]
primary_cta_url:     "[URL or placeholder]"                              # [REQUIRED]
secondary_cta_text:  "[soft CTA text — e.g. 'Reply and tell me more']" # [OPTIONAL]
offer_notes:         "[any active offers, pricing, trial details]"       # [OPTIONAL]
```

---

## EMAIL PLATFORM

```yaml
platform:            "[platform name — e.g. GHL, ActiveCampaign, Klaviyo, HubSpot]" # [REQUIRED if platform handoff in scope]
platform_api_key_env: "[env var name — e.g. GHL_API_KEY]"               # [REQUIRED for API mode]
platform_location_id_env: "[env var name — e.g. GHL_LOCATION_ID]"       # [OPTIONAL — platform-specific]
platform_api_base:   "[base URL — e.g. https://rest.gohighlevel.com/v1]" # [REQUIRED for API mode]
email_from_name:     "[sender name as it appears in inbox]"              # [REQUIRED]
email_from_address:  "[sender email — configured in platform]"           # [REQUIRED]

list_segments:       # [REQUIRED] — segment names or tags used in this platform account
  - "[segment name or tag 1]"
  - "[segment name or tag 2]"

sending_cadence:
  nurture:           "[e.g. every 3–5 days]"                            # [OPTIONAL]
  cold:              "[e.g. every 2–3 days]"                            # [OPTIONAL]
  follow_up:         "[e.g. every 1–2 days]"                            # [OPTIONAL]
  re_engagement:     "[e.g. every 5–7 days]"                            # [OPTIONAL]

send_time_preference: "[e.g. Tue–Thu, 9–11am recipient local time]"     # [OPTIONAL]
```

---

## COMPLIANCE

```yaml
compliance_notes:    # [REQUIRED]
  - "[required disclaimer or legal restriction 1]"
  - "[required disclaimer or legal restriction 2]"
  - "CAN-SPAM: physical address and unsubscribe link required on all broadcasts"
  - "[GDPR notes if applicable]"

unsubscribe_footer:  "[unsubscribe link text and footer format]"         # [REQUIRED]
physical_address:    "[legal physical mailing address for CAN-SPAM]"    # [REQUIRED]
```

---

## ASSET LINKS

```yaml
website:             "[URL]"                # [OPTIONAL]
landing_page:        "[URL]"                # [OPTIONAL]
google_drive:        "[URL]"                # [OPTIONAL]
brand_assets:        "[URL]"                # [OPTIONAL]
previous_campaigns:  "[URL or path]"        # [OPTIONAL]
```

---

## DELIVERABLES LOG

> Append one line per completed output. Never delete entries.

```
# Format: YYYY-MM-DD | <CampaignType> v<N> — <CampaignName> | output/<slug>/<folder>/
```
