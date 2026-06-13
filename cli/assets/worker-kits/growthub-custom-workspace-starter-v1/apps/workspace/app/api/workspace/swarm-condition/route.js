/**
 * GET /api/workspace/swarm-condition
 *
 * Growthub Workspace Swarm Condition Packet V1 — read-only projection.
 *
 * Composes a registered workspace state lens into the agent-swarm assignment
 * shape: instead of a vague prompt, an agent (or a swarm) gets a workspace
 * *condition* — goal, current state, the blocked step, its prerequisite, the
 * tools available, and the evidence it must produce. The human activation
 * panel and this packet read the identical derived state.
 *
 * Optional query parameter:
 *   - lensId: "activation" (default) | "persistence" | "observability" |
 *             "deploy" | "tasks" | "app-build" | "fleet". Unknown ids fall
 *             back to "activation".
 *
 * Authority invariants:
 *   - GET only. PATCH / POST / PUT / DELETE are not exposed. Writes still flow
 *     through the existing governed routes (`PATCH /api/workspace`,
 *     `POST /api/workspace/sandbox-run`, etc.).
 *   - growthub.config.json remains the authoritative artifact.
 *   - No secrets, connection IDs, or tokens are returned. The runtime block is
 *     assembled from safe descriptors (persistence mode + adapter booleans).
 *   - Read OR derivation failures fall back to a typed packet with warnings —
 *     this route never throws.
 */

import { NextResponse } from "next/server";
import { readWorkspaceConfig, readWorkspaceSourceRecords, describePersistenceMode } from "@/lib/workspace-config";
import { readAdapterConfig } from "@/lib/adapters/env";
import { deriveSwarmConditionPacket } from "@/lib/workspace-activation";

const SWARM_PACKET_KIND = "growthub-swarm-condition-packet-v1";

/** Assemble the safe runtime descriptor the lenses read (no secrets/values). */
function safeRuntime(warnings) {
  const runtime = { persistenceMode: "", persistenceAdapter: null, allowFsWrite: false, nangoConfigured: false, deploy: {} };
  try {
    const persistence = describePersistenceMode();
    runtime.persistenceMode = persistence.mode;
    runtime.allowFsWrite = persistence.mode === "filesystem" && persistence.canSave === true;
    const adapter = readAdapterConfig();
    runtime.persistenceAdapter = persistence.mode === "database" ? (adapter.dataAdapter || null) : null;
    runtime.nangoConfigured = Boolean(adapter?.nango?.hasSecretKey);
    runtime.deploy = { target: adapter.deployTarget || "" };
  } catch (error) {
    warnings.push(`Failed to read runtime descriptor: ${error?.message || "unknown error"}`);
  }
  return runtime;
}

async function GET(request) {
  const warnings = [];

  let lensId = "activation";
  try {
    const url = request && request.url ? new URL(request.url) : null;
    const requested = url ? (url.searchParams.get("lensId") || "").trim() : "";
    if (requested) lensId = requested;
  } catch (error) {
    warnings.push(`Failed to parse query: ${error?.message || "unknown error"}`);
  }

  let workspaceConfig = {};
  try {
    workspaceConfig = (await readWorkspaceConfig()) || {};
  } catch (error) {
    warnings.push(`Failed to read workspace config: ${error?.message || "unknown error"}`);
  }

  let workspaceSourceRecords = {};
  try {
    workspaceSourceRecords = (await readWorkspaceSourceRecords()) || {};
  } catch (error) {
    warnings.push(`Failed to read source records sidecar: ${error?.message || "unknown error"}`);
  }

  const metadataGraph = { runtime: safeRuntime(warnings) };

  let packet;
  try {
    packet = deriveSwarmConditionPacket(
      { workspaceConfig, workspaceSourceRecords, metadataGraph },
      { lensId },
    );
  } catch (error) {
    warnings.push(`Failed to derive swarm packet: ${error?.message || "unknown error"}`);
    packet = {
      kind: SWARM_PACKET_KIND,
      version: 1,
      lensId: "activation",
      goal: "Activate this workspace.",
      currentState: "0/0",
      complete: false,
      nextAction: null,
      blockedStep: null,
      prerequisite: null,
      availableTools: [],
      expectedEvidence: [],
    };
  }

  return NextResponse.json({ ...packet, warnings });
}

export { GET };
