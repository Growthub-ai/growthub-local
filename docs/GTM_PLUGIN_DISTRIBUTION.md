# Growthub GTM plugin distribution

The canonical package is `plugins/growthub-gtm`; `node scripts/build-gtm-plugin.mjs`
generates its Claude variant. Both existing marketplaces contain the companion.
The governed console remains at its existing version, CLI pin and contract.

## Customer acceptance

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
