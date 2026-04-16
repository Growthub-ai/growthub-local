# Starter Kit — Validation Checklist

Run before declaring a workspace ready for production:

- [ ] `kit.json` is schema-v2 valid
- [ ] Every path listed in `frozenAssetPaths` exists on disk
- [ ] `.growthub-fork/fork.json` is present and `growthub kit fork status <fork-id>` returns severity = none
- [ ] `policy.json` reflects the intended safety envelope
- [ ] `trace.jsonl` contains at minimum `registered` + `policy_updated` + one `status_ran` event
- [ ] `studio/` builds with `npm run build` (no errors)
- [ ] `growthub kit fork heal <fork-id> --dry-run` produces zero errors
- [ ] When `policy.remoteSyncMode === "pr"`: the GitHub remote is reachable and the last heal opened a draft PR
- [ ] `growthub status --super-admin` shows all critical services operational
