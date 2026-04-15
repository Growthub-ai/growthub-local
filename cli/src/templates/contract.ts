/**
 * cli/src/templates/contract.ts
 *
 * Discriminated artifact union for the shared template library.
 * Completely separate from kits. Zero coupling.
 *
 * Extending:
 *   - New artifact type  → add interface, extend TemplateArtifact union
 *   - New family         → add to TemplateFamily, add entries in catalog.ts
 */

export type TemplateFamily = "video-creative" | "email" | "motion" | "general" | "marketing-framework";

export type SceneModuleSubtype = "hook" | "body" | "cta";

// ---------------------------------------------------------------------------
// Discriminated artifact types
// ---------------------------------------------------------------------------

export interface AdFormatArtifact {
  type: "ad-format";
  slug: string;
  id: string;
  name: string;
  family: TemplateFamily;
  category: string;
  tags: string[];
  scenes: number | null;
  hookVariations: number | null;
  compatibleFormats: string[];
  frozen: boolean;
  path: string;
}

export interface SceneModuleArtifact {
  type: "scene-module";
  subtype: SceneModuleSubtype;
  slug: string;
  id: string;
  name: string;
  family: TemplateFamily;
  category: string;
  tags: string[];
  scenes: null;
  compatibleFormats: string[];
  frozen: boolean;
  path: string;
}

export interface MarketingFrameworkArtifact {
  type: "marketing-framework";
  slug: string;
  id: string;
  name: string;
  family: TemplateFamily;
  category: string;
  tags: string[];
  sourceSkill: string;
  frozen: boolean;
  path: string;
}

/** Extend this union as new artifact families ship. */
export type TemplateArtifact = AdFormatArtifact | SceneModuleArtifact | MarketingFrameworkArtifact;

// ---------------------------------------------------------------------------
// Service types
// ---------------------------------------------------------------------------

export interface ResolvedArtifact {
  artifact: TemplateArtifact;
  content: string;
  absolutePath: string;
}

export interface ArtifactGroup {
  key: string;
  label: string;
  description: string;
  count: number;
  artifacts: TemplateArtifact[];
}

export interface ArtifactFilter {
  type?: TemplateArtifact["type"];
  subtype?: SceneModuleSubtype;
  family?: TemplateFamily;
  format?: string;
  tags?: string[];
}
