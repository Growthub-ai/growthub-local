# Worker Kits

Growthub Agent Worker Kits are bundled CLI-exportable working-directory packages.

## V1 Scope

V1 ships a narrow local file export surface in `@growthub/cli`:

- `growthub kit list`
- `growthub kit inspect <kit-id>`
- `growthub kit download <kit-id> [--out <path>]`
- `growthub kit path <kit-id> [--out <path>]`

The first and only bundled kit in V1 is `creative-strategist-v1`.

## What V1 Does

- ships bundled catalog metadata inside the CLI package
- validates the frozen bundled kit source before export
- writes one deterministic zip and one expanded export folder
- uses a deterministic CLI-owned default export root under Paperclip home when `--out` is omitted
- produces a folder that can be pointed at directly with existing Working Directory path support

## What V1 Does Not Do

- no heartbeat integration
- no server routes
- no agent runtime injection
- no app-side install surface
- no plugin lifecycle reuse
- no database registry or persistence for kits

## Public Payload Boundary

The public bundled Creative Strategist kit excludes confidential brand kits.

The V1 public export includes:

- `kit.json`
- `bundles/creative-strategist-v1.json`
- `skills.md`
- `workers/creative-strategist/CLAUDE.md`
- `templates/`
- `brands/_template/brand-kit.md`
- `brands/solawave/brand-kit.md`
- `growthub-meta/`

Exported zips and expanded folders are generated on the local machine at runtime. They are not committed runtime artifacts and they are not part of the bundled server runtime payload.
