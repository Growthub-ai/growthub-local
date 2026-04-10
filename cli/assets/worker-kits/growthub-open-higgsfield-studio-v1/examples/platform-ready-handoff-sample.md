# Growthub Platform-Ready Execution Handoff v1

## Runtime Mode

local-fork

## Repo Inspection Summary

- `packages/studio/src/models.js` reviewed for available video and lip-sync models
- `packages/studio/src/muapi.js` reviewed for submit and poll behavior
- `packages/studio/src/components/VideoStudio.jsx` reviewed for i2v vs t2v switching

## Provider Adapter Assumptions

- provider: Muapi
- auth: `x-api-key`
- flow: submit -> poll -> result

## Execution Steps

1. open video studio and load prompt `P01`
2. submit batch `B01`
3. poll until complete and review for continuity
4. move to lip-sync batch after hook clip is approved
