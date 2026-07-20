/**
 * Compute Provider Registry — Sprint 3 of the Governed Compute Realization.
 * Pure: no React, no fetch, no fs. Derives "which compute providers exist
 * and what state is each in" from the ONE existing source of truth:
 * ordinary API Registry rows (`dataModel.objects[]`, objectType
 * "api-registry") carrying `metadata.computeProvider` with schema
 * `growthub-compute-provider-v1` — the exact posture of the mothership
 * proxy policy row (`metadata.mothershipProxy`). Adding a provider is
 * adding a row; there is no second provider configuration store.
 *
 * Strict row validation is the credential firewall: a governed row carries
 * env-var NAMES only. Any credential-shaped VALUE in the compute block is a
 * validation violation that invalidates the provider (fail closed), and the
 * violation names the offending path so the operator can repair it.
 *
 * Provider state ladder (each is honest, none is optimistic):
 *   invalid-row        row present but fails validation (reasons named)
 *   adapter-missing    row valid but no registered adapter realizes it
 *   credential-missing adapter present but a requiredEnv name is not set
 *   ready              row + adapter + credentials all present
 *
 * Credential PRESENCE is evidence the caller injects (`envPresent(name)`,
 * boolean only — the deriver never touches process.env and never sees a
 * value), so the derivation stays pure and testable.
 */

import { COMPUTE_CAPACITY_PROFILE_IDS } from "./compute-capacity-profiles.js";

/** Runtime mirrors of the shared contract (tested for equality). */
export const COMPUTE_PROVIDER_ROW_SCHEMA = "growthub-compute-provider-v1";
export const COMPUTE_AVAILABILITY_MODES = ["local", "on-demand", "queued", "warm", "reserved", "spot"];

/** A legal env reference is an env-var NAME, never a value. */
const ENV_NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/;

/** Key names that suggest a credential is being stored rather than referenced. */
const CREDENTIAL_KEY_RE = /(api[-_]?key|secret|token|password|credential|bearer|private[-_]?key)/i;

/** Value shapes that look like actual key material. */
const CREDENTIAL_VALUE_RES = [
  /^sk-[A-Za-z0-9]{8,}/,           // OpenAI-style
  /^(ak|as|wk|ws)-[A-Za-z0-9]{6,}/, // Modal-style token ids/secrets
  /^rpa?_[A-Za-z0-9]{16,}/,         // Runpod-style
  /^ey[A-Za-z0-9_-]{20,}\./,        // JWT
  /^[A-Za-z0-9+/=_-]{40,}$/,        // long opaque blob
];

function isEnvName(value) {
  return ENV_NAME_RE.test(String(value || ""));
}

function looksLikeCredentialValue(value) {
  const s = String(value || "");
  if (!s || s.length < 8) return false;
  if (isEnvName(s)) return false; // an env NAME is exactly what we want stored
  return CREDENTIAL_VALUE_RES.some((re) => re.test(s));
}

/** Recursively scan an object for credential-shaped keys/values. Bounded. */
function scanForCredentials(value, pathPrefix, violations, depth = 0) {
  if (depth > 6 || !value || typeof value !== "object") return;
  for (const [key, v] of Object.entries(value)) {
    const p = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (typeof v === "string") {
      if (CREDENTIAL_KEY_RE.test(key) && v.trim() && !isEnvName(v.trim())) {
        violations.push({ code: "credential-value-in-row", path: p, reason: `"${key}" carries a value that is not an env-var NAME — governed rows store secret references only` });
      } else if (looksLikeCredentialValue(v)) {
        violations.push({ code: "credential-shaped-value", path: p, reason: `value at "${p}" is credential-shaped — governed rows must not carry key material` });
      }
    } else if (v && typeof v === "object") {
      scanForCredentials(v, p, violations, depth + 1);
    }
  }
}

/**
 * Validate one API Registry row's compute-provider block. Pure, never
 * throws. Returns { present, valid, violations[], metadata } where
 * `metadata` is the normalized block (only when valid).
 */
