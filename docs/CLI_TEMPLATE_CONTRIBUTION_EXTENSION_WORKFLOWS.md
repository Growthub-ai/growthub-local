# CLI Template Contribution Extension Workflows

This document is the agent-facing runbook for extending the CLI on top of the existing shared templates pattern.

Use it when you are adding a new reusable template artifact, expanding the template catalog, or deciding whether a change belongs in shared templates, a worker kit, or command code.

## The Rule

Do not add bespoke command branches when the existing template surface already fits.

If the contribution is a reusable artifact primitive, build on the shared templates pattern:

- store the frozen content under `cli/assets/shared-templates/`
- register it in `cli/src/templates/catalog.ts`
- expose it through the existing `growthub template` commands

The command surface is already shipped:

- `growthub template`
- `growthub template list`
- `growthub template get`

The work should extend the catalog, not fork the UX.

## Mental Model

There are three adjacent but different contribution surfaces:

### Shared templates

Use this for reusable cross-kit primitives:

- ad formats
- scene modules
- reusable artifact skeletons
- pattern libraries that should be addressable by slug

Shared templates are generic, frozen, and reusable across workflows.

### Worker kits

Use this for complete opinionated agent environments:

- prompts and operator contracts
- standards and output rules
- examples and calibration material
- runtime assumptions
- any kit-specific copy of templates that is part of that environment package

Worker kits are execution environments, not just template collections.

### Command code

Touch command code only when the current command surface cannot express the workflow.

That is the last resort. The default path is:

1. extend the template catalog
2. reuse the existing `growthub template` UX
3. compose templates into a worker kit when a full environment is required

## Source Of Truth Files

The current shared templates implementation is split across four layers:

### 1. Frozen assets

- `cli/assets/shared-templates/manifest.json`
- `cli/assets/shared-templates/ad-formats/`
- `cli/assets/shared-templates/scene-modules/`

This is the shipped content boundary.

### 2. Typed catalog

- `cli/src/templates/catalog.ts`
- `cli/src/templates/contract.ts`

This is the slug registry and metadata model.

The current catalog comment is the guiding constraint:

- add a template by adding an entry in `cli/src/templates/catalog.ts`
- add a new family only when the contract and UX actually need it

### 3. Runtime service

- `cli/src/templates/service.ts`
- `cli/src/templates/index.ts`

This layer resolves files, filters artifacts, groups them, and returns content.

### 4. CLI command surface

- `cli/src/commands/template.ts`
- `cli/src/index.ts`

This layer provides the interactive picker and direct command entry points.

## Contribution Decision Tree

Before editing anything, classify the change:

### Case 1: New reusable artifact in an existing family

Examples:

- a new video ad format
- a new hook, body, or CTA module

Action:

1. Add the markdown file under the correct folder in `cli/assets/shared-templates/`.
2. Update `cli/assets/shared-templates/manifest.json` if the asset manifest needs to reflect the new file.
3. Add a matching typed entry in `cli/src/templates/catalog.ts`.
4. Preserve the existing command surface.

This is the default and preferred workflow.

### Case 2: New template family

Examples:

- a new `email` or `motion` family that should be addressable through `growthub template`

Action:

1. Add the asset files under `cli/assets/shared-templates/`.
2. Extend `TemplateFamily` in `cli/src/templates/contract.ts`.
3. Add catalog entries in `cli/src/templates/catalog.ts`.
4. Update family display metadata in `cli/src/commands/template.ts` if needed for the interactive picker.
5. Keep the same list/get/picker model unless there is a hard product reason not to.

Do not invent a separate command family if `growthub template` already fits.

### Case 3: Kit-specific methodology or frozen vertical assets

Examples:

- a template that only makes sense inside a single worker kit
- a vertical-specific output standard
- a brand-aware template variant tied to one kit contract

Action:

Put it inside the relevant kit under `cli/assets/worker-kits/<kit-id>/`.

Do not force kit-specific content into the shared template library just because it is a markdown template.

### Case 4: Net-new command behavior

Examples:

- a workflow that cannot be represented as browse/list/get/copy

Action:

Only then consider changing command code. Even in that case, first check whether the correct answer is a new worker kit flow rather than a new template command.

## Standard Extension Workflow

When building on top of the templates pattern, use this sequence:

1. Read the nearest existing artifact of the same type.
2. Add the new frozen markdown asset in `cli/assets/shared-templates/...`.
3. Register the new artifact in `cli/src/templates/catalog.ts`.
4. Keep the slug stable, descriptive, and reusable.
5. Make sure the artifact can be discovered through existing filters.
6. Verify the docs still describe the current user flow.
7. Run the relevant checks before pushing.

## Authoring Rules

Follow these constraints when adding template artifacts:

- prefer additive changes over structural churn
- preserve the existing slug-first discovery model
- keep templates reusable across kits when they are in the shared library
- keep kit-specific methodology inside the kit, not in shared templates
- avoid mixing runtime instructions with generic artifact primitives
- do not bypass the typed catalog with implicit filesystem-only discovery

## What Not To Do

- do not add one-off commands for a single template type
- do not duplicate the same primitive across multiple command paths
- do not encode kit-specific business logic into the shared template catalog
- do not add speculative families that have no shipped assets
- do not break the existing `growthub template` list/get/picker flow when a catalog addition is sufficient

## Relationship To Worker Kits

Shared templates and worker kits are designed to work together:

- shared templates hold reusable primitives
- worker kits freeze a complete operating environment

The right layering is:

1. create or extend shared primitives when they are broadly reusable
2. compose them into a kit when you need a full guided environment
3. validate the kit through `growthub kit validate <path>`

## Documentation Expectations

When you extend the template pattern in a way users or contributors need to understand, update the public docs as part of the same change:

- repo `README.md` for GitHub-facing workflow changes
- `cli/README.md` for npm-facing CLI workflow changes
- any relevant worker-kit or contributor docs if the change affects those contracts

## Definition Of Done

A template-pattern contribution is done when:

- the frozen asset exists in the shared templates library
- the artifact is registered in the typed catalog
- the existing CLI template flow can discover and return it
- docs describe the correct user flow
- no bespoke command logic was introduced without a real need

That is the extension standard for building on top of the current templates pattern.
