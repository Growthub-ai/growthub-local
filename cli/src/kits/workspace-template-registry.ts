/**
 * Workspace template registry.
 *
 * Reads cli/assets/workspace-templates/manifest.json and exposes a typed
 * surface that every kit/command call-site can use instead of hardcoded
 * literals. Adding a new workspace template = one manifest row + one seed
 * file. No TypeScript edits.
 *
 * The manifest is a one-time cached read; entries are immutable inside a
 * single CLI invocation.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { KitListItem } from "./service.js";
import type { KitActivationMode, KitCapabilityType, KitFamily } from "./contract.js";

/**
 * Static activation-step blueprint shipped per template. PR #216's
 * workspace-activation.js currently hardcodes one of these per template; the
 * V1 plan calls for it to consume this blueprint instead so activation
 * adapters and the CLI registry share a single source of truth.
 *
 * `completeWhen` is a small predicate DSL the renderer evaluates against
 * workspaceConfig + workspaceSourceRecords + metadataGraph. The shape is
 * intentionally permissive (`Record<string, unknown>`) at the registry
 * boundary — the renderer owns predicate dispatch.
 */
export interface ActivationStepBlueprint {
  id: string;
  label: string;
  description: string;
  href: string;
  ctaPending?: string;
  ctaComplete?: string;
  ctaFailed?: string;
  hint?: string;
  hintFailed?: string;
  completeWhen: Record<string, unknown>;
  blockedUntil?: string[];
}

export interface ActivationBlueprint {
  headline?: string;
  headlineComplete?: string;
  subheadlineComplete?: string;
  steps: ActivationStepBlueprint[];
}

export interface WorkspaceTemplateEntry {
  id: string;
  slug: string;
  aliases: string[];
  name: string;
  description: string;
  version: string;
  family: string;
  bundleId: string;
  bundleVersion: string;
  seedConfig: string;
  defaultOutDir: string;
  defaultName: string;
  briefType: string;
  /**
   * Optional static blueprint consumed by the activation renderer. When
   * absent, the renderer falls back to the generic blank-workspace adapter.
   */
  activation?: ActivationBlueprint;
}

interface WorkspaceTemplateManifest {
  schemaVersion: number;
  description?: string;
  templates: WorkspaceTemplateEntry[];
}

let cachedEntries: WorkspaceTemplateEntry[] | null = null;

function resolveManifestPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../../assets/workspace-templates/manifest.json"),
    path.resolve(moduleDir, "../assets/workspace-templates/manifest.json"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Could not locate workspace template manifest.");
}

function loadManifest(): WorkspaceTemplateEntry[] {
  if (cachedEntries) return cachedEntries;
  const manifestPath = resolveManifestPath();
  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as WorkspaceTemplateManifest;
  if (raw.schemaVersion !== 1) {
    throw new Error(`Unsupported workspace template manifest schemaVersion: ${raw.schemaVersion}`);
  }
  if (!Array.isArray(raw.templates)) {
    throw new Error("Workspace template manifest is missing templates[] array.");
  }
  cachedEntries = raw.templates.map((t) => ({
    ...t,
    aliases: Array.isArray(t.aliases) ? t.aliases : [],
    activation: normalizeActivation(t.activation),
  }));
  return cachedEntries;
}

function normalizeActivation(value: unknown): ActivationBlueprint | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  const normalizedSteps: ActivationStepBlueprint[] = [];
  for (const step of steps) {
    if (!step || typeof step !== "object" || Array.isArray(step)) continue;
    const s = step as Record<string, unknown>;
    if (typeof s.id !== "string" || typeof s.label !== "string"
      || typeof s.description !== "string" || typeof s.href !== "string"
      || !s.completeWhen || typeof s.completeWhen !== "object" || Array.isArray(s.completeWhen)) {
      throw new Error(`Workspace template activation step is malformed: ${JSON.stringify(s)}`);
    }
    normalizedSteps.push({
      id: s.id,
      label: s.label,
      description: s.description,
      href: s.href,
      ctaPending: typeof s.ctaPending === "string" ? s.ctaPending : undefined,
      ctaComplete: typeof s.ctaComplete === "string" ? s.ctaComplete : undefined,
      ctaFailed: typeof s.ctaFailed === "string" ? s.ctaFailed : undefined,
      hint: typeof s.hint === "string" ? s.hint : undefined,
      hintFailed: typeof s.hintFailed === "string" ? s.hintFailed : undefined,
      completeWhen: s.completeWhen as Record<string, unknown>,
      blockedUntil: Array.isArray(s.blockedUntil)
        ? s.blockedUntil.filter((x): x is string => typeof x === "string")
        : undefined,
    });
  }
  return {
    headline: typeof raw.headline === "string" ? raw.headline : undefined,
    headlineComplete: typeof raw.headlineComplete === "string" ? raw.headlineComplete : undefined,
    subheadlineComplete: typeof raw.subheadlineComplete === "string" ? raw.subheadlineComplete : undefined,
    steps: normalizedSteps,
  };
}

export function listWorkspaceTemplates(): WorkspaceTemplateEntry[] {
  return loadManifest().slice();
}

export function resolveWorkspaceTemplate(idOrAlias: string): WorkspaceTemplateEntry | null {
  const needle = String(idOrAlias || "").trim().toLowerCase();
  if (!needle) return null;
  for (const entry of loadManifest()) {
    if (entry.id.toLowerCase() === needle) return entry;
    if (entry.slug.toLowerCase() === needle) return entry;
    for (const alias of entry.aliases) {
      if (alias.toLowerCase() === needle) return entry;
    }
  }
  return null;
}

export function isWorkspaceTemplateId(idOrAlias: string): boolean {
  return resolveWorkspaceTemplate(idOrAlias) !== null;
}

const KIT_FAMILY_VALUES = new Set<KitFamily>(["studio", "workflow", "operator", "ops"]);
const KIT_TYPE_VALUES = new Set<KitCapabilityType>(["worker", "workflow", "output", "ui"]);

function narrowFamily(value: string): KitFamily {
  if ((KIT_FAMILY_VALUES as Set<string>).has(value)) return value as KitFamily;
  throw new Error(`Workspace template manifest declared an unsupported family "${value}". Allowed: ${[...KIT_FAMILY_VALUES].join(", ")}.`);
}

function narrowType(value: string): KitCapabilityType {
  if ((KIT_TYPE_VALUES as Set<string>).has(value)) return value as KitCapabilityType;
  throw new Error(`Unsupported workspace template type "${value}".`);
}

export function workspaceTemplateToKitListItem(entry: WorkspaceTemplateEntry): KitListItem {
  const exportMode: KitActivationMode = "export";
  return {
    id: entry.id,
    version: entry.version,
    name: entry.name,
    description: entry.description,
    type: narrowType("worker"),
    family: narrowFamily(entry.family),
    executionMode: "export",
    activationModes: [exportMode],
    bundleId: entry.bundleId,
    bundleVersion: entry.bundleVersion,
    briefType: entry.briefType,
  };
}

/** Test-only: reset the in-process cache so tests can re-read the manifest. */
export function __resetWorkspaceTemplateCache(): void {
  cachedEntries = null;
}
