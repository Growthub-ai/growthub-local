export const pipelineStages = [
  {
    id: "brief",
    step: "01",
    label: "Brief",
    description: "Brand-grounded creative brief sourced from brand-kit.md. Scene structure, hooks, and constraints locked before generation.",
    outputPath: "output/<client>/<project>/brief/pipeline-brief.md",
  },
  {
    id: "generate",
    step: "02",
    label: "Generate",
    description: "Generative image/video via adapter (growthub-pipeline or byo-api-key). Normalised to GenerativeArtifact[] + manifest.json.",
    outputPath: "output/<client>/<project>/generative/manifest.json",
  },
  {
    id: "edit",
    step: "03",
    label: "Edit",
    description: "ElevenLabs Scribe transcription → word-boundary EDL → FFmpeg render via video-use fork. Final output: final.mp4.",
    outputPath: "output/<client>/<project>/final/final.mp4",
  },
];

export const stageStatus = {
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETE: "complete",
  ERROR: "error",
};
