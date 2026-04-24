# Deployment Plan — Template

A deployment plan is the final artifact of a workspace run. It must be:

1. Human-reviewable (Markdown prose).
2. Machine-executable (the JSON plan block below must be shape-compatible with the bundle descriptor).

## Human summary

Describe the plan in 3–5 sentences.

## Machine plan

```json
{
  "kit": "growthub-agency-portal-starter-v1",
  "forkId": "<filled at runtime>",
  "actions": [
    { "type": "deploy", "target": "<env>" }
  ]
}
```
