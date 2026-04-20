# Fork Integration — marketingskills

## Upstream Repository

- **Source**: [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)
- **License**: MIT
- **Stars**: 21k+
- **Skills**: 40+ marketing skill definitions

## Relationship to This Kit

This worker kit wraps the marketingskills library's frameworks and evaluation methodologies into a Growthub operator kit. The upstream library is a **reference**, not a runtime dependency.

### What we took from the upstream:
- Marketing domain taxonomy (CRO, SEO, Content, Email, Growth, etc.)
- Evaluation frameworks (7-dimension CRO, E-E-A-T SEO, sequence architecture)
- Cross-skill chaining patterns (which skills reference which)
- Product-marketing-context as the foundational grounding document

### What we added:
- **Product-marketing context as brand kit** — the upstream's context file becomes our brand kit template with 12 structured sections
- **Frozen deliverable templates** — structured output templates for each domain
- **Operator workflow** — 7-step strict-order workflow with mandatory gates
- **Output standards** — file naming, versioning, quality checklist
- **Growthub examples** — reference deliverables using Growthub's own product context
- **Kit packaging** — schemaVersion 2 manifest, bundle, activation modes

### What we intentionally left out:
- **Individual skill files** — skills are one dimension of the environment, not the centerpiece. The operator's skills.md consolidates all 40+ skills into a dispatch table and framework summaries. Users who want the full individual skill files can install them from the upstream repo alongside this kit.
- **Tool integrations** — the upstream includes tool-specific integrations (GA4, Stripe, Mailchimp MCP). These are optional and not frozen into this kit. Users add them via their agent's tool configuration.
- **Installation scripts** — the upstream's `npx skills add` flow is for standalone skill installation. This kit uses the Growthub kit export flow instead.

## Updating from Upstream

When the upstream library releases new skills or framework updates:

1. Review the upstream changelog
2. Update `skills.md` dispatch table if new skills are added
3. Update framework summaries if evaluation criteria change
4. Add new templates if new domains are introduced
5. Bump the kit version in `kit.json`

The upstream library evolves independently. This kit freezes a specific set of frameworks at a point in time. Not every upstream change needs to be pulled in.
