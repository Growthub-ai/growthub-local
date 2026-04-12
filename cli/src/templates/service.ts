/**
 * cli/src/templates/service.ts
 *
 * Runtime for the shared template library.
 * Imports: node builtins + contract + catalog only. Zero coupling to kits.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATE_CATALOG } from "./catalog.js";
import type {
  TemplateArtifact,
  ArtifactFilter,
  ArtifactGroup,
  ResolvedArtifact,
  SceneModuleSubtype,
} from "./contract.js";

// ---------------------------------------------------------------------------
// Asset root
// ---------------------------------------------------------------------------

function resolveSharedTemplatesRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    path.resolve(moduleDir, "../../assets/shared-templates"),
    path.resolve(moduleDir, "../assets/shared-templates"),
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Shared template assets not found at cli/assets/shared-templates/");
}

// ---------------------------------------------------------------------------
// Slug resolver — exact → slug → suffix → contains → token
// ---------------------------------------------------------------------------

export function resolveSlug(input: string): TemplateArtifact | null {
  const needle = input.toLowerCase().trim();
  return (
    TEMPLATE_CATALOG.find((a) => a.id === needle) ??
    TEMPLATE_CATALOG.find((a) => a.slug === needle) ??
    TEMPLATE_CATALOG.find((a) => a.id.endsWith("/" + needle)) ??
    TEMPLATE_CATALOG.find((a) => a.id.includes(needle) || a.slug.includes(needle)) ??
    (() => {
      const tokens = needle.split(/[-_/\s]+/).filter((t) => t.length > 2);
      for (const token of tokens) {
        const match = TEMPLATE_CATALOG.find((a) => a.slug.includes(token) || a.id.includes(token));
        if (match) return match;
      }
      return null;
    })()
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function listArtifacts(filter: ArtifactFilter = {}): TemplateArtifact[] {
  let results: TemplateArtifact[] = [...TEMPLATE_CATALOG];
  if (filter.type)    results = results.filter((a) => a.type === filter.type);
  if (filter.subtype) results = results.filter((a) => a.type === "scene-module" && a.subtype === filter.subtype);
  if (filter.family)  results = results.filter((a) => a.family === filter.family);
  if (filter.format) {
    const fmt = filter.format.toLowerCase();
    results = results.filter((a) =>
      a.compatibleFormats.length === 0 || a.compatibleFormats.some((f) => f.includes(fmt)),
    );
  }
  if (filter.tags?.length) {
    results = results.filter((a) => filter.tags!.some((tag) => a.tags.includes(tag)));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Get + copy
// ---------------------------------------------------------------------------

export function getArtifact(slugOrId: string): ResolvedArtifact {
  const artifact = resolveSlug(slugOrId);
  if (!artifact) throw new Error(`Unknown template '${slugOrId}'. Run 'growthub template list' to browse.`);
  const root = resolveSharedTemplatesRoot();
  const absolutePath = path.resolve(root, artifact.path);
  if (!fs.existsSync(absolutePath)) throw new Error(`Template file missing: ${absolutePath}`);
  return { artifact, content: fs.readFileSync(absolutePath, "utf8"), absolutePath };
}

export function copyArtifact(slugOrId: string, destDir: string): string {
  const resolved = getArtifact(slugOrId);
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.resolve(destDir, path.basename(resolved.absolutePath));
  fs.copyFileSync(resolved.absolutePath, destPath);
  return destPath;
}

// ---------------------------------------------------------------------------
// Group — two-step picker structure. Never flat.
// ---------------------------------------------------------------------------

const GROUP_ORDER = ["ad-formats", "scene-modules/hooks", "scene-modules/body", "scene-modules/cta"] as const;

const GROUP_META: Record<string, { label: string; description: string }> = {
  "ad-formats":          { label: "Ad Formats",                   description: "Complete frozen video ad structures — scene count, sacred elements, adaptation rules" },
  "scene-modules/hooks": { label: "Scene Modules — Hooks",        description: "Scene 1 — pattern interrupt, scroll stop, opening emotional beat" },
  "scene-modules/body":  { label: "Scene Modules — Body",         description: "Scenes 2–N — problem confession, skeptic pivot, demo, social proof" },
  "scene-modules/cta":   { label: "Scene Modules — CTA",          description: "Final scene — offer close, guarantee, conversion" },
};

function groupKey(a: TemplateArtifact): string {
  if (a.type === "ad-format") return "ad-formats";
  return `scene-modules/${(a as { subtype: SceneModuleSubtype }).subtype}`;
}

export function groupArtifacts(artifacts: TemplateArtifact[]): ArtifactGroup[] {
  const map = new Map<string, TemplateArtifact[]>();
  for (const a of artifacts) {
    const key = groupKey(a);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  const ordered: ArtifactGroup[] = [];
  for (const key of GROUP_ORDER) {
    if (!map.has(key)) continue;
    const items = map.get(key)!;
    const meta = GROUP_META[key] ?? { label: key, description: "" };
    ordered.push({ key, label: meta.label, description: meta.description, count: items.length, artifacts: items });
  }
  for (const [key, items] of map) {
    if (GROUP_ORDER.includes(key as typeof GROUP_ORDER[number])) continue;
    ordered.push({ key, label: key, description: "", count: items.length, artifacts: items });
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface CatalogStats {
  total: number;
  byFamily: Record<string, number>;
  byType: Record<string, number>;
}

export function getCatalogStats(): CatalogStats {
  const all = [...TEMPLATE_CATALOG];
  const byFamily: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const a of all) {
    byFamily[a.family] = (byFamily[a.family] ?? 0) + 1;
    byType[a.type]     = (byType[a.type]     ?? 0) + 1;
  }
  return { total: all.length, byFamily, byType };
}
