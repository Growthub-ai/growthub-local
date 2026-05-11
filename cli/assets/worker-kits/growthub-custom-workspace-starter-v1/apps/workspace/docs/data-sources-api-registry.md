# Data Sources and API Registry

This workspace supports provider-agnostic API-backed data sources without storing credentials in Data Model records.

Use this pattern for any external API:

1. Store the provider secret in workspace settings or server env.
2. Create an API Registry object.
3. Create a Data Source object.
4. Set the Data Source `registryId` to the API Registry row `integrationId`.
5. Test the record from the Data Model drawer.
6. Use the tested Data Source as the widget source.

## Object Types

### Data Source

Data Source rows represent the data a widget can consume.

Required fields:

- `Name`: display name.
- `registryId`: reference to an API Registry row by `integrationId`.
- `endpoint`: provider endpoint path or full URL.
- `authRef`: named secret reference, not the secret value.
- `baseUrl`: provider base URL.
- `status`: `untested`, `connected`, or `failed`.
- `lastTested`: timestamp from the latest test.
- `lastResponse`: saved JSON response shape from a successful test.

### API Registry

API Registry rows represent reusable API request configuration.

Required fields:

- `integrationId`: stable identifier used by Data Source `registryId`.
- `authRef`: named secret reference, not the secret value.
- `baseUrl`: provider base URL.
- `endpoint`: default endpoint path.
- `method`: HTTP method.
- `status`: connection status from testing.
- `lastTested`: timestamp from the latest test.
- `lastResponse`: saved JSON response shape.
- `entityTypes`: comma-separated source types this registry can power.
- `description`: human-readable notes.

## Credential Rules

Never add secret fields such as `apiKey`, `authToken`, password, or bearer token to Data Model objects.

Records store only `authRef`. The server resolves that reference to env/settings values. For example, an `authRef` of `LEADSHARK` can resolve to `LEADSHARK`, `LEADSHARK_API_KEY`, or `LEADSHARK_TOKEN`.

Provider-specific request headers belong in the server-side test route or provider adapter. The Data Model surface stays credential-free.

For APIs that do not use `x-api-key`, add non-secret request metadata to the API Registry row:

- `authHeaderName`: header name such as `Authorization`, `X-API-Token`, or `x-api-key`.
- `authPrefix`: optional value prefix such as `Bearer`.

Do not store the secret value in either field.

## Test Flow

The Data Model record drawer has a `Test connection` action for Data Source and API Registry rows.

For Data Source rows:

1. The server loads the referenced API Registry row from `registryId`.
2. It merges registry defaults with the Data Source row.
3. It resolves `authRef` server-side.
4. It sends the request from the API route.
5. A successful response saves `status: connected`, `lastTested`, and JSON `lastResponse`.
6. A failed response saves `status: failed` and must not mark the source connected.

Only rows with a successful test and parseable saved `lastResponse` qualify as configured sources.

## Widget Source Rules

Widget source pickers show Data Model objects from workspace config.

API Registry objects are not selectable as widget data sources. They are request configuration records.

Data Source objects are selectable only when at least one row is:

- `status` equal to `connected`, `approved`, `ok`, or `success`.
- `lastResponse` is valid saved JSON.

This ensures widgets bind only to tested, configured sources with a known returned shape.

## LeadShark Example

LeadShark uses:

- Base URL: `https://apex.leadshark.io/api`
- Leads endpoint: `/leads`
- Header: `x-api-key`
- Workspace secret reference: `LEADSHARK`

Example API Registry row:

```json
{
  "integrationId": "leadshark",
  "authRef": "LEADSHARK",
  "baseUrl": "https://apex.leadshark.io/api",
  "endpoint": "/leads",
  "method": "GET",
  "status": "untested",
  "entityTypes": "leads",
  "description": "LeadShark leads API"
}
```

Example Data Source row:

```json
{
  "Name": "LeadShark Leads",
  "registryId": "leadshark",
  "endpoint": "/leads?page=1&limit=5",
  "authRef": "LEADSHARK",
  "baseUrl": "https://apex.leadshark.io/api",
  "status": "untested"
}
```

After a successful test, `lastResponse` should contain the provider JSON response shape. For LeadShark leads, the expected top-level shape includes `data` and `pagination`.

## Scaling Pattern

This is intentionally API-agnostic. The same primitive works for any provider when it follows the same contract:

- One API Registry row per reusable provider request definition.
- One or more Data Source rows that reference registry records.
- No secrets in Data Model rows.
- Server-side test execution.
- Saved response shape after successful validation.
- Widgets bind only to tested Data Sources.
