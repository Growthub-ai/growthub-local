# Template Extension Kernel Packet

Version: `v1`

This packet freezes the reusable primitive for adding a new template family or artifact type without breaking the discriminated union or existing catalog consumers.

Use it when you are:

- adding a new `TemplateFamily` beyond `video-creative`, `email`, `motion`, `general`
- adding a new `TemplateArtifact` discriminated union member beyond `AdFormatArtifact` and `SceneModuleArtifact`
- adding a new `SceneModuleSubtype` beyond `hook`, `body`, `cta`
- extending `ArtifactFilter` with new filter dimensions
- adding new artifact metadata fields (source pipeline, execution history, compatibility tags)
- wiring templates into the pipeline compile or workflow canonical surfacing lanes

## Why This Packet Exists

The template library is a discriminated union of frozen creative artifacts. It is deliberately decoupled from kits (zero coupling) and deliberately separate from the hosted workflow save path. The catalog is the canonical source and the union is the canonical shape.

This separation means new template families plug in without touching kit infrastructure, workflow lifecycle, or pipeline execution. But the discriminated union is the contract — a bad extension breaks narrow patterns across consumers.

This packet captures the stable path for extending templates without breaking the union.

## Kernel Invariants

Every template extension must satisfy these invariants before merge:

- new union members use `type` literal discriminant so existing narrowing paths stay safe
- all artifacts include `slug`, `id`, `name`, `family`, `category`, `tags`, `compatibleFormats`, `frozen`, `path`
- `resolveSlug()` resolves new slugs via exact -> slug -> suffix -> contains -> token strategy
- `listArtifacts(filter)` respects new filter dimensions without breaking existing filters
- `groupArtifacts()` produces stable groups for new families/types
- `getArtifact(id)` returns `ResolvedArtifact` with valid `content` and `absolutePath`
- `copyArtifact(id, destDir)` copies to destination correctly
- `getCatalogStats()` counts new families/types in `byFamily` and `byType`
- frozen asset files exist on disk at declared `path`
- `growthub template list` and `growthub template get` discovery paths handle new shapes
- focused vitest coverage passes
- repo gates pass (`smoke`, `validate`, `verify`)

## Surface Area Contract

Use this contract shape for every template extension:

1. **Contract primitive**
   - extend `TemplateArtifact` union in `cli/src/templates/contract.ts`
   - use `type` literal discriminant for new union members
   - extend `TemplateFamily` union for new families
   - extend `SceneModuleSubtype` or similar subtype unions as needed
   - new required fields must have stable defaults or be optional
2. **Catalog primitive**
   - register new artifacts in `cli/src/templates/catalog.ts` (`TEMPLATE_CATALOG`)
   - frozen asset files live under `cli/assets/shared-templates/<family>/<type>/<slug>.md`
3. **Service primitive**
   - `resolveSlug()`, `listArtifacts()`, `getArtifact()`, `copyArtifact()`, `groupArtifacts()`, `getCatalogStats()` in `cli/src/templates/service.ts` handle new shapes
4. **Filter primitive**
   - extend `ArtifactFilter` for new filter dimensions
   - `listArtifacts(filter)` applies new filters correctly
5. **Discovery UX**
   - `cli/src/commands/template.ts` two-step picker surfaces new family/type in `TEMPLATE_FAMILY_META`
   - grouped summary and interactive picker render new artifacts correctly
6. **Export primitive**
   - `cli/src/templates/index.ts` re-exports new types
   - consumers can import only from `index.ts`

## Packet Inputs

- template slug (for example `audio-hook-v1`, `carousel-format-v1`, `<new-slug>`)
- contract updates under `cli/src/templates/contract.ts`
- catalog registration in `cli/src/templates/catalog.ts`
- frozen asset under `cli/assets/shared-templates/<family>/<type>/<slug>.md`
- discovery UX updates in `cli/src/commands/template.ts`
- focused tests under `cli/src/__tests__/template.test.ts` or `cli/src/__tests__/template-*.test.ts`

## Packet Procedure

### P1. Contract + Asset Freeze

- extend `TemplateArtifact` union with new interface using `type` discriminant
- extend `TemplateFamily` or subtype unions if adding new values
- create frozen asset file under `cli/assets/shared-templates/<family>/<type>/<slug>.md`
- ensure asset file contains stable content (no placeholder text that will churn)

### P2. Catalog Registration

- add entry to `TEMPLATE_CATALOG` in `cli/src/templates/catalog.ts`
- populate all required fields: `type`, `slug`, `id`, `name`, `family`, `category`, `tags`, `compatibleFormats`, `frozen`, `path`
- `path` must resolve from `cli/assets/shared-templates/` root

### P3. Service Handling

- verify `resolveSlug()` resolves new slug through fuzzy strategy
- verify `groupArtifacts()` produces correct groups for new family/type
- verify `getCatalogStats()` counts new entries correctly

### P4. Discovery UX Registration

- add new family to `TEMPLATE_FAMILY_META` in `cli/src/commands/template.ts` with `label`, `emoji`, `hint`
- verify interactive picker renders new artifacts correctly
- verify `growthub template list --type <new-type>` works
- verify `growthub template list --family <new-family>` works
- verify `growthub template get <slug>` resolves and copies

### P5. Filter Extension (if adding new filter dimension)

- extend `ArtifactFilter` in `cli/src/templates/contract.ts`
- update `listArtifacts(filter)` in service to apply new filter
- add CLI flag in `registerTemplateCommands()` `list` subcommand

### P6. Deterministic Validation

Run:

```bash
cd cli && pnpm vitest src/__tests__/template.test.ts
bash scripts/pr-ready.sh
```

### P7. Release + Ship Confirmation

- merge PR after checks are green
- run release workflow
- confirm npm remote versions match merged package versions
- verify `growthub template` interactive browser renders new family/type in the discovery hub

## Canonical Commands

```bash
zsh /Users/antonio/growthub-local/scripts/demo-cli.sh cli discover
growthub template list
growthub template list --type <new-type>
growthub template get <new-slug>
cd cli && pnpm vitest src/__tests__/template.test.ts
bash scripts/pr-ready.sh
```

## Definition Of Done

A template extension is done only when:

- new union member/family/subtype uses discriminant literal
- catalog entry registered with all required fields
- frozen asset file exists on disk at declared path
- fuzzy slug resolution works for new slug
- discovery UX renders new shape in interactive picker and grouped summary
- focused vitest coverage passes
- PR checks are green
- merge lands in `main`

## Reuse Beyond Templates

This packet is reusable for any discriminated-union extension work in the CLI:

- **contract primitive:** discriminant literal + required fields
- **catalog primitive:** single source of truth registration
- **service primitive:** resolve/list/get/group functions handle new shapes
- **discovery UX primitive:** interactive picker and list flows render new shapes
- **validation primitive:** deterministic scripts + focused vitest suite

Apply the same structure when extending kit bundles, artifact types, or other discriminated contracts.

## Related Packets

- [CMS Contract Extension Kernel Packet](./KERNEL_PACKET_CMS_CONTRACT_EXTENSION.md)
- [Discovery UX Kernel Packet](./KERNEL_PACKET_DISCOVERY_UX.md)
- [Custom Workspace Kernel Packet](./KERNEL_PACKET_CUSTOM_WORKSPACES.md)
