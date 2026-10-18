# Growthub GTM plugin distribution

The canonical package is `plugins/growthub-gtm`; `node scripts/build-gtm-plugin.mjs`
generates its separate native Codex and Claude projections. Both repository
marketplaces contain the companion. Public provider-directory acceptance is a
separate publication state.
The governed console remains at its existing version, CLI pin and contract.

The [architecture and release standard](GTM_PLUGIN_RELEASE_STANDARD.md) defines
the stable identities, independent version axes, immutable archives, JEV review,
acceptance provenance, publication order and rollback. The executable release
catalog is [`plugins/gtm-release.json`](../plugins/gtm-release.json). Run
`python3 scripts/package-gtm-release.py check` before release.

## Customer acceptance

The `growth-outcomes` method provides three initial jobs: a signup activation
packet, customer winback draft and weekly GTM brief. Each defines inputs,
completion evidence and unknowns. It checks capability and brand provenance
before dispatch, retrieves an exact saved result, and lets another provider
continue from the same message instead of rebuilding context. Readiness and
acceptance of these methods must be recorded per installed provider; their
presence in an archive is not execution proof.

Qualify each advertised external surface independently. A supported manifest
is not an installed connection. A connection is not a completed growth task.
Record the exact package hash, provider, saved Character/method revision,
command/message, accepted result and independent destination readback. For a
Routine record the native publication, frozen binding, terminal run and output.
Keep private identifiers and content in operational evidence outside Git.

Current package instructions use existing token settings and production MCP
endpoints. The ordinary provider logins, host credentials and authentication
implementation remain unchanged. Missing CEO token scopes or a provider's
submission-form limitation must be reported accurately, not worked around.

## Acquisition and activation

Directory links use `utm_source=openai-plugin-directory`,
`claude-plugin-marketplace` or `claude-code-marketplace`, with
`utm_medium=plugin_directory&utm_campaign=gtm_execution`. Landing destination:
`https://www.growthub.ai/f/plugins/growthub-gtm` after its website release.
Use a relevant existing template when that is the most useful first step.

The companion gh-app change observes directory arrivals and AI referrers through
the existing PostHog client and preserves normalized lead sources through the
existing GHL lifecycle mapper. Do not equate Growthub's internal plugin-install
milestone with an external directory installation. First and latest directory
sources, executing provider and original capture surface have separate meanings.

Measure arrival → confirmed connection → first destination-verified result →
repeat accepted work → successful Routine → paid conversion using existing
lifecycle owners. Count only outcomes supported by durable receipts. Revalidate
the attribution stitch through the actual signup/setup/checkout journey; adding
an enum or super property does not prove that journey.

## Template crawler, referral and citation reports

`scripts/report-gtm-discovery.mjs` consumes private JSONL exports without a new
server, credentials, database, agent, cron or monitoring process. Normalize actual
CDN/edge export records to:

```
{"requestId":"provider-request-id","observedAt":"ISO timestamp","path":"/f/playbook/slack-team-brief","status":200,"userAgent":"actual observed value","referrer":"actual observed referrer or empty"}
```

User-Agent classes are explicitly unverified; retain provider IP verification in
the source analysis when available. Browser analytics does not measure crawlers.
Requests, citations and referral clicks remain separate.

For a fixed, recorded prompt sample, retain the provider's actual answer in a
private local file. Each citation record references that evidence:

```
{"queryId":"fixed-prompt-id","provider":"actual provider","observedAt":"ISO timestamp","answerFile":"relative/private-answer.txt","answerSha256":"actual digest","citedUrls":["exact URL in the retained answer"]}
```

Include answers with no citations as `citedUrls: []`; they are the denominator.
Only record actual provider citations, not every URL merely mentioned in text.
Human/source review establishes that classification; a digest checks integrity,
not the truth of a citation claim. Do not commit private answers or edge logs.

```
node scripts/report-gtm-discovery.mjs --requests /private/requests.jsonl --citations /private/citations.jsonl --out /private/new-report.json
```

The report records missing evidence as unavailable, rejects malformed rows,
checks answer bytes and deduplicates request IDs. It aggregates data without
retaining IPs, emails, query strings or answer text. It does not schedule work,
claim global AI visibility, infer installs or attribute revenue from a crawl.
No measured baseline is available until actual exports/answers are supplied.

### Origin-render observations

The companion app emits `growthub.template-discovery.v1` runtime log events for
recognized bot tokens on template origin renders. Export only the structured
event objects into a private JSONL file and pass `--renders /private/renders.jsonl`
to the report. These have no HTTP delivery status and cannot replace CDN logs.
User-Agent identity is explicitly unverified. `probe:true` events from controlled
QA are counted separately and excluded from observed render totals. Cached edge
hits may never reach the origin. Neither source establishes citations.

Marked controlled request rows may carry `probe:true`; the report counts them
separately and excludes them from ordinary request totals as well. Preserve this
marker when normalizing known QA request IDs. A missing marker does not establish
that a request was human, organic or a verified provider crawler.
