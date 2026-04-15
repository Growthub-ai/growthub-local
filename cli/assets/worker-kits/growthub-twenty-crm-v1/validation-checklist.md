# Validation Checklist — Twenty CRM v1

Run through this checklist before your first CRM implementation session and before handing off any deliverable package.

---

## PRE-SESSION ENVIRONMENT CHECKLIST

### For all modes

- [ ] `.env` file exists (copied from `.env.example`)
- [ ] `TWENTY_API_TOKEN` is set to a non-placeholder value
- [ ] `TWENTY_API_URL` is set to the correct endpoint for your deployment mode
- [ ] `node setup/verify-env.mjs` exits 0 (API is reachable and token is valid)

### For local-fork mode only

- [ ] `bash setup/check-deps.sh` passes (node, npm, git, docker are all present)
- [ ] Docker is running
- [ ] Twenty fork is cloned and running via Docker Compose
- [ ] `http://localhost:3001` (frontend) is accessible
- [ ] `http://localhost:3000` (server) is accessible
- [ ] Workspace is created and an initial admin user is configured

### For self-hosted mode only

- [ ] Twenty server is accessible at the deployed URL
- [ ] API token is generated from the live workspace
- [ ] `node setup/verify-env.mjs` confirms connectivity

### For cloud mode only

- [ ] Logged in at [app.twenty.com](https://app.twenty.com)
- [ ] API token generated in Settings > API > Tokens
- [ ] `TWENTY_API_URL=https://api.twenty.com` is set in `.env`

---

## PRE-IMPLEMENTATION CHECKLIST

Before writing any artifacts:

- [ ] Brand kit exists at `brands/<client-slug>/brand-kit.md`
- [ ] Client CRM objective is confirmed (not vague)
- [ ] Deployment mode is confirmed (cloud / self-hosted / local-fork / agent-only)
- [ ] Data sources are listed (CSV exports, API providers, webhooks)
- [ ] Primary use case is confirmed and mapped to a workflow type
- [ ] Team size and CRM admin capacity are documented

---

## DATA MODEL CHECKLIST

Before finalizing any data model:

- [ ] Standard Twenty objects are reviewed — no custom object is created when a standard one fits
- [ ] Every custom object has a full field table (name, type, required/optional, select options)
- [ ] Every relation field names the target object on both ends
- [ ] Field types match Twenty's supported types (TEXT, NUMBER, RELATION, SELECT, etc.)
- [ ] Naming conventions are followed (PascalCase objects, camelCase fields)
- [ ] No field name conflicts with Twenty's reserved system fields (`id`, `createdAt`, `updatedAt`)

---

## ENRICHMENT PIPELINE CHECKLIST

Before finalizing any enrichment pipeline:

- [ ] Deduplication key is named (email / domain / linkedInLink)
- [ ] Import mode is specified (insert-only / merge)
- [ ] Provider auth mechanism is documented (token type, header name)
- [ ] Every provider field is mapped to a Twenty field
- [ ] Transformation rules are documented for any field requiring normalization
- [ ] Error handling path is documented (what happens when a record fails to import)
- [ ] Update frequency is specified

---

## AUTOMATION CHECKLIST

Before finalizing any pipeline automation brief:

- [ ] Trigger type is specified (on_create / on_update / on_field_change / on_schedule / on_webhook)
- [ ] Object targeted by the trigger is named
- [ ] Trigger conditions are fully specified (field, value, comparison operator)
- [ ] Every action has its type, target, and parameters documented
- [ ] Failure and timeout behavior is documented
- [ ] No polling loop is designed when an event trigger is available

---

## WEBHOOK CHECKLIST

Before finalizing any webhook spec:

- [ ] Direction is classified (inbound / outbound)
- [ ] Event name matches Twenty's event naming pattern (`<object>.<event>`)
- [ ] Full payload schema is documented (not just the event name)
- [ ] Target endpoint or source is specified
- [ ] Auth on the receiving side is documented
- [ ] Retry policy is documented (Twenty default: 3 attempts, exponential backoff)

---

## DELIVERABLE PACKAGE CHECKLIST

Before handing off a full deliverable package:

- [ ] All output files are in `output/<client-slug>/<project-slug>/`
- [ ] File naming follows the `<ClientSlug>_<OutputType>_v<N>_<YYYYMMDD>.md` pattern
- [ ] No placeholder text remains in any file
- [ ] Every artifact that lists field names uses Twenty's naming conventions
- [ ] Brand kit DELIVERABLES LOG is updated with the delivery line
- [ ] Deployment mode is labeled at the top of every output (`mode: cloud` / `mode: self-hosted` / `mode: agent-only`)
- [ ] If agent-only mode: every assumption is labeled as assumption-based
