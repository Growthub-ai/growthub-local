/** Public API — consumers import only from here. */
export type {
  TemplateArtifact, AdFormatArtifact, SceneModuleArtifact,
  SceneModuleSubtype, TemplateFamily,
  ArtifactFilter, ArtifactGroup, ResolvedArtifact,
} from "./contract.js";

export type { CatalogStats } from "./service.js";

export {
  resolveSlug, listArtifacts, getArtifact,
  copyArtifact, groupArtifacts, getCatalogStats,
} from "./service.js";
