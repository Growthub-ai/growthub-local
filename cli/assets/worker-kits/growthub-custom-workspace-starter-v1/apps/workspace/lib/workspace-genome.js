/**
 * Workspace genome — the pure causation deriver that recognizes FIRST-PARTY
 * "well-known atomic structures" (the DNA of the workspace) and the phenotype
 * they express, WITHOUT the user labeling anything. No React, no fetch, no fs,
 * never throws.
 *
 * First principles: a user-generated custom object is just rows. But when a
 * record's values match a first-party causation signature — a custom-model
 * endpoint, a nango integration, an agent-team blueprint — a *genome* emerges.
 * That genome is the source of truth for two governed UX decisions, and ONLY
 * those:
 *
 *   1. FIELD VISIBILITY — which genome-governed columns a Data Model table view
 *      shows. Genome fields stay HIDDEN until a record expresses that genome
 *      (detected by causation) or a row already carries a user-added value.
 *      This is the "always hide custom-model binding fields until present" rule.
 *   2. SIDECAR RENDERING — which sidecar a clicked record renders (custom-model
 *      vs nango vs generic), so configuration/rendering for one genome never
 *      crosses into another.
 *
 * It is a registry of genome definitions so new first-party structures attach
 * additively (infinite scaling) without touching existing derivers or
 * poisoning other states. Each genome is self-contained: its detector, its
 * governed fields, its sidecar key. A record that matches no genome is
 * `generic` — a plain user-defined record with no special rendering.
 */

import { isCustomModelRegistryRow } from "./custom-models-ledger.js";

/**
 * First-party genome registry. Each entry:
 *   id        — stable genome class id
 *   label     — human label for the sidecar header
 *   appliesTo — objectType(s) this genome can classify
 *   sidecar   — sidecar render key (what to show when a record is clicked)
 *   fields    — columns this genome governs (hidden until the genome is present)
 *   detect    — pure causation detector (row, ctx) -> boolean
 *
 * Order matters: the first matching genome wins (most specific first).
 */
export const WORKSPACE_GENOMES = [
  {
    id: "custom-model",
    label: "Custom Model",
    appliesTo: ["api-registry"],
    sidecar: "custom-model",
    fields: ["kind", "capabilityType", "modelTrainingRowId", "trainingRunId", "expectedModelTag"],
    detect: (row, ctx) => isCustomModelRegistryRow(row, ctx?.linkedIds),
  },
  {
    id: "nango",
    label: "Nango Integration",
    appliesTo: ["api-registry"],
    sidecar: "nango",
    fields: ["providerConfigKey", "connectionId"],
    detect: (row) => String(row?.connectorKind || "").toLowerCase() === "nango"
      || /nango/i.test(String(row?.resolverTemplateId || "")),
  },
];

function genomesForObjectType(objectType) {
  return WORKSPACE_GENOMES.filter((g) => g.appliesTo.includes(String(objectType || "")));
}

/**
 * Object-level genomes — first-party well-known GOVERNED objects that are
 * SINGLETON tables in a workspace (the frozen business + feature primitives).
 * When a user or agent tries to create one that already exists, the record
 * FOLDS into the existing table instead of spawning a duplicate — so the Data
 * Model dropdown never bloats and the workspace stays manageable. A genuinely
 * user-generated object (no genome) is never folded. Additive: new first-party
 * primitives register here once and inherit the fold-or-create behavior.
 */
export const GOVERNED_OBJECT_GENOMES = [
  { id: "model-training", objectType: "model-training", label: "Model Training", singleton: true },
  { id: "model-training-run", objectType: "model-training-run", label: "Model Training Runs", singleton: true },
  { id: "training-traces", objectType: "training-traces", label: "Training Traces", singleton: true },
  { id: "api-registry", objectType: "api-registry", label: "API Registry", singleton: true },
  { id: "agent-swarm-teams", objectType: "agent-swarm-teams", label: "Agent Teams", singleton: true },
];

/** Classify an object (existing or proposed) into its governed genome, else null. */
export function deriveObjectGenome(object) {
  const objectType = String(object?.objectType || object || "");
  return GOVERNED_OBJECT_GENOMES.find((g) => g.objectType === objectType) || null;
}

/**
 * Resolve where a proposed governed object/record should land. Pure.
 *
 *   - fold=true  → a singleton genome table already exists; append the record
 *                  to `targetObjectId` instead of creating a duplicate table.
 *   - fold=false, createWellKnownId set → first instance of a singleton genome;
 *                  create it once under the canonical well-known id.
 *   - fold=false, genome=null → a user-generated object; create as proposed
 *                  (no constraint added, full backwards compatibility).
 *
 * @returns {{ fold: boolean, targetObjectId: string|null, genome: string|null, createWellKnownId: boolean }}
 */
export function resolveGovernedObjectTarget({ workspaceConfig, objectType, proposedId } = {}) {
  const genome = deriveObjectGenome(objectType);
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  if (!genome || !genome.singleton) {
    return { fold: false, targetObjectId: proposedId || null, genome: genome?.id || null, createWellKnownId: false };
  }
  const existing = objects.find((o) => String(o?.objectType || "") === genome.objectType);
  if (existing) return { fold: true, targetObjectId: String(existing.id || genome.id), genome: genome.id, createWellKnownId: false };
  return { fold: false, targetObjectId: genome.id, genome: genome.id, createWellKnownId: true };
}

