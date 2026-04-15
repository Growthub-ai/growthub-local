/**
 * Knowledge Sync — Hosted Relay
 *
 * Relays knowledge items from a local KnowledgeSyncEnvelope to the hosted
 * Growthub app. Uses only the existing CLI-scoped hosted endpoints
 * (PaperclipApiClient + hosted-client.ts patterns) — never raw Supabase.
 *
 * The hosted app receives items via POST /api/cli/knowledge?action=import-skills.
 * When the endpoint returns 404/501, it is treated as "unavailable" and the
 * relay is skipped gracefully (same pattern as workflow endpoints).
 */

import { PaperclipApiClient, ApiRequestError } from "../../client/http.js";
import type { CliAuthSession } from "../../auth/session-store.js";
import { HostedEndpointUnavailableError } from "../../auth/hosted-client.js";
import type { KnowledgeSyncEnvelope, KnowledgeSyncItem } from "@paperclipai/shared/types/knowledge-sync.js";
import type { HostedRelayResult } from "./types.js";

const HOSTED_KNOWLEDGE_IMPORT_PATH = "/api/cli/knowledge?action=import-skills";

export interface HostedKnowledgeImportPayload {
  envelopeId: string;
  sourceWorkspaceLabel?: string;
  items: Array<{
    originId: string;
    name: string;
    description: string;
    body: string;
    format: string;
    source: string;
    bodySha256: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface HostedKnowledgeImportResponse {
  ok: boolean;
  imported: number;
  skipped: number;
  errors?: string[];
}

/**
 * Relays knowledge items from an envelope to the hosted Growthub app.
 *
 * Falls back gracefully (returns ok: false with an error message) when:
 * - the hosted endpoint is unavailable (404/501)
 * - the session is missing or expired
 * - a network error occurs
 */
export async function relayEnvelopeToHosted(
  envelope: KnowledgeSyncEnvelope,
  session: CliAuthSession,
  baseUrl?: string,
): Promise<HostedRelayResult> {
  const effectiveBaseUrl = baseUrl ?? session.hostedBaseUrl;
  if (!effectiveBaseUrl) {
    return { ok: false, relayed: 0, skipped: 0, error: "No hosted base URL available" };
  }

  const client = new PaperclipApiClient({
    apiBase: effectiveBaseUrl,
    apiKey: session.accessToken,
  });

  const payload: HostedKnowledgeImportPayload = {
    envelopeId: envelope.envelopeId,
    sourceWorkspaceLabel:
      envelope.sourceRef.kind === "label" ? envelope.sourceRef.value : envelope.sourceRef.displayName,
    items: envelope.items.map((item: KnowledgeSyncItem) => ({
      originId: item.originId,
      name: item.name,
      description: item.description,
      body: item.body,
      format: item.format,
      source: item.source,
      bodySha256: item.bodySha256,
      metadata: item.metadata,
    })),
  };

  try {
    const result = await client.post<HostedKnowledgeImportResponse>(
      HOSTED_KNOWLEDGE_IMPORT_PATH,
      payload,
      { ignoreNotFound: true },
    );

    if (!result) {
      return { ok: false, relayed: 0, skipped: 0, error: "Hosted endpoint returned empty response" };
    }

    return {
      ok: result.ok,
      relayed: result.imported,
      skipped: result.skipped,
      error: result.errors?.join("; "),
    };
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 404 || err.status === 501)) {
      throw new HostedEndpointUnavailableError(
        err.status,
        "Hosted knowledge import endpoint is not available on this Growthub app surface.",
      );
    }
    throw err;
  }
}

/**
 * Tries to relay an envelope to the hosted app.
 * Returns a HostedRelayResult — never throws (errors become ok: false).
 */
export async function tryRelayEnvelopeToHosted(
  envelope: KnowledgeSyncEnvelope,
  session: CliAuthSession,
  baseUrl?: string,
): Promise<HostedRelayResult> {
  try {
    return await relayEnvelopeToHosted(envelope, session, baseUrl);
  } catch (err) {
    if (err instanceof HostedEndpointUnavailableError) {
      return { ok: false, relayed: 0, skipped: 0, error: err.message };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, relayed: 0, skipped: 0, error: message };
  }
}
