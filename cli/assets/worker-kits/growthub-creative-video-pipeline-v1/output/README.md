# output/

Pipeline output artifacts. Structure: `output/<client>/<project>/`

```
output/
  <client>/
    <project>/
      brief/
        pipeline-brief.md       ← Stage 1 output
      generative/
        manifest.json           ← GenerativeArtifact[] index
        <artifact-id>.mp4       ← Generated video clips
        <artifact-id>.jpg       ← Generated images
      final/
        final.mp4               ← Stage 3 output
        edit-plan.md            ← video-use handoff artifact
      .growthub-fork/
        project.md              ← Governed progress log
        trace.jsonl             ← Machine-readable stage events
```

This directory is gitignored. Do not commit client output artifacts.
