/**
 * Training persistence seam — thin, agnostic, scalable. Pure: no React, no
 * fetch, no fs, no environment assumptions.
 *
 * Purpose (under the hood, NOT user-facing in v1): as a user's local config
 * and source-records grow, the run-receipt / export history must be able to
 * condense — convert the verbose JSON into a compact, binary-friendly
 * envelope that traverses and stores cheaply, then expand losslessly back to
 * the rendered visual the data model needs. v1 ships the SEAM and a lossless
 * default; the deferred persistence module (Growthub Bridge Training
 * Persistence V2) flips the codec to a real compressed/offloaded one WITHOUT
 * any v1 behavior change — that is the whole point of a seam.
 *
 * Codecs are dependency-injected (deflate/inflate passed in), so this module
 * is environment-agnostic: it never imports zlib. The CLI write lane can pass
 * node:zlib; a browser surface can pass a WASM/streams codec; tests pass any.
 * The default `json-v1` codec is a lossless passthrough so nothing breaks
 * when no compressor is available.
 */

export const TRAINING_PERSISTENCE_ENVELOPE = "growthub-local-training-persistence-v1";

/**
 * Codec contract (agnostic): { id, encode(obj, ctx) -> string|Uint8Array,
 * decode(payload, ctx) -> obj }. ctx carries injected primitives so no codec
 * reaches for a global. Stable, additive — new codecs register here.
 */
export const PERSISTENCE_CODECS = {
  // Lossless passthrough — the v1 default. Compact-prints JSON (no spaces).
  "json-v1": {
    id: "json-v1",
    binary: false,
    encode: (obj) => JSON.stringify(obj),
    decode: (payload) => JSON.parse(typeof payload === "string" ? payload : new TextDecoder().decode(payload)),
  },
  // Compact binary — gzip(JSON) → base64. Requires injected deflate/inflate
  // (e.g. node:zlib gzipSync/gunzipSync). Available only when provided; the
  // future persistence module wires it. Agnostic by construction.
  "gzip-base64-v1": {
    id: "gzip-base64-v1",
    binary: true,
    encode: (obj, ctx = {}) => {
      if (typeof ctx.deflate !== "function") throw new Error("gzip-base64-v1 requires ctx.deflate");
      const bytes = ctx.deflate(new TextEncoder().encode(JSON.stringify(obj)));
      return toBase64(bytes);
    },
    decode: (payload, ctx = {}) => {
      if (typeof ctx.inflate !== "function") throw new Error("gzip-base64-v1 requires ctx.inflate");
      const bytes = ctx.inflate(fromBase64(typeof payload === "string" ? payload : toBase64(payload)));
      return JSON.parse(new TextDecoder().decode(bytes));
    },
  },
};

function toBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (typeof Buffer !== "undefined") return Buffer.from(u8).toString("base64");
  let bin = "";
  for (let i = 0; i < u8.length; i += 1) bin += String.fromCharCode(u8[i]);
  return typeof btoa === "function" ? btoa(bin) : bin;
}
function fromBase64(str) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(str, "base64"));
  const bin = typeof atob === "function" ? atob(str) : str;
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
  return u8;
}

export function resolvePersistenceCodec(id) {
  return PERSISTENCE_CODECS[id] || PERSISTENCE_CODECS["json-v1"];
}

/**
 * Condense any training payload into a portable envelope. The envelope is
 * self-describing (codec id + counts) so expand never has to guess. Falls
 * back to json-v1 losslessly when the requested codec is unavailable, so a
 * growing local store can always be written.
 */
export function condenseTrainingPayload(payload, { codecId = "json-v1", ...ctx } = {}) {
  let codec = resolvePersistenceCodec(codecId);
  let data;
  try {
    data = codec.encode(payload, ctx);
  } catch {
    codec = PERSISTENCE_CODECS["json-v1"];
    data = codec.encode(payload, ctx);
  }
  return {
    envelope: TRAINING_PERSISTENCE_ENVELOPE,
    codec: codec.id,
    binary: Boolean(codec.binary),
    recordCount: Array.isArray(payload?.records) ? payload.records.length : undefined,
    data,
  };
}

/** Expand a condensed envelope back to the live rendered payload. Never throws. */
export function expandTrainingPayload(envelope, ctx = {}) {
  if (!envelope || typeof envelope !== "object") return null;
  if (envelope.envelope !== TRAINING_PERSISTENCE_ENVELOPE) {
    // Already-expanded plain payload — pass through.
    return envelope;
  }
  const codec = resolvePersistenceCodec(envelope.codec);
  try {
    return codec.decode(envelope.data, ctx);
  } catch {
    return null;
  }
}

/**
 * The future persistence-upgrade contract — declared, not wired. v1 uses the
 * local lane (plaintext JSON files). The deferred module implements this same
 * shape for compressed/offloaded/hosted persistence. Keeping the seam here
 * means future modules attach without touching v1 derivers or routes.
 */
export const PERSISTENCE_UPGRADE_SEAM = {
  contract: "growthub-local-persistence-upgrade-seam-v1",
  // A persistence target implements: read(key), write(key, envelope),
  // list(prefix), and declares whether it compresses/offloads. v1 default is
  // the local file lane (no compression, no offload).
  capabilities: ["read", "write", "list", "compress", "offload"],
  v1Default: { id: "local-file", compress: false, offload: false },
  // Reserved for V2 (Growthub Bridge Training Persistence) — never required
  // by v1; listed so future wiring is additive and discoverable.
  deferredTargets: ["compressed-local", "hosted-mirror", "offloaded-cold-store"],
};
