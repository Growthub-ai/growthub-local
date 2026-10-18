# GTM plugin architecture and release standard

This standard covers the hosted Growthub GTM companion across OpenAI/Codex and
Claude. It does not replace this repository's governed workspace product or the
existing `growthub-governed-console` release. Start with
[distribution and acceptance](GTM_PLUGIN_DISTRIBUTION.md).

## Stable identity and independent versions

[`plugins/gtm-release.json`](../plugins/gtm-release.json) is the release catalog.
Its internal release ID `ai.growthub.gtm` is a Growthub artifact-family identifier,
not a provider-assigned application, directory or connection ID. Provider listing
IDs, once actually issued, belong in the publication receipt and are never
inferred from a display name.

| Identity/version | Authority | Rule |
| --- | --- | --- |
| Artifact family | `releaseId: ai.growthub.gtm` | Retain across provider projections and releases |
| Provider plugin slug | `growthub-gtm` | Retain on both providers; do not rename to simulate an upgrade |
| Repository marketplace | `growthub` in both marketplace manifests | Identity is the marketplace/plugin tuple; retain existing console entry |
| GTM package SemVer | `plugins/growthub-gtm/plugin.json` | Exact source of truth; native manifests must match |
| MCP server IDs | `growthub-brand-kit`, `growthub-ceo`, `growthub-knowledge` | Existing stable names and `/api/v1/mcp`, `/ceo`, `/knowledge` routes |
| MCP server compatibility | Hosted server `initialize` information and owning source | Currently `1.0.0`; independent of package version and deployment SHA |
| Legacy console/CLI version | `cli/package.json` and existing lockstep validators | Independent of GTM package SemVer; do not publish npm for a GTM-only release |
| Hosted implementation | Exact gh-app commit and Vercel deployment | A package version does not pin a hosted deployment |

The initial accepted GTM payload is `0.1.1`. A change to shipped manifests,
skills, references, scripts, assets or bundled README/review files requires a
new package version after publication. Patch covers compatible corrections;
minor covers additive compatible capabilities; major covers incompatible
installation/instruction contracts after 1.0. During 0.x, an incompatible change
requires a new minor version and an explicit migration/acceptance decision; a
patch must remain compatible. Never rewrite a published version or repoint its tag.
Repository-only architecture/release tooling changes do not change the installed
payload and do not require a package or CLI bump.

Server changes retain existing authentication and permissions. Version a
breaking MCP contract separately through its owning server and migration plan;
do not remove tools, rename routes, widen scopes or change provider identity as
part of packaging. A new package version does not grant new authority.

## One canonical payload, three distribution artifacts

```
plugins/growthub-gtm                     canonical/public OpenAI package
  ├─ build-gtm-plugin.mjs → codex-plugins/growthub-gtm
  └─ build-gtm-plugin.mjs → claude-plugins/growthub-gtm
```

The native Codex projection intentionally omits top-level portable `plugin.json`
and `mcp.json`: the native loader prioritizes the latter and cannot parse its
public review extensions. It uses `.codex-plugin/plugin.json` and `.mcp.json`.
The Claude projection uses `.claude-plugin/plugin.json` and its existing HTTP
bearer environment reference. All shared skill/reference/helper/asset bytes must
match the canonical package. Edit canonical payloads, regenerate projections,
and inspect the resulting diff; never hand-edit installed user directories.

The public package declares existing API-key connection metadata. That does not
establish support or approval on every ChatGPT surface. Consult the bundled
connection support matrix. Existing Growthub sign-in, API-token portal, provider
accounts, first-party credential issuance and per-tool approvals retain authority.
Never export an attested host credential into an external plugin configuration.

## Existing control-plane ownership

The plugin supplies instructions and connection configuration. The hosted app
owns identity, Projects/Characters, approved Brand Kits, Knowledge revisions,
native admission/execution, saved messages and Feed review. A Character request
retains operationId → messageId → commandId → exact saved reply. Read and verify
the real destination; a prepared delegation brief is not a dispatched turn.
Native Knowledge writes retain an attested tool event and immutable before/after
change set. Token-scoped external writes retain their existing token authority.
Neither path bypasses record permissions, revision checks or payload-bound retries.

Routine publication and repeat execution stay in their existing owners and UI.
This package adds no Routine implementation, scheduler, provider daemon, business
credential broker, customer campaign publication or new authentication path.

## Reproducible release artifacts

Run from a clean, reviewed feature branch, using the repository contribution
gates. `package-gtm-release.py` uses Python's standard library, makes no network
requests and reads no credentials:

```sh
node scripts/build-gtm-plugin.mjs
node scripts/check-codex-plugin.mjs
node scripts/check-claude-plugin.mjs
python3 scripts/package-gtm-release.py check
bash scripts/pr-ready.sh
```

After the approved package PR lands, use its exact main commit. Build into a new
directory outside the checkout:

```sh
python3 scripts/package-gtm-release.py build --out /absolute/external/release-directory
python3 scripts/package-gtm-release.py verify --out /absolute/external/release-directory
```

The tool refuses to overwrite artifacts, validates identities, URLs, credential
references, native projection parity and repository marketplace sources, and
creates three `growthub-gtm-<provider>-<version>.zip` files. It also creates
`SHA256SUMS` and `release-manifest.json` with source SHA, version, tag, each
archive's SHA-256/size and every payload member's path/size/hash. ZIP entries use
sorted paths, fixed timestamp/mode and no checkout-specific absolute paths.
The initial timestamp remains fixed to preserve the already-accepted archive
bytes. Verify both payload and container hashes; compression implementations can
differ across machines even when payloads agree.

Publish the package-scoped tag `growthub-gtm-v<version>` and a GitHub Release
targeting the approved main SHA, with all five generated assets. Check that an
existing tag/release has the identical target and assets; never overwrite it.
This is separate from `release.yml`, which publishes the independent npm CLI.
Do not trigger that npm workflow or move npm `latest` for a GTM-only release.

## Release order and acceptance record

1. Inspect current main, payload diff and contributions. Preserve required
   checks and repository review requirements; do not fabricate approval or
   silently change branch protection.
2. Obtain an actual JEV review of the final source/architecture/release decision.
   Retain resolved model, request ID, input/request hashes, answers and explicit
   source-based dispositions. JEV is advisory, not CI, human approval or live QA.
3. Require native Codex and Claude installation plus real saved-Character work,
   exact command/reply identities, destination readback and appropriate negative
   cases. Archive-only or fixture validation cannot substitute for these.
4. Merge the package PR before shipping the app page's main-branch README link.
   Publish and independently download/verify immutable release assets.
5. Merge the app PR; wait for the exact production build, verify its canonical
   domain, public entry, current MCP inventory and persisted attribution. Check
   the actual customer UI and server/persistence readback before claiming live.
6. Record provider-directory submission, approval and public listing IDs only
   after their own exact portal readback. Git merge, a GitHub Release and a
   repository marketplace entry do not prove external-directory approval.

Every dated receipt distinguishes payload QA, preview QA, existing-production
core-contract QA, merged source, deployed implementation, downloadable assets
and provider publication. Keep original failed and superseding successful
observations; never relabel QA traffic as organic customers or revenue. Store
private records/screenshots outside Git; public receipts contain sanitized
summaries and hashes, not customer content, credentials or tokens.

Rollback restores a previously accepted app deployment through its existing
release owner, or directs installations to the previous immutable plugin tag.
Keep stable plugin/server IDs, published assets, historical receipts and user
data. Never roll back by deleting Knowledge, changing provider auth, resetting
sessions or modifying Routines.
