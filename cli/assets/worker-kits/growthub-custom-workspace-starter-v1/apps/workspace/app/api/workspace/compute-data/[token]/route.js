import { Readable } from "node:stream";
import { openComputeDatasetDelivery } from "@/lib/compute-data-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorStatus(reasonCode) {
  if (reasonCode === "dataset-token-expired") return 410;
  if (reasonCode === "dataset-file-missing") return 404;
  if (["dataset-token-malformed", "dataset-token-invalid"].includes(reasonCode)) return 403;
  if (reasonCode === "dataset-signing-key-missing") return 503;
  return 400;
}

/**
 * Short-lived, signed, read-only corpus delivery. Possession of the HMAC-bound
 * grant is the only authority; no workspace state is mutable through this
 * route. A delivery receipt is written only after every byte is streamed and
 * the observed SHA-256 still matches the token-bound corpus identity.
 */
export async function GET(_request, context) {
  const params = await context?.params;
  const token = String(params?.token || "");
  const delivery = await openComputeDatasetDelivery(token);
  if (!delivery?.ok) {
    return Response.json({
      ok: false,
      error: "governed compute dataset delivery refused",
      reasonCode: String(delivery?.reasonCode || "dataset-delivery-refused"),
      reason: String(delivery?.reason || "dataset delivery could not be authorized"),
    }, {
      status: errorStatus(delivery?.reasonCode),
      headers: { "cache-control": "private, no-store, max-age=0" },
    });
  }

  return new Response(Readable.toWeb(delivery.stream), {
    status: 200,
    headers: delivery.headers,
  });
}
