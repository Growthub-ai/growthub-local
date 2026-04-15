# Kit Standard — growthub-marketing-skills-v1

## Schema Version

This kit follows `schemaVersion: 2` of the Growthub Worker Kit contract.

## Kit Family

`operator` — Domain-specific operator for marketing workflows.

## Execution Mode

`export` — Kit is exported to a local directory and pointed at by the agent's Working Directory.

## Upstream Source

This kit wraps frameworks from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) (MIT license). The upstream library provides the skill definitions and evaluation frameworks. This kit packages them into a Growthub operator environment with brand context, templates, and output standards.

## Activation

```bash
growthub kit download marketing-skills
```

Then point your AI agent's Working Directory at the exported folder.
