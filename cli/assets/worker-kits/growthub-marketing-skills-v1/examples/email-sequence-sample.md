# Email Sequence Plan — Growthub / Welcome Sequence

**Date:** 2026-04-15
**Version:** v1
**Domain:** Email
**Operator:** marketing-operator

---

## Executive Summary

- 5-email welcome sequence over 10 days focused on activation (first kit download)
- Anchored on the "Growth System" content pillar
- Emotional arc: Curious → Informed → Equipped → Activated → Connected
- Primary CTA: Download first worker kit via CLI

---

## Sequence Overview

| Field | Value |
|---|---|
| Sequence type | Welcome |
| Email count | 5 |
| Duration | 10 days |
| Entry trigger | CLI install (`npx @growthub/create-growthub-local`) |
| Primary CTA | Download first worker kit |
| Audience segment | New CLI installers |

---

## Emotional Arc

```
Email 1: Curious → Email 2: Informed → Email 3: Equipped → Email 4: Activated → Email 5: Connected
```

---

## Sequence Map

| Email | Send Day | Subject Theme | Body Arc | CTA | Purpose |
|---|---|---|---|---|---|
| 1 | Day 0 | Welcome + what you just installed | Orient — show what's inside the discovery hub | Explore discovery hub | Reduce confusion, build confidence |
| 2 | Day 2 | Your first worker kit | Educate — explain what kits are and why they matter | Download creative-strategist-v1 | First kit activation |
| 3 | Day 4 | How to set up product context | Equip — walk through brand kit setup | Create product-marketing-context.md | Enable personalized output |
| 4 | Day 7 | See what others built | Prove — show real examples and community use cases | Try a second kit | Deepen engagement |
| 5 | Day 10 | You're part of something | Connect — community, contributing, what's next | Join GitHub / contribute | Build retention loop |

---

## Subject Line Matrix

### Email 1 — Welcome

| Variant | Type | Subject Line | Preview Text |
|---|---|---|---|
| A | Direct | You just installed Growthub — here's what to do first | Your discovery hub is ready to explore |
| B | Curiosity | There are 4 kits waiting for you | Each one is a complete marketing environment |
| C | Personal | Welcome to local-first marketing | Your data stays on your machine — here's how it works |
| D | Social proof | Join 500+ builders using Growthub kits | Open source, MIT licensed, ready to ship |
| E | Urgency | Don't skip this — your first 5 minutes matter | Quick setup guide inside |

**Recommended A/B test**: Variant A vs Variant B

---

## Platform Notes

| Field | Value |
|---|---|
| Email platform | TBD |
| Segment/tag | new-cli-install |
| Automation trigger | CLI install event |
| Unsubscribe handling | Standard CAN-SPAM footer |