export function parseComputeProviderRow(row) {
  const block = row?.metadata?.computeProvider;
  if (!block || typeof block !== "object") {
    return { present: false, valid: false, violations: [], metadata: null };
  }
  const violations = [];
  const flag = (code, reason, path = "metadata.computeProvider") => violations.push({ code, path, reason });

  if (block.schema !== COMPUTE_PROVIDER_ROW_SCHEMA) {
    flag("unknown-schema", `schema "${String(block.schema || "")}" is not ${COMPUTE_PROVIDER_ROW_SCHEMA}`);
  }
  const adapterId = String(block.adapterId || "").trim();
  if (!adapterId) flag("adapter-id-missing", "adapterId is required — the row must name which registered adapter realizes it");

  const capacityProfiles = Array.isArray(block.capacityProfiles) ? block.capacityProfiles.map(String) : null;
  if (!capacityProfiles || capacityProfiles.length === 0) {
    flag("capacity-profiles-missing", "capacityProfiles must list at least one governed profile");
  } else {
    for (const id of capacityProfiles) {
      if (!COMPUTE_CAPACITY_PROFILE_IDS.includes(id)) flag("unknown-capacity-profile", `"${id}" is not a governed capacity profile`);
    }
  }

  const availabilityModes = Array.isArray(block.availabilityModes) ? block.availabilityModes.map(String) : null;
  if (!availabilityModes || availabilityModes.length === 0) {
    flag("availability-modes-missing", "availabilityModes must list at least one mode");
  } else {
    for (const mode of availabilityModes) {
      if (!COMPUTE_AVAILABILITY_MODES.includes(mode)) flag("unknown-availability-mode", `"${mode}" is not a known availability mode`);
    }
  }

  const requiredEnv = Array.isArray(block.requiredEnv) ? block.requiredEnv.map(String) : [];
  for (const name of requiredEnv) {
    if (!isEnvName(name)) {
      flag(
        looksLikeCredentialValue(name) ? "credential-value-in-row" : "invalid-env-reference",
        `requiredEnv entry "${name.slice(0, 24)}${name.length > 24 ? "…" : ""}" is not an UPPER_SNAKE env-var NAME`,
        "metadata.computeProvider.requiredEnv",
      );
    }
  }

  const executionLane = String(block.executionLane || "").trim();
  if (!executionLane) flag("execution-lane-missing", "executionLane is required (e.g. sandbox-local / sandbox-serverless)");

  // The credential firewall: no value anywhere in the block may be key material.
  scanForCredentials(block, "metadata.computeProvider", violations);

  const valid = violations.length === 0;
  return {
    present: true,
    valid,
    violations,
    metadata: valid
      ? {
          schema: COMPUTE_PROVIDER_ROW_SCHEMA,
          adapterId,
          capacityProfiles,
          availabilityModes,
          requiredEnv,
          executionLane,
          config: block.config && typeof block.config === "object" ? block.config : {},
        }
      : null,
  };
}

/** All api-registry rows of the workspace (pure read). */
function registryRows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const registry = objects.filter((o) => o?.objectType === "api-registry");
  return registry.flatMap((o) => (Array.isArray(o.rows) ? o.rows : []).filter((r) => r && typeof r === "object"));
}

export const LOCAL_PROVIDER_ID = "local-machine";

/**
 * Derive the full compute-provider picture. Pure, never throws.
 *
 * @param {object} opts
 * @param {object}   [opts.workspaceConfig]
 * @param {string[]} [opts.registeredAdapterIds]  from listComputeProviderAdapters()
 * @param {function} [opts.envPresent]            (name) => boolean — presence ONLY
 * @param {object}   [opts.preflight]             stamped machine evidence for the builtin local provider
 * @returns {{ providers: object[], rows: number, invalid: number }}
 */
