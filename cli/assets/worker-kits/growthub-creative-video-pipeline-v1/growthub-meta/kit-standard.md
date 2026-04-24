# Kit Standard

## Version
- Kit: `growthub-creative-video-pipeline-v1`
- Schema: `2`
- Standard: `v1.2`
- CLI minimum: `0.4.3`

## outputStandard

Required paths for a complete pipeline run:
```
output/<client>/<project>/brief/pipeline-brief.md
output/<client>/<project>/generative/manifest.json
output/<client>/<project>/final/final.mp4
output/<client>/<project>/.growthub-fork/project.md
output/<client>/<project>/.growthub-fork/trace.jsonl
```

## Upgrade Notes

- v1 → v2 schema: `frozenAssetPaths` array added. All asset paths enumerated in `kit.json`.
- outputStandard v1.2: `trace.jsonl` required at every stage boundary (previously optional).
- Adapter contract v1.0: `GenerativeArtifact[]` normalisation required for both adapters.
