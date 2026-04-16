# Starter Kit — Skills

This file catalogues the skills the Custom Workspace Operator offers out of the box. Add your own under `skills/custom/` — those paths are unconditionally preserved across every heal.

## Built-in skills (upstream-owned, heal will update)

- **scaffold-view** — generate a new Vite view under `studio/src/views/<Name>.jsx`
- **scaffold-api** — stub an API adapter under `studio/src/api/<slug>.js`
- **emit-brand-scaffold** — clone `brands/_template/brand-kit.md` to `brands/<slug>/brand-kit.md`
- **trace-inspect** — summarise the last N events in `.growthub-fork/trace.jsonl`

## User-authored skills (never touched by heal)

Create any markdown file under `skills/custom/` or `custom-skills/`. The agent will discover them at runtime but the Self-Healing Fork Sync Agent will never modify them.