export function deriveComputeProviders({ workspaceConfig = null, registeredAdapterIds = [], envPresent = () => false, preflight = null } = {}) {
  const adapterSet = new Set((registeredAdapterIds || []).map(String));
  const presence = typeof envPresent === "function" ? envPresent : () => false;
  const providers = [];
  let invalid = 0;

  // The builtin local provider: derived from machine evidence, no row needed.
  // A governed row with integrationId "local-machine" overrides it.
  const rows = registryRows(workspaceConfig);
  const hasLocalRow = rows.some((r) => String(r?.integrationId || "") === LOCAL_PROVIDER_ID && r?.metadata?.computeProvider);
  if (!hasLocalRow) {
    const localRegistered = adapterSet.has(LOCAL_PROVIDER_ID);
    providers.push({
      providerId: LOCAL_PROVIDER_ID,
      rowName: "",
      provenance: "builtin",
      adapterId: LOCAL_PROVIDER_ID,
      status: localRegistered ? "ready" : "adapter-missing",
      statusReason: localRegistered
        ? (preflight ? "owned hardware — capacity from stamped machine evidence" : "owned hardware — machine not measured yet; the preflight probe runs before anything trains")
        : "local adapter not registered",
      capacityProfiles: ["harvest-only", "serve-local", "cpu-local-finetune", "single-gpu-finetune"],
      availabilityModes: ["local"],
      executionLane: "sandbox-local",
      requiredEnv: [],
      missingEnv: [],
      violations: [],
      preflightPresent: Boolean(preflight),
    });
  }

  for (const row of rows) {
    const parsed = parseComputeProviderRow(row);
    if (!parsed.present) continue;
    const providerId = String(row.integrationId || row.Name || "").trim() || "unnamed-provider";
    if (!parsed.valid) {
      invalid += 1;
      providers.push({
        providerId,
        rowName: String(row.Name || ""),
        provenance: "governed-row",
        adapterId: String(row?.metadata?.computeProvider?.adapterId || ""),
        status: "invalid-row",
        statusReason: parsed.violations.map((v) => v.reason).join("; "),
        capacityProfiles: [],
        availabilityModes: [],
        executionLane: "",
        requiredEnv: [],
        missingEnv: [],
        violations: parsed.violations,
        preflightPresent: false,
      });
      continue;
    }
    const meta = parsed.metadata;
    const adapterRegistered = adapterSet.has(meta.adapterId);
    const missingEnv = meta.requiredEnv.filter((name) => presence(name) !== true);
    let status = "ready";
    let statusReason = "provider configured, adapter registered, credentials present";
    if (!adapterRegistered) {
      status = "adapter-missing";
      statusReason = `no registered compute adapter with id "${meta.adapterId}" — the provider is blocked until its adapter loads`;
    } else if (missingEnv.length > 0) {
      status = "credential-missing";
      statusReason = `required credential${missingEnv.length > 1 ? "s" : ""} not present in the runtime environment: ${missingEnv.join(", ")} (names only — values never enter the workspace)`;
    }
    providers.push({
      providerId,
      rowName: String(row.Name || ""),
      provenance: "governed-row",
      adapterId: meta.adapterId,
      status,
      statusReason,
      capacityProfiles: meta.capacityProfiles,
      availabilityModes: meta.availabilityModes,
      executionLane: meta.executionLane,
      requiredEnv: meta.requiredEnv,
      missingEnv,
      violations: [],
      preflightPresent: false,
      config: meta.config,
    });
  }

  return { providers, rows: rows.length, invalid };
}

/**
 * Build a governed compute-provider row proposal — pure shape factory (the
 * caller applies it through the normal PATCH lane). No secrets: requiredEnv
 * is env-var NAMES.
 */
export function buildComputeProviderRowProposal({
  integrationId = "",
  name = "",
  adapterId = "",
  capacityProfiles = [],
  availabilityModes = [],
  requiredEnv = [],
  executionLane = "sandbox-local",
  config = {},
} = {}) {
  return {
    integrationId: String(integrationId || "").trim(),
    Name: String(name || integrationId || "").trim(),
    kind: "compute-provider",
    capabilityType: "compute-provider",
    metadata: {
      computeProvider: {
        schema: COMPUTE_PROVIDER_ROW_SCHEMA,
        adapterId: String(adapterId || "").trim(),
        capacityProfiles: (Array.isArray(capacityProfiles) ? capacityProfiles : []).map(String),
        availabilityModes: (Array.isArray(availabilityModes) ? availabilityModes : []).map(String),
        requiredEnv: (Array.isArray(requiredEnv) ? requiredEnv : []).map(String),
        executionLane: String(executionLane || "sandbox-local"),
        config: config && typeof config === "object" ? config : {},
      },
    },
  };
}
