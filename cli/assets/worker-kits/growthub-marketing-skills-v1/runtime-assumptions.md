# Marketing Operator — Runtime Assumptions

## Execution Environment

The marketing operator runs inside any AI agent that can read markdown files and follow structured instructions. No specific runtime, language, or platform is required.

**Supported adapters:**
- Claude Code (primary reference)
- Cursor
- OpenAI Codex
- Google Gemini
- Windsurf
- Any agent supporting the Agent Skills specification

## File System Assumptions

The operator assumes the Working Directory is pointed at the kit root. All paths are relative:

```
./skills.md                                    ← methodology (read every session)
./brands/<client-slug>/product-marketing-context.md  ← brand context
./templates/<domain>-<type>.md                 ← frozen deliverable templates
./output/<client-slug>/<project-slug>/         ← all deliverables land here
```

## External Tool Integration (Optional)

The operator can produce deliverables with zero external dependencies. When tools are available, they enhance the analysis:

| Tool | Use | Required? |
|---|---|---|
| Web browser / web_fetch | Read live pages for CRO/SEO analysis | No — operator can analyze provided content |
| Analytics API (GA4) | Pull real traffic data for recommendations | No — operator works with user-provided data |
| Email platform API | Push sequences to email tools | No — operator exports platform-ready markdown |
| SEO tools (Ahrefs, Semrush) | Pull backlink and ranking data | No — operator works with user-provided data |

## Upstream Fork Relationship

This kit wraps frameworks from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills). The upstream library provides the skill definitions and evaluation frameworks. This kit packages them into a Growthub worker kit with:

- Product-marketing context as the brand grounding layer
- Frozen templates for consistent deliverable structure
- Output standards and naming conventions
- Operator workflow with mandatory gates (3-question gate, context loading)

The upstream library is a reference, not a runtime dependency. Skills are adapted and frozen into this kit's methodology. Updates to the upstream library can be pulled into future kit versions.
