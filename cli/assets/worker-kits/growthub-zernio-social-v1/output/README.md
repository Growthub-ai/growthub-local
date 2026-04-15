# Output Directory

This directory is where all campaign deliverables are written.

---

## Structure

```
output/
  <client-slug>/
    <project-slug>/
      SocialCampaignBrief_v<N>_<YYYYMMDD>.md
      ContentCalendar_v<N>_<YYYYMMDD>.md
      PlatformPublishingPlan_v<N>_<YYYYMMDD>.md
      CaptionCopyDeck_v<N>_<YYYYMMDD>.md
      SchedulingManifest_v<N>_<YYYYMMDD>.md    (if scheduling requested)
      AnalyticsBrief_v<N>_<YYYYMMDD>.md        (if analytics data provided)
      ClientProposal_v<N>_<YYYYMMDD>.md        (if requested)
      scheduling-manifest.json                  (machine-readable, for Zernio POST /api/v1/posts)
      queue-<queue-name>.json                   (machine-readable, for Zernio POST /api/v1/queues)
```

---

## Naming Convention

```
<ClientSlug>_<OutputType>_v<N>_<YYYYMMDD>.md
```

- **ClientSlug:** TitleCase, no spaces (`UrbanCycle`, not `Urban Cycle`)
- **OutputType:** CamelCase (`SocialCampaignBrief`, `ContentCalendar`, etc.)
- **Version:** `v1`, `v2`, etc.
- **Date:** `YYYYMMDD` format

**Example:** `UrbanCycle_ContentCalendar_v1_20260415.md`

---

## Adding a New Project

When starting a campaign for a new client or a new project for an existing client:

```bash
mkdir -p output/<client-slug>/<project-slug>
```

The operator will write all deliverables to this directory and log the project in the brand kit DELIVERABLES LOG.

---

## Git and Version Control

The `output/` directory is excluded from kit exports. Do not commit client deliverables to the kit repository. Keep outputs in your local working directory or a separate client delivery folder.

If you are version-controlling client outputs separately, use the project slug as the branch or folder name.

---

## Secret Hygiene

`scheduling-manifest.json` and `queue-*.json` never contain `ZERNIO_API_KEY` or any OAuth tokens. They reference Zernio resource ids only (`profileId`, `accountId`, `mediaId`). If you see a raw API key in an output file, treat it as a bug and scrub it before sharing.
