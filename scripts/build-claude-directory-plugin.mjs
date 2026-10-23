#!/usr/bin/env node
// Public Claude directory projection. Native packages and released archives stay unchanged.
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'plugins/growthub-gtm');
const target = resolve(root, 'claude-directory-plugins/growthub-gtm');
const { $schema, extensions, ...identity } = JSON.parse(readFileSync(resolve(source, 'plugin.json'), 'utf8'));
rmSync(target, { recursive: true, force: true });
mkdirSync(resolve(target, '.claude-plugin'), { recursive: true });
for (const name of ['skills', 'assets', 'LICENSE']) cpSync(resolve(source, name), resolve(target, name), { recursive: true });
mkdirSync(resolve(target, 'references'), { recursive: true });
writeFileSync(resolve(target, '.claude-plugin/plugin.json'), JSON.stringify(identity, null, 2) + '\n');
writeFileSync(resolve(target, '.mcp.json'), JSON.stringify({ mcpServers: { 'growthub-gtm': { type: 'http', url: 'https://www.growthub.ai/api/v1/mcp/gtm' } } }, null, 2) + '\n');
function replace(file, before, after) {
  const path = resolve(target, file), text = readFileSync(path, 'utf8');
  if (!text.includes(before)) throw new Error(`Canonical source changed: ${file}`);
  writeFileSync(path, text.replace(before, after));
}
replace('skills/get-started/SKILL.md', '   Native Claude/Codex installations keep their existing scoped API-token setup.\n', '   Existing native installations keep their independently configured connections.\n');
replace('skills/get-started/SKILL.md', '   existing Growthub selector or `scripts/growthub.mjs brand-kits` on a supported\n   execution surface.', '   existing Growthub selector to identify an accessible Brand Kit.');
replace('skills/execute-growth-work/SKILL.md', "On surfaces with shell execution and the existing GROWTHUB_API_TOKEN environment,\n`scripts/growthub.mjs` is a dependency-free fallback to the same fixed production\nMCP endpoints. Run it with the surface's plugin-root path; send tool arguments\non stdin. Never place credentials in arguments or write them into package files.\n", 'Use the connected Growthub MCP tools on this surface. Optional native API-token\nworkflows are configured independently; see [API workflows](../../references/api-token.md).\n');
writeFileSync(resolve(target, 'skills/api-token/SKILL.md'), `---
name: api-token
description: Help a user choose the existing scoped Growthub API-token workflow for private Brand Kit creation, asset retrieval or review-only proposals beyond the connected MCP tools.
---

# Choose the existing API workflow

Use the connected Growthub MCP tools for their supported operations. Read
[API workflow availability](../../references/api-token.md) when the user's
request requires the broader scoped REST API. Explain the available native
integration and its setup; never pretend an API-only operation is an MCP tool.
Do not read credentials from the machine, ask for them in chat, or copy a
connected provider credential. This directory bundle uses OAuth and contains
no token-reading scripts or automatic install-time execution.

Private Brand Kit creation and proposal submission remain available through
Growthub's existing native integration and API, with independently configured
scopes. A proposal is review-only. The CEO's separate review_api_requests and
decide_api_request tools keep their existing delegated approval boundary.
Continue independent permitted MCP work while the user configures native API
access. Never switch accounts, widen scopes or claim an unperformed write.
`);
writeFileSync(resolve(target, 'references/api-token.md'), `# Existing scoped API workflows

The public Claude bundle connects through OAuth. It does not capture an
ambient credential or introduce another token service. For private Brand Kit
creation, review-only proposals, gallery or usage operations beyond the MCP
inventory, use Growthub's existing native integration and scoped REST API.

[Native integration and API workflow](https://github.com/Growthub-ai/growthub-local/blob/main/claude-plugins/growthub-gtm/references/api-token.md)

Configure credentials only in the chosen host's private credential settings.
Do not paste tokens into a conversation or expose them in arguments, examples,
files or screenshots. Existing native installations and their independently
configured credentials remain unchanged by this public bundle.

Resolve the actual account, permissions, immutable active Brand Kit version and
resource IDs before a request. Verify the persisted result after a write. Stop
on authentication or permission refusal. Never retry an uncertain creation.
API proposals do not approve or publish themselves. CEO approval is available
only through the existing decision tools when the owner has delegated it.
`);
writeFileSync(resolve(target, 'references/connections.md'), `# Connect Growthub in Claude

Add the Growthub connector and sign in through its explicit OAuth consent.
The bundle and connector both use https://www.growthub.ai/api/v1/mcp/gtm, so
installing both does not introduce a second copy of the tools. The connection
exposes the existing 21 Brand Kit, CEO/Character and Knowledge tools together.
Access stays within the signed-in account's record permissions.

Use growthub_get_session to confirm identity and scopes. Select an actual
Project and saved Character. delegate_task prepares a brief for the caller;
message_character uses the Character's existing connected provider and grants.
Read the exact saved reply before claiming completion. Native execution needs
that account's own available provider and execution device. No credentials or
provider account are supplied by installing this bundle.

Knowledge edits retain revision checks. Brand Kit reads return approved active
versions. CEO API request decisions require owner delegation in Settings → CEO
→ Growthub API requests; default human decisions remain in Growthub.

[Existing scoped API workflows](api-token.md) remain separately configured.
Native installations keep their existing three endpoint identities and tokens.
Old read-only grants do not gain scopes. Routines, customer publishing and
external service permissions retain their existing owners and product UI.
Plans use Growthub's existing website checkout; no payment details are collected
by this connector.
`);
writeFileSync(resolve(target, 'README.md'), `# Growthub

Your growth team, connected to Claude. Work with your saved CEO and Characters,
use approved brand context, and continue from the work your team has already
saved. Turn a clear brief into a reviewable result without rebuilding the team
or repeating the context in every conversation.

## Put your team to work

“Use my Campaign Strategist and approved Brand Kit to prepare a campaign brief
for review.”

Find the saved Character, use its actual instructions and context, and prepare
a focused brief or send work through its existing connected provider. Retrieve
the saved reply and verify the destination before treating the job as complete.

![Direct your saved team](assets/use-case-team.png)

## Keep brand and business context together

“Find the Sample Studio campaign brief and use the current approved Brand Kit.”

Read permitted Knowledge with stable revisions and retrieve approved brand
assets. Your CEO can review Brand Kit API requests and approve or decline
eligible changes when you delegate that authority in Growthub Settings.

![Keep client context connected](assets/use-case-context.png)

## Continue from accepted work

“Find my Character’s latest saved result and show me the next decision.”

Continue an existing thread across Claude and Growthub. Repeat accepted work
through Growthub’s existing Routines and their publication controls. This
connector does not create, publish or manage Routine schedules.

![Repeat accepted work](assets/use-case-repeat.png)

## Connect once

Install this bundle and connect Growthub from its Connectors tab. Sign in with
your own Growthub account and approve the displayed OAuth permissions. The
bundle uses the same server URL as the Growthub connector, avoiding duplicate
tools. Start with the get-started skill. See [connection setup](references/connections.md).

The bundled skills explain team selection, growth briefs, result readback,
repeat work and existing API-token workflows. They use Growthub’s first-party
API at https://www.growthub.ai. Tool arguments are sent there under your account
permissions; saved replies and requested records are returned to Claude. The
bundle contains no hooks, local servers, install scripts or credential-reading
helpers. It does not scan local files or upload unrelated conversation history.

Saved-Character execution requires your own connected provider and available
execution device. Other services retain their own accounts and tool grants.
Optional [scoped API workflows](references/api-token.md) use the separately
configured native integration. Growthub plans are purchased through the existing
website checkout. No card collection or checkout occurs inside the connector.

The visuals illustrate workflows using existing product presentation; they are
not receipts of a newly executed task. [Watch the product overview](https://drive.google.com/file/d/1cCJSsTSpltLhvbcaphu06A8cxzAINnYf/view).

[Growthub](https://www.growthub.ai/f/plugins/growthub-gtm) ·
[Support](https://thegrowthub.com/pages/contact) ·
[Privacy](https://thegrowthub.com/policies/privacy-policy) ·
[Terms](https://thegrowthub.com/policies/terms-of-service)
`);
console.log(`Generated first public Claude directory projection ${identity.version}; native artifacts unchanged.`);
