# API and Automation

Postiz ships a public API and ecosystem integrations (see upstream README: Public API, Node SDK, n8n, Make.com).

---

## Kit-level guidance

1. Prefer linking to **official Postiz API documentation** for endpoint paths and auth schemes.
2. When proposing automation, describe **intent** (trigger → transform → schedule) and let engineers map to concrete nodes or SDK calls after reading current OpenAPI or SDK sources in the fork.
3. For Growthub handoffs, produce a short **Automation Blueprint** section inside `templates/content-sprint-brief.md` or a dedicated appendix — still no live secrets.

---

## Idempotency and safety

- Recommend idempotent triggers (dedupe by canonical URL or content hash).
- Log expected side effects (posts created, media uploaded) in the analytics readout template.
