/**
 * CMS Workflow Context — Stop-condition detector
 *
 * Pure analysis of a packet's source snapshot. Each detector returns the
 * stop conditions it finds without performing I/O so the suite is trivial
 * to unit-test.
 *
 * Codes:
 *   - workflow-not-found              · saved workflow could not be loaded
 *   - manifest-cache-missing          · no capability manifest cache on disk
 *   - manifest-cache-stale            · cache present but >24h old
 *   - bridge-auth-unavailable         · caller signalled auth-not-ready
 *   - agent-not-bound                 · agent could not be resolved (or auto-select was ambiguous)
 *   - unknown-node-slug               · node slug is not in the manifest
 *   - missing-binding                 · required binding key not present on node
 *   - schema-mismatch                 · node bindings carry an unknown key
 *   - execution-authority-mismatch    · saved workflow / agent disagree on authority
 *   - workspace-not-governed          · workspace is not registered as a fork
 */

import type { CapabilityManifest } from "@growthub/api-contract/manifests";
import type { NodeInputSchema } from "@growthub/api-contract/schemas";
import type { PacketSourcesSnapshot } from "./load-sources.js";
import type { ExecutionAuthority, StopCondition } from "./types.js";

function inputSchemaKeys(schema: NodeInputSchema | undefined): Set<string> {
  if (!schema) return new Set();
  return new Set(schema.fields.map((field) => field.key));
}

function manifestBySlug(snapshot: PacketSourcesSnapshot): Map<string, CapabilityManifest> {
  const out = new Map<string, CapabilityManifest>();
  const capabilities = snapshot.manifest.envelope?.capabilities ?? [];
  for (const cap of capabilities) out.set(cap.slug, cap);
  return out;
}

function deriveExecutionAuthority(snapshot: PacketSourcesSnapshot): ExecutionAuthority {
  const entry = snapshot.savedWorkflow.result?.entry;
  if (!entry) return "unknown";
  if (entry.source === "hosted") return "gh-app";
  if (entry.executionMode === "hosted") return "gh-app";
  if (entry.executionMode === "local") return "local";
  return "unknown";
}

export function detectStopConditions(snapshot: PacketSourcesSnapshot): StopCondition[] {
  const out: StopCondition[] = [];

  // ── workflow ─────────────────────────────────────────────────────────────
  if (!snapshot.savedWorkflow.result) {
    out.push({
      code: "workflow-not-found",
      severity: "error",
      detail: "Workflow id did not match any saved workflow (hosted or local).",
      hint: "Run 'growthub workflow saved' to list available workflows.",
    });
  }

  // ── bridge auth ──────────────────────────────────────────────────────────
  if (snapshot.bridgeAuthUnavailable) {
    out.push({
      code: "bridge-auth-unavailable",
      severity: "error",
      detail: "Authenticated bridge access is required for hosted workflow context.",
      hint: "Run 'growthub auth login' or pass --strict=false to surface anyway.",
    });
  }

  // ── manifest ─────────────────────────────────────────────────────────────
  if (snapshot.manifest.source === "missing") {
    out.push({
      code: "manifest-cache-missing",
      severity: "error",
      detail: "No capability manifest cache on disk; node schemas cannot be resolved.",
      hint: "Run 'growthub workflow' or 'growthub capability list' to refresh the manifest cache.",
    });
  } else if (snapshot.manifest.stale) {
    out.push({
      code: "manifest-cache-stale",
      severity: "warn",
      detail: `Manifest cache is older than 24h (fetched ${snapshot.manifest.fetchedAt}).`,
      hint: "Refresh with 'growthub capability list --refresh' before relying on schemas.",
    });
  }

  // ── agent ────────────────────────────────────────────────────────────────
  const agent = snapshot.agent;
  if (agent.autoSelectAmbiguous) {
    out.push({
      code: "agent-not-bound",
      severity: "warn",
      detail: "Multiple agent bindings present in this workspace; pass --agent <slug> to disambiguate.",
    });
  } else if (!agent.manifest && !agent.binding) {
    out.push({
      code: "agent-not-bound",
      severity: agent.slug ? "error" : "warn",
      detail: agent.slug
        ? `Agent '${agent.slug}' is not bound and could not be fetched from the bridge.`
        : "No agent slug provided and no binding could be auto-selected.",
      hint: agent.bridgeFetchError
        ? `Bridge fetch failed: ${agent.bridgeFetchError}.`
        : "Run 'growthub bridge agents bind <slug>' or pass --agent.",
    });
  }

  // ── workspace ────────────────────────────────────────────────────────────
  if (snapshot.workspace.workspacePath && !snapshot.workspace.forkRegistered) {
    out.push({
      code: "workspace-not-governed",
      severity: "warn",
      detail: `Workspace ${snapshot.workspace.workspacePath} is not registered as a kit fork; policy is omitted.`,
      hint: "Run 'growthub kit fork register' to bring it under governance.",
    });
  }

  // ── nodes / schemas ──────────────────────────────────────────────────────
  const find = snapshot.savedWorkflow.result;
  if (find) {
    const manifest = manifestBySlug(snapshot);
    for (const node of find.pipeline.nodes) {
      const cap = manifest.get(node.slug);
      if (!cap) {
        // If there's no manifest at all, we already raised that above; only
        // raise per-node when the manifest is present and the slug is missing.
        if (snapshot.manifest.source !== "missing") {
          out.push({
            code: "unknown-node-slug",
            severity: "error",
            detail: `Node slug '${node.slug}' is not present in the capability manifest.`,
            nodeId: node.id,
            hint: "Refresh the manifest cache or correct the workflow's node slug.",
          });
        }
        continue;
      }

      // Required-binding presence check
      const declaredKeys = new Set(Object.keys(node.bindings));
      for (const requiredKey of cap.requiredBindings ?? []) {
        if (!declaredKeys.has(requiredKey)) {
          out.push({
            code: "missing-binding",
            severity: "error",
            detail: `Node '${node.slug}' is missing required binding '${requiredKey}'.`,
            nodeId: node.id,
            hint: `Set ${requiredKey} on the workflow node, or bind it at the workspace level.`,
          });
        }
      }

      // Schema-mismatch: declared bindings whose key is not in the manifest's input schema.
      const allowed = inputSchemaKeys(cap.inputSchema);
      if (allowed.size > 0) {
        for (const key of declaredKeys) {
          if (!allowed.has(key)) {
            out.push({
              code: "schema-mismatch",
              severity: "warn",
              detail: `Node '${node.slug}' carries binding '${key}' which is not declared in the manifest input schema.`,
              nodeId: node.id,
              hint: "Remove the unknown key, or refresh the manifest if the field was added upstream.",
            });
          }
        }
      }
    }
  }

  // ── execution-authority alignment ────────────────────────────────────────
  if (find && agent.binding) {
    const workflowAuthority = deriveExecutionAuthority(snapshot);
    const agentAuthority = (agent.binding.executionAuthority ?? "unknown") as ExecutionAuthority;
    if (workflowAuthority !== "unknown" && agentAuthority !== "unknown" && workflowAuthority !== agentAuthority) {
      out.push({
        code: "execution-authority-mismatch",
        severity: "error",
        detail: `Saved workflow runs as '${workflowAuthority}' but agent binding is pinned to '${agentAuthority}'.`,
        hint: "Re-bind the agent against a workspace whose execution authority matches the workflow.",
      });
    }
  }

  return out;
}