/**
 * Fold-or-create through the genome — the unified upstream/downstream write.
 * Pure: returns a NEW objects array, never mutates. Appends `row` to the
 * existing singleton genome table when present (optionally upserting by a key
 * field), else creates the canonical well-known table from `template`. For a
 * non-genome objectType it creates/appends exactly as proposed.
 *
 * @param {object[]} objects - dataModel.objects
 * @param {object} spec - { objectType, row, upsertKey?, template? }
 */
export function foldRecordIntoGovernedObject(objects, { objectType, row, upsertKey = "", template = null } = {}) {
  const list = Array.isArray(objects) ? objects : [];
  const target = resolveGovernedObjectTarget({ workspaceConfig: { dataModel: { objects: list } }, objectType, proposedId: template?.id });
  const appendRow = (o) => {
    const rows = Array.isArray(o.rows) ? o.rows : [];
    if (upsertKey) {
      const idx = rows.findIndex((r) => String(r?.[upsertKey] ?? "") === String(row?.[upsertKey] ?? "") && String(row?.[upsertKey] ?? "") !== "");
      if (idx >= 0) return { ...o, rows: rows.map((r, i) => (i === idx ? { ...r, ...row } : r)) };
    }
    return { ...o, rows: [...rows, row] };
  };

  if (target.fold) {
    return list.map((o) => (String(o?.id || "") === target.targetObjectId || String(o?.objectType || "") === objectType ? appendRow(o) : o));
  }
  // Create once: canonical well-known id for a singleton genome, else proposed.
  const base = template || { id: target.targetObjectId || objectType, objectType, rows: [], binding: { mode: "manual" }, relations: [], fieldSettings: { hidden: [], order: [] } };
  return [...list, { ...base, id: target.createWellKnownId ? (target.targetObjectId || base.id) : base.id, objectType, rows: [...(Array.isArray(base.rows) ? base.rows : []), row] }];
}

/**
 * Classify one record into its genome (first match), else `generic`. Pure.
 * `ctx.linkedIds` (Set) is optional — only the custom-model genome consults it
 * for the bonded-link signal; explicit traits classify standalone.
 *
 * @returns {{ genome: string, label: string, sidecar: string, fields: string[] }}
 */
export function deriveRecordGenome(row, { objectType = "api-registry", linkedIds } = {}) {
  for (const g of genomesForObjectType(objectType)) {
    let hit = false;
    try { hit = Boolean(g.detect(row, { linkedIds })); } catch { hit = false; }
    if (hit) return { genome: g.id, label: g.label, sidecar: g.sidecar, fields: g.fields.slice() };
  }
  return { genome: "generic", label: "Record", sidecar: "generic", fields: [] };
}

/**
 * Derive which genome-governed fields a Data Model TABLE view should hide vs
 * show for one object. A genome field is HIDDEN unless the object holds at
 * least one record that either (a) expresses that genome by causation, or
 * (b) already carries a non-empty value for the field (user-added). This is
 * the production rule: custom-model binding columns never clutter a generic /
 * nango api-registry table until a real custom-model record is present.
 *
 * Pure. Returns the field id arrays; the existing fieldSettings.hidden
 * convention consumes `hidden` directly — no new rendering path.
 *
 * @returns {{ hidden: string[], shown: string[], present: string[] }}
 */
export function deriveGenomeFieldVisibility({ object, linkedIds } = {}) {
  const objectType = object?.objectType;
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  const genomes = genomesForObjectType(objectType);
  const hidden = [];
  const shown = [];
  const present = [];

  for (const g of genomes) {
    const expressed = rows.some((row) => {
      try { if (g.detect(row, { linkedIds })) return true; } catch { /* ignore */ }
      return g.fields.some((f) => String(row?.[f] ?? "").trim() !== "");
    });
    if (expressed) { present.push(g.id); shown.push(...g.fields); }
    else hidden.push(...g.fields);
  }
  return { hidden: [...new Set(hidden)], shown: [...new Set(shown)], present };
}

/**
 * Merge genome visibility into an object's existing fieldSettings.hidden so a
 * governed write keeps user-hidden fields hidden AND hides un-expressed genome
 * fields, while revealing genome fields the moment a record expresses them.
 * Pure — returns a new fieldSettings, never mutates.
 */
export function applyGenomeFieldSettings(object, { linkedIds } = {}) {
  const { hidden, shown } = deriveGenomeFieldVisibility({ object, linkedIds });
  const prior = Array.isArray(object?.fieldSettings?.hidden) ? object.fieldSettings.hidden : [];
  // Keep prior hidden fields that are not genome-governed; add hidden genome
  // fields; never hide a genome field that is now expressed (shown wins).
  const shownSet = new Set(shown);
  const merged = [...new Set([...prior.filter((f) => !shownSet.has(f)), ...hidden])];
  return { ...(object?.fieldSettings || {}), hidden: merged };
}

/**
 * Sidecar selector for a clicked record — the single decision point for which
 * genome sidecar/configuration renders. Generic records get no special
 * rendering. This is how the Data Model shell renders custom-model config for a
 * custom-model record and nango config for a nango record, never crossing.
 */
export function deriveRecordSidecar(row, ctx = {}) {
  const g = deriveRecordGenome(row, ctx);
  return { genome: g.genome, label: g.label, sidecar: g.sidecar, fields: g.fields, renders: g.genome !== "generic" };
}
