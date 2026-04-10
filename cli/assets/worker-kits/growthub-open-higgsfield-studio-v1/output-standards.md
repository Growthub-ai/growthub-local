# Output Standards — Open Higgsfield Studio v1

This document defines the output contract for every artifact produced by this kit.

---

## OUTPUT FOLDER STRUCTURE

```text
output/
└── <client-slug>/
    └── <project-slug>/
        ├── <ClientSlug>_VisualCampaignBrief_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_StudioSelectionBrief_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_ModelSelectionRecommendation_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_ShotPlan_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_PromptMatrix_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_GenerationBatchPlan_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_AssetTracking_v<N>_<YYYYMMDD>.md
        ├── <ClientSlug>_ReviewQAChecklist_v<N>_<YYYYMMDD>.md
        └── <ClientSlug>_PlatformReadyExecutionHandoff_v<N>_<YYYYMMDD>.md
```

---

## REQUIRED OUTPUT TYPES

Every full package must include:
- visual campaign brief
- studio selection brief
- model selection recommendation
- shot plan
- prompt matrix
- generation batch plan
- asset tracking
- review QA checklist
- platform-ready execution handoff

---

## REQUIRED SECTIONS

### Visual campaign brief
1. Goal and deliverable
2. Audience and platform context
3. Brand and visual rules
4. Content objective to visual strategy translation
5. Asset inventory
6. Studio hypothesis
7. Output package summary

### Studio selection brief
1. Requested outcome
2. Recommended studio
3. Why this studio fits
4. Input requirements
5. Risks and fallback studio

### Model selection recommendation
1. Primary model table
2. Fallback model table
3. Endpoint and control assumptions
4. Constraint notes

### Shot plan
1. Shot table
2. Narrative arc notes
3. Asset dependencies
4. Review gates

### Prompt matrix
1. Prompt set metadata
2. One row per output or shot
3. Base prompt
4. Variation prompt
5. Negative / exclusion language
6. Control settings

### Generation batch plan
1. Batch sequence table
2. Submit order
3. Polling / review cadence
4. Retry rules

### Asset tracking
1. Asset inventory table
2. Reuse status
3. Upload status
4. Ownership / notes

### Review QA checklist
1. Creative review
2. Technical review
3. Studio-specific review
4. Handoff sign-off

### Platform-ready execution handoff
1. Runtime mode
2. Repo inspection summary
3. Provider adapter assumptions
4. Exact execution steps
5. Expected outputs
6. Open questions

---

## FILE NAMING RULES

Pattern:

```text
<ClientSlug>_<OutputType>_v<N>_<YYYYMMDD>.md
```

Rules:
- `ClientSlug` is PascalCase
- never overwrite an existing version
- keep one artifact per file
- Markdown only

---

## QUALITY BAR

An output is complete when:
- no placeholder text remains
- the primary studio is explicit
- the model recommendation includes a fallback
- prompts are paste-ready
- every shot has a defined asset path or asset request
- batch sequencing reflects async submit/poll execution
- browser / desktop / local-fork mode is named
- review checklist is filled, not empty
