/**
 * Bounded completion cache used before custom-model routing.
 *
 * Exact response identity includes the full normalized request. Semantic
 * reuse is opt-in and only becomes available when an operator configures an
 * embedding provider. It is restricted to the same model/adapter/schema/tool
 * scope and shared-prefix bucket, and uses a high similarity floor. This
 * prevents a common but unsafe shortcut: returning one user's answer for
 * another request merely because both prompts share a long system prefix.
 *
 * The default store is process-local and bounded. When standard Upstash Redis
 * REST credentials are configured, entries and a bounded bucket index are
 * mirrored there; no cache body is ever written into governed config.
 */

import { createHash, createHmac, randomBytes } from "node:crypto";
import { stableStringify } from "./contracts.js";

const DEFAULT_MAX_ENTRIES = 256;
const DEFAULT_CANDIDATES = 32;
const DEFAULT_SEMANTIC_THRESHOLD = 0.965;
const DEFAULT_EMBEDDING_TIMEOUT_MS = 5_000;
const DEFAULT_POISON_RADIUS = 0.92;
const DEFAULT_POISON_TTL_SECONDS = 86_400;
const MAX_POISON_MARKERS = 256;

export const CACHE_BYPASS_POISONED = "CACHE_BYPASS_POISONED";

const INFERENCE_REDIS_CREDENTIAL_PAIRS = Object.freeze([
  Object.freeze({
    source: "growthub",
    urlEnv: "GROWTHUB_INFERENCE_CACHE_REDIS_URL",
    tokenEnv: "GROWTHUB_INFERENCE_CACHE_REDIS_TOKEN",
  }),
  Object.freeze({
    source: "upstash",
    urlEnv: "UPSTASH_REDIS_REST_URL",
    tokenEnv: "UPSTASH_REDIS_REST_TOKEN",
  }),
  Object.freeze({
    source: "vercel-marketplace-upstash",
    urlEnv: "KV_REST_API_URL",
    tokenEnv: "KV_REST_API_TOKEN",
  }),
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sha256Hex(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

/**
 * Resolve one complete Redis REST credential pair. URL and token values are
 * intentionally never mixed across namespaces: a partial operator override
 * cannot borrow the token from a marketplace installation (or vice versa).
 */
export function resolveInferenceRedisCredentials(env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  const incomplete = [];
  for (const pair of INFERENCE_REDIS_CREDENTIAL_PAIRS) {
    const url = String(source[pair.urlEnv] || "").trim();
    const token = String(source[pair.tokenEnv] || "").trim();
    if (url && token) return { ...pair, url, token, incomplete };
    if (url || token) {
      incomplete.push({
        source: pair.source,
        missingEnv: [url ? pair.tokenEnv : pair.urlEnv],
      });
    }
  }
  return {
    source: "disabled",
    urlEnv: "",
    tokenEnv: "",
    url: "",
    token: "",
    incomplete,
  };
}

/**
 * Cache version is derived from the workspace's Redis credential binding
 * (source + URL + token hash + namespace). Rotating the Upstash credentials
 * or changing the namespace changes this value; every previously written
 * envelope then fails its version check, forcing a safe cache rebuild.
 */
export function deriveCacheVersion({ credentials = null, namespace = "" } = {}) {
  return sha256Hex(JSON.stringify({
    schema: "growthub-inference-cache-version-v1",
    source: credentials?.source || "local",
    urlSha256: credentials?.url ? sha256Hex(credentials.url) : "",
    tokenSha256: credentials?.token ? sha256Hex(credentials.token) : "",
    namespace: String(namespace || ""),
  }));
}

/**
 * Workspace-scoped HMAC key for cache envelopes. Precedence:
 * 1. explicit `GROWTHUB_INFERENCE_CACHE_HMAC_KEY` (operator-owned);
 * 2. derived from the governed Redis token + namespace, so shared entries
 *    are only readable by processes holding the same credential binding and
 *    credential rotation invalidates old signatures;
 * 3. an ephemeral per-process key for the bounded local cache.
 * The key never appears in receipts — only its non-secret fingerprint.
 */
export function resolveCacheSigningKey({ env = process.env, credentials = null, namespace = "" } = {}) {
  const explicit = String(env?.GROWTHUB_INFERENCE_CACHE_HMAC_KEY || "").trim();
  if (explicit) {
    return { key: explicit, keyId: sha256Hex(`growthub-cache-key:${explicit}`).slice(0, 16), source: "operator" };
  }
  if (credentials?.token) {
    const derived = sha256Hex(`growthub-cache-key:${credentials.token}:${String(credentials.url || "")}:${String(namespace || "")}`);
    return { key: derived, keyId: derived.slice(0, 16), source: "credential-derived" };
  }
  const ephemeral = randomBytes(32).toString("hex");
  return { key: ephemeral, keyId: sha256Hex(`growthub-cache-key:${ephemeral}`).slice(0, 16), source: "process-ephemeral" };
}

function normalizeEmbedding(value) {
  const input = Array.isArray(value) ? value : value?.embedding;
  if (!Array.isArray(input) || input.length === 0 || input.length > 65_536) return null;
  const vector = input.map((item) => Number(item));
  if (vector.some((item) => !Number.isFinite(item))) return null;
  const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + (item * item), 0));
  return magnitude > 0 ? vector.map((item) => item / magnitude) : null;
}

/**
 * Minimal OpenAI-compatible embeddings client. The endpoint is operator-owned
 * server configuration, never request data. Authorization is optional so a
 * loopback embedding service can be used without inventing a credential.
 */
export class OpenAiCompatibleEmbeddingProvider {
  constructor({ url = "", model = "", apiKey = "", fetchImpl, timeoutMs = DEFAULT_EMBEDDING_TIMEOUT_MS } = {}) {
    this.url = String(url || "").trim();
    this.model = String(model || "").trim();
    this.apiKey = String(apiKey || "");
    this.fetchImpl = fetchImpl || globalThis.fetch;
    this.timeoutMs = Math.max(250, Math.min(30_000, Math.floor(Number(timeoutMs) || DEFAULT_EMBEDDING_TIMEOUT_MS)));
    this.id = `openai-compatible:${sha256Hex(`${this.url}\u0000${this.model}`)}`;
  }

  get enabled() {
    try {
      const endpoint = new URL(this.url);
      return ["http:", "https:"].includes(endpoint.protocol)
        && Boolean(this.model)
        && typeof this.fetchImpl === "function";
    } catch {
      return false;
    }
  }

  async embed(input) {
    if (!this.enabled) throw new Error("embedding provider is not configured");
    const headers = { "content-type": "application/json" };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: this.model, input: String(input || "") }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`embedding provider HTTP ${response.status}`);
    const payload = await response.json();
    const vector = normalizeEmbedding(payload?.data?.[0]?.embedding);
    if (!vector) throw new Error("embedding provider returned an invalid vector");
    return vector;
  }
}

export function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  for (let index = 0; index < left.length; index += 1) dot += Number(left[index] || 0) * Number(right[index] || 0);
  return Math.max(-1, Math.min(1, dot));
}

class UpstashRedisRestStore {
  constructor({ url = "", token = "", source = "", fetchImpl } = {}) {
    this.url = String(url || "").replace(/\/+$/, "");
    this.token = String(token || "");
    this.source = String(source || "");
    this.fetchImpl = fetchImpl || globalThis.fetch;
  }

  get enabled() {
    return /^https:\/\//.test(this.url) && Boolean(this.token) && typeof this.fetchImpl === "function";
  }

  async command(args) {
    if (!this.enabled) return null;
    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify(args.map((value) => String(value))),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`Redis REST HTTP ${response.status}`);
    const payload = await response.json();
    return payload?.result ?? null;
  }

  async get(key) {
    const raw = await this.command(["GET", key]);
    if (typeof raw !== "string") return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  async candidates(bucketKey, limit) {
    const keys = await this.command(["LRANGE", bucketKey, 0, Math.max(0, limit - 1)]);
    if (!Array.isArray(keys) || keys.length === 0) return [];
    const values = await this.command(["MGET", ...keys]);
    return (Array.isArray(values) ? values : []).flatMap((raw) => {
      if (typeof raw !== "string") return [];
      try { return [JSON.parse(raw)]; } catch { return []; }
    });
  }

  async put(key, bucketKey, entry, ttlSeconds, candidateLimit) {
    const serialized = JSON.stringify(entry);
    await this.command(["SETEX", key, ttlSeconds, serialized]);
    if (entry?.semanticVectorKind !== "embedding" || !Array.isArray(entry?.semanticVector)) return;
    await this.command(["LPUSH", bucketKey, key]);
    await this.command(["LTRIM", bucketKey, 0, Math.max(0, candidateLimit - 1)]);
    await this.command(["EXPIRE", bucketKey, ttlSeconds]);
  }

  async setJson(key, value, ttlSeconds) {
    await this.command(["SETEX", key, ttlSeconds, JSON.stringify(value)]);
  }

  async incr(key) {
    const value = await this.command(["INCR", key]);
    return Number(value) || 0;
  }

  async numbers(keys) {
    if (!Array.isArray(keys) || keys.length === 0) return [];
    const values = await this.command(["MGET", ...keys]);
    return (Array.isArray(values) ? values : []).map((value) => Number(value) || 0);
  }

  async pushJsonBounded(listKey, value, limit, ttlSeconds) {
    await this.command(["LPUSH", listKey, JSON.stringify(value)]);
    await this.command(["LTRIM", listKey, 0, Math.max(0, limit - 1)]);
    await this.command(["EXPIRE", listKey, ttlSeconds]);
  }

  async listJson(listKey, limit) {
    const raw = await this.command(["LRANGE", listKey, 0, Math.max(0, limit - 1)]);
    return (Array.isArray(raw) ? raw : []).flatMap((item) => {
      if (typeof item !== "string") return [];
      try { return [JSON.parse(item)]; } catch { return []; }
    });
  }
}

export class InferenceSemanticCache {
  // Injected providers must expose a stable `id`/`providerId`; that identity
  // prevents vectors from different models sharing a Redis candidate bucket.
  constructor({
    maxEntries = DEFAULT_MAX_ENTRIES,
    candidateLimit = DEFAULT_CANDIDATES,
    redisUrl = "",
    redisToken = "",
    redisSource = "",
    remoteDisabledReason = "",
    fetchImpl,
    embeddingProvider = null,
    now = () => Date.now(),
    signingKey = null,
    cacheVersion = "",
    poisonRadius = DEFAULT_POISON_RADIUS,
    maxInvalidationsPerMinute = 60,
  } = {}) {
    this.maxEntries = Math.max(1, Math.min(4096, Math.floor(Number(maxEntries) || DEFAULT_MAX_ENTRIES)));
    this.candidateLimit = Math.max(1, Math.min(128, Math.floor(Number(candidateLimit) || DEFAULT_CANDIDATES)));
    this.entries = new Map();
    this.now = now;
    this.remote = new UpstashRedisRestStore({ url: redisUrl, token: redisToken, source: redisSource, fetchImpl });
    this.remoteDisabledReason = String(remoteDisabledReason || "");
    this.embeddingProvider = embeddingProvider;
    this.embeddingProviderId = String(embeddingProvider?.id || embeddingProvider?.providerId || "").trim();
    // Cross-process Redis reuse requires a shared key: derive it (and the
    // cache version) from the credential binding when Redis is configured,
    // so every process holding the same rotated pair verifies the same
    // signatures — and a rotation strands old envelopes safely.
    const instanceCredentials = redisUrl && redisToken
      ? { source: redisSource, url: redisUrl, token: redisToken }
      : null;
    this.signingKey = signingKey || resolveCacheSigningKey({ credentials: instanceCredentials });
    this.cacheVersion = String(cacheVersion || deriveCacheVersion({ credentials: instanceCredentials }));
    this.poisonRadius = Math.max(0.5, Math.min(0.9999, Number(poisonRadius) || DEFAULT_POISON_RADIUS));
    /** exact-key tombstones: cacheKey -> { poisonedBy, reason, expiresAtMs } */
    this.poisonedKeys = new Map();
    /** semantic poison markers: bucket -> [{ centroid, radius, poisonedBy, reason, expiresAtMs }] */
    this.poisonMarkers = new Map();
    /** invalidation epochs: "model:<sha>"|"schema:<hash>"|"workflow:<id>" -> integer */
    this.epochs = new Map();
    /**
     * Invalidation flood guard: one bounded per-minute window PER REASON.
     * Reasons never share a budget, so a runaway FEEDBACK_CORRECTION loop can
     * exhaust its own lane while SECURITY invalidations keep landing — the
     * guard can never delay incident response. (The window is per process;
     * shared-Redis deployments rate-limit each process independently.)
     */
    this.maxInvalidationsPerMinute = Math.max(1, Math.min(10_000, Math.floor(Number(maxInvalidationsPerMinute) || 60)));
    this.invalidationWindows = new Map();
  }

  consumeInvalidationBudget(reason) {
    const nowMs = this.now();
    const lane = String(reason || "SECURITY");
    const window = this.invalidationWindows.get(lane) || { startMs: 0, count: 0 };
    if (nowMs - window.startMs >= 60_000) {
      window.startMs = nowMs;
      window.count = 0;
    }
    if (window.count >= this.maxInvalidationsPerMinute) {
      this.invalidationWindows.set(lane, window);
      return false;
    }
    window.count += 1;
    this.invalidationWindows.set(lane, window);
    return true;
  }

  signEntry(entry) {
    const canonical = stableStringify({
      cacheKey: entry.cacheKey,
      bucket: entry.bucket,
      response: entry.response,
      envelope: entry.envelope,
      expiresAtMs: entry.expiresAtMs,
    });
    return createHmac("sha256", this.signingKey.key).update(canonical).digest("hex");
  }

  epochScopes(envelope) {
    const scopes = [];
    if (envelope?.model_sha256) scopes.push(`model:${envelope.model_sha256}`);
    if (envelope?.schema_hash) scopes.push(`schema:${envelope.schema_hash}`);
    if (envelope?.workflow_id) scopes.push(`workflow:${envelope.workflow_id}`);
    return scopes;
  }

  async currentEpochs(scopes) {
    const current = {};
    for (const scope of scopes) current[scope] = Number(this.epochs.get(scope)) || 0;
    if (this.remote.enabled && scopes.length) {
      try {
        const remoteValues = await this.remote.numbers(scopes.map((scope) => `growthub:inference:epoch:${scope}`));
        scopes.forEach((scope, index) => {
          const remoteValue = Number(remoteValues[index]) || 0;
          if (remoteValue > current[scope]) current[scope] = remoteValue;
          if (remoteValue > (Number(this.epochs.get(scope)) || 0)) this.epochs.set(scope, remoteValue);
        });
      } catch { /* local epochs remain authoritative for this process */ }
    }
    return current;
  }

  /**
   * Envelope integrity for one stored entry. Any failure is a MISS — a
   * tampered, foreign-keyed, version-rotated, or epoch-invalidated entry is
   * never served.
   */
  async verifyEntryIntegrity(entry) {
    if (!entry?.envelope || !entry?.signature) return { ok: false, state: "unsigned", reason: "cache entry has no signed envelope" };
    if (String(entry.envelope.cache_version || "") !== this.cacheVersion) {
      return { ok: false, state: "invalid", reason: "cache_version mismatch; credentials or namespace rotated since this entry was written" };
    }
    if (entry.signature !== this.signEntry(entry)) {
      return { ok: false, state: "invalid", reason: "cache envelope signature verification failed" };
    }
    const scopes = this.epochScopes(entry.envelope);
    const current = await this.currentEpochs(scopes);
    const stored = entry.envelope.epochs && typeof entry.envelope.epochs === "object" ? entry.envelope.epochs : {};
    for (const scope of scopes) {
      if ((Number(current[scope]) || 0) > (Number(stored[scope]) || 0)) {
        return { ok: false, state: "invalidated", reason: `cache entry invalidated by governed ${scope.split(":")[0]} epoch bump` };
      }
    }
    return { ok: true, state: "verified", reason: "" };
  }

  async exactPoisonState(cacheKey) {
    const nowMs = this.now();
    const local = this.poisonedKeys.get(cacheKey);
    if (local && Number(local.expiresAtMs) > nowMs) return { poisoned: true, poisonedBy: local.poisonedBy, reason: local.reason };
    if (this.remote.enabled) {
      try {
        const remoteTombstone = await this.remote.get(`growthub:inference:poisoned:${cacheKey}`);
        if (remoteTombstone?.state === "POISONED") {
          this.poisonedKeys.set(cacheKey, {
            poisonedBy: String(remoteTombstone.poisonedBy || ""),
            reason: String(remoteTombstone.reason || ""),
            expiresAtMs: nowMs + (DEFAULT_POISON_TTL_SECONDS * 1000),
          });
          return { poisoned: true, poisonedBy: String(remoteTombstone.poisonedBy || ""), reason: String(remoteTombstone.reason || "") };
        }
      } catch { /* local tombstones remain usable */ }
    }
    return { poisoned: false };
  }

  async bucketPoisonMarkers(bucket) {
    const nowMs = this.now();
    const local = (this.poisonMarkers.get(bucket) || []).filter((marker) => Number(marker.expiresAtMs) > nowMs);
    this.poisonMarkers.set(bucket, local);
    if (!this.remote.enabled) return local;
    try {
      const remoteMarkers = await this.remote.listJson(`growthub:inference:poison:${bucket}`, MAX_POISON_MARKERS);
      const seen = new Set(local.map((marker) => marker.markerId));
      for (const marker of remoteMarkers) {
        if (!marker || !Array.isArray(marker.centroid) || Number(marker.expiresAtMs) <= nowMs) continue;
        if (seen.has(marker.markerId)) continue;
        local.push(marker);
        seen.add(marker.markerId);
      }
      this.poisonMarkers.set(bucket, local.slice(0, MAX_POISON_MARKERS));
    } catch { /* local markers remain usable */ }
    return this.poisonMarkers.get(bucket) || [];
  }

  get semanticEnabled() {
    if (!this.embeddingProviderId) return false;
    if (typeof this.embeddingProvider === "function") return true;
    if (!this.embeddingProvider || typeof this.embeddingProvider.embed !== "function") return false;
    return this.embeddingProvider.enabled !== false;
  }

  describeBackend() {
    return {
      kind: this.remote.enabled ? "upstash-redis-rest" : "memory",
      remoteEnabled: this.remote.enabled,
      credentialSource: this.remote.source || "",
      disabledReason: this.remote.enabled ? "" : this.remoteDisabledReason,
      cacheVersion: this.cacheVersion,
      signingKeyId: this.signingKey.keyId,
      signingKeySource: this.signingKey.source,
    };
  }

  async embed(value) {
    if (!this.semanticEnabled) return { ok: false, reason: "embedding_provider_not_configured", vector: null };
    try {
      const raw = typeof this.embeddingProvider === "function"
        ? await this.embeddingProvider(String(value || ""))
        : await this.embeddingProvider.embed(String(value || ""));
      const vector = normalizeEmbedding(raw);
      return vector
        ? { ok: true, reason: "", vector }
        : { ok: false, reason: "embedding_provider_invalid_response", vector: null };
    } catch {
      return { ok: false, reason: "embedding_provider_failed", vector: null };
    }
  }

  prune() {
    const nowMs = this.now();
    for (const [key, entry] of this.entries) {
      if (Number(entry?.expiresAtMs) <= nowMs) this.entries.delete(key);
    }
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
  }

  remember(entry) {
    if (!entry?.cacheKey) return;
    this.entries.delete(entry.cacheKey);
    this.entries.set(entry.cacheKey, entry);
    this.prune();
  }

  async lookup({
    cacheKey,
    scopeKey,
    prefixHash,
    semanticText = "",
    semantic = false,
    threshold = DEFAULT_SEMANTIC_THRESHOLD,
  } = {}) {
    this.prune();
    const wantedKey = String(cacheKey || "");
    const nowMs = this.now();
    const bucket = `${String(scopeKey || "")}:${String(prefixHash || "")}`;
    const poisonState = await this.exactPoisonState(wantedKey);
    if (poisonState.poisoned) {
      return {
        hit: false,
        hitType: "",
        similarity: 0,
        entry: null,
        poisoned: true,
        poisonedBy: poisonState.poisonedBy || "",
        bypassReason: CACHE_BYPASS_POISONED,
      };
    }
    let integrity = "";
    let integrityReason = "";
    let exact = this.entries.get(wantedKey) || null;
    let exactSource = exact ? "memory" : "";
    if (!exact && this.remote.enabled) {
      try {
        exact = await this.remote.get(`growthub:inference:entry:${wantedKey}`);
        if (exact) {
          exactSource = "remote";
          this.remember(exact);
        }
      } catch { exact = null; }
    }
    if (exact && Number(exact.expiresAtMs) > nowMs) {
      const verdict = await this.verifyEntryIntegrity(exact);
      if (verdict.ok) {
        return {
          hit: true,
          hitType: "exact",
          similarity: 1,
          entry: clone(exact),
          cacheSource: exactSource || "memory",
          envelope: clone(exact.envelope) || null,
          signatureState: "verified",
        };
      }
      // Tampered, rotated, or invalidated evidence is deleted, never served.
      this.entries.delete(wantedKey);
      integrity = verdict.state;
      integrityReason = verdict.reason;
    }
    const missBase = {
      hit: false,
      hitType: "",
      similarity: 0,
      entry: null,
      ...(integrity ? { integrity, integrityReason } : {}),
    };
    if (!semantic || !semanticText) return missBase;
    if (!this.semanticEnabled) {
      return { ...missBase, semanticUnavailable: true, semanticReason: "embedding_provider_not_configured" };
    }

    const eligible = (entry) => (
      entry.bucket === bucket
      && Number(entry.expiresAtMs) > nowMs
      && entry.semanticVectorKind === "embedding"
      && entry.embeddingProviderId === this.embeddingProviderId
      && Array.isArray(entry.semanticVector)
    );
    let candidates = [...this.entries.values()].filter(eligible);
    const remoteCandidateKeys = new Set();
    if (this.remote.enabled && candidates.length < this.candidateLimit) {
      try {
        const remoteEntries = await this.remote.candidates(`growthub:inference:bucket:${bucket}`, this.candidateLimit);
        for (const entry of remoteEntries) {
          if (entry && Number(entry.expiresAtMs) > nowMs) {
            remoteCandidateKeys.add(String(entry.cacheKey || ""));
            this.remember(entry);
          }
        }
        candidates = [...this.entries.values()].filter(eligible);
      } catch { /* local candidates remain usable */ }
    }
    const markers = await this.bucketPoisonMarkers(bucket);
    if (candidates.length === 0 && markers.length === 0) return missBase;

    const embedded = await this.embed(semanticText);
    if (!embedded.ok) {
      return { ...missBase, semanticUnavailable: true, semanticReason: embedded.reason };
    }
    const vector = embedded.vector;
    // A feedback correction marks the neighborhood of the corrected truth as
    // UNRELIABLE for this model/schema bucket. Semantically similar queries
    // bypass the cache entirely instead of replaying a possible hallucination.
    for (const marker of markers) {
      if (marker.embeddingProviderId && marker.embeddingProviderId !== this.embeddingProviderId) continue;
      const proximity = cosineSimilarity(vector, marker.centroid);
      if (proximity >= Number(marker.radius ?? this.poisonRadius)) {
        return {
          hit: false,
          hitType: "",
          similarity: proximity,
          entry: null,
          poisoned: true,
          poisonedBy: String(marker.poisonedBy || ""),
          bypassReason: CACHE_BYPASS_POISONED,
        };
      }
    }
    const floor = Math.max(0.9, Math.min(0.9999, Number(threshold) || DEFAULT_SEMANTIC_THRESHOLD));
    let best = null;
    let bestScore = floor;
    for (const candidate of candidates.slice(-this.candidateLimit)) {
      const score = cosineSimilarity(vector, candidate.semanticVector);
      if (score >= bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best) return missBase;
    const bestPoison = await this.exactPoisonState(String(best.cacheKey || ""));
    if (bestPoison.poisoned) {
      return {
        hit: false,
        hitType: "",
        similarity: bestScore,
        entry: null,
        poisoned: true,
        poisonedBy: bestPoison.poisonedBy || "",
        bypassReason: CACHE_BYPASS_POISONED,
      };
    }
    const verdict = await this.verifyEntryIntegrity(best);
    if (!verdict.ok) {
      this.entries.delete(String(best.cacheKey || ""));
      return { ...missBase, integrity: verdict.state, integrityReason: verdict.reason };
    }
    return {
      hit: true,
      hitType: "semantic",
      similarity: bestScore,
      entry: clone(best),
      cacheSource: remoteCandidateKeys.has(String(best.cacheKey || "")) ? "remote" : "memory",
      envelope: clone(best.envelope) || null,
      signatureState: "verified",
    };
  }

  async store({
    cacheKey,
    scopeKey,
    prefixHash,
    semanticText = "",
    semantic = false,
    response,
    ttlSeconds = 0,
    metadata = {},
    envelope = {},
  } = {}) {
    const requestedTtl = Math.floor(Number(ttlSeconds) || 0);
    if (!cacheKey || !scopeKey || requestedTtl <= 0) return { stored: false };
    const ttl = Math.max(1, Math.min(86_400, requestedTtl));
    const bucket = `${String(scopeKey)}:${String(prefixHash || "")}`;
    const embedded = semantic && semanticText ? await this.embed(semanticText) : { ok: false, vector: null };
    const envelopeInput = envelope && typeof envelope === "object" ? envelope : {};
    const scopes = this.epochScopes(envelopeInput);
    const createdAtMs = this.now();
    const sealedEnvelope = {
      receipt_id: String(envelopeInput.receipt_id || ""),
      request_sha256: String(envelopeInput.request_sha256 || ""),
      model_sha256: String(envelopeInput.model_sha256 || ""),
      adapter_sha256: String(envelopeInput.adapter_sha256 || ""),
      schema_hash: String(envelopeInput.schema_hash || ""),
      workflow_version: String(envelopeInput.workflow_version || ""),
      ...(envelopeInput.workflow_id ? { workflow_id: String(envelopeInput.workflow_id) } : {}),
      cache_version: this.cacheVersion,
      redacted: envelopeInput.redacted === true,
      redaction_event_count: Math.max(0, Math.floor(Number(envelopeInput.redaction_event_count) || 0)),
      epochs: await this.currentEpochs(scopes),
      created_at: new Date(createdAtMs).toISOString(),
      ttl_seconds: ttl,
    };
    const entry = {
      cacheKey: String(cacheKey),
      bucket,
      ...(embedded.ok ? {
        semanticVectorKind: "embedding",
        embeddingProviderId: this.embeddingProviderId,
        semanticVector: embedded.vector,
      } : {}),
      response: clone(response),
      metadata: clone(metadata),
      envelope: sealedEnvelope,
      keyId: this.signingKey.keyId,
      storedAtMs: createdAtMs,
      expiresAtMs: createdAtMs + (ttl * 1000),
    };
    entry.signature = this.signEntry(entry);
    this.remember(entry);
    let remote = "disabled";
    if (this.remote.enabled) {
      try {
        await this.remote.put(
          `growthub:inference:entry:${entry.cacheKey}`,
          `growthub:inference:bucket:${bucket}`,
          entry,
          ttl,
          this.candidateLimit,
        );
        remote = "stored";
      } catch { remote = "failed"; }
    }
    return { stored: true, remote, signatureState: "signed", cacheVersion: this.cacheVersion };
  }

  /**
   * Governed invalidation. Exact keys become POISONED tombstones (soft
   * delete with provenance); model/schema/workflow scopes bump an epoch so
   * every previously written envelope in that scope fails closed; a feedback
   * correction with corrected ground truth additionally marks the semantic
   * neighborhood UNRELIABLE for the entry's bucket.
   */
  async invalidate({
    reason = "SECURITY",
    scope = {},
    correctionReceiptId = "",
    correctedText = "",
    bucket = "",
    radius,
    ttlSeconds = DEFAULT_POISON_TTL_SECONDS,
  } = {}) {
    const normalizedReason = ["MODEL_UPDATE", "SCHEMA_CHANGE", "FEEDBACK_CORRECTION", "SECURITY"].includes(String(reason))
      ? String(reason)
      : "SECURITY";
    // Flood guard: a runaway or hostile invalidation loop cannot stampede the
    // cache. Rejected calls mutate nothing and report the limit explicitly.
    // Budgets are per reason, so no reason can starve another.
    if (!this.consumeInvalidationBudget(normalizedReason)) {
      return {
        ok: false,
        reason: normalizedReason,
        rateLimited: true,
        error: `invalidation rate limit exceeded (${this.maxInvalidationsPerMinute}/minute)`,
        poisonedExactKeys: [],
        poisonMarkersAdded: 0,
        epochsBumped: [],
      };
    }
    const nowMs = this.now();
    const ttl = Math.max(60, Math.min(7 * 86_400, Math.floor(Number(ttlSeconds) || DEFAULT_POISON_TTL_SECONDS)));
    const poisonedExactKeys = [];
    const epochsBumped = [];
    let poisonMarkersAdded = 0;

    const exactKey = String(scope.exact_key || scope.exactKey || "").trim();
    if (exactKey) {
      const tombstone = {
        state: "POISONED",
        poisonedBy: String(correctionReceiptId || ""),
        reason: normalizedReason,
        expiresAtMs: nowMs + (ttl * 1000),
      };
      this.poisonedKeys.set(exactKey, tombstone);
      this.entries.delete(exactKey);
      poisonedExactKeys.push(exactKey);
      if (this.remote.enabled) {
        try { await this.remote.setJson(`growthub:inference:poisoned:${exactKey}`, tombstone, ttl); } catch { /* local tombstone holds */ }
      }
    }

    for (const [field, prefix] of [["model_sha256", "model"], ["schema_hash", "schema"], ["workflow_id", "workflow"]]) {
      const value = String(scope[field] || "").trim();
      if (!value) continue;
      const epochScope = `${prefix}:${value}`;
      this.epochs.set(epochScope, (Number(this.epochs.get(epochScope)) || 0) + 1);
      if (this.remote.enabled) {
        try {
          const remoteEpoch = await this.remote.incr(`growthub:inference:epoch:${epochScope}`);
          if (remoteEpoch > (Number(this.epochs.get(epochScope)) || 0)) this.epochs.set(epochScope, remoteEpoch);
        } catch { /* local epoch holds for this process */ }
      }
      epochsBumped.push(epochScope);
    }

    const markerBucket = String(bucket || scope.semantic_cluster_id || scope.semanticClusterId || "").trim();
    if (markerBucket && String(correctedText || "") && this.semanticEnabled) {
      const embedded = await this.embed(String(correctedText));
      if (embedded.ok) {
        const marker = {
          markerId: sha256Hex(`${markerBucket}:${correctionReceiptId}:${nowMs}`),
          bucket: markerBucket,
          centroid: embedded.vector,
          radius: Math.max(0.5, Math.min(0.9999, Number(radius) || this.poisonRadius)),
          embeddingProviderId: this.embeddingProviderId,
          poisonedBy: String(correctionReceiptId || ""),
          reason: normalizedReason,
          createdAtMs: nowMs,
          expiresAtMs: nowMs + (ttl * 1000),
        };
        const markers = this.poisonMarkers.get(markerBucket) || [];
        markers.push(marker);
        this.poisonMarkers.set(markerBucket, markers.slice(-MAX_POISON_MARKERS));
        poisonMarkersAdded += 1;
        if (this.remote.enabled) {
          try { await this.remote.pushJsonBounded(`growthub:inference:poison:${markerBucket}`, marker, MAX_POISON_MARKERS, ttl); } catch { /* local marker holds */ }
        }
      }
    }

    return { ok: true, reason: normalizedReason, poisonedExactKeys, poisonMarkersAdded, epochsBumped };
  }
}

/**
 * Feedback-driven poisoning, closing the correction loop from a persisted
 * receipt. The original receipt supplies the exact cache key and scope; the
 * correction receipt id is stamped as `poisoned_by` on the tombstone and any
 * semantic marker, so the correction links back to the poisoned entry.
 */
export async function poisonCacheFromFeedback(cache, {
  originalReceipt = null,
  correctionReceiptId = "",
  correctedText = "",
  reason = "FEEDBACK_CORRECTION",
  receiptResolver = null,
} = {}) {
  // Trust boundary: the receipt must be resolved server-side, never taken
  // from a caller's body. When a resolver is supplied (any HTTP-facing
  // caller MUST supply one), the receipt is re-read from the persisted
  // stream by id and the caller-shaped object is discarded.
  let receipt = originalReceipt;
  if (typeof receiptResolver === "function") {
    receipt = await receiptResolver(String(originalReceipt?.receipt_id || ""));
  }
  if (!receipt || receipt.kind !== "growthub-inference-verification-receipt-v1") {
    return { ok: false, reason: "feedback poisoning requires a server-resolved growthub inference verification receipt", poisonedExactKeys: [], poisonMarkersAdded: 0, epochsBumped: [] };
  }
  const cacheEvidence = receipt.cache || {};
  const exactKey = String(cacheEvidence.cache_key || "").trim();
  if (!exactKey) {
    return { ok: false, reason: "original receipt has no cache key; nothing to poison", poisonedExactKeys: [], poisonMarkersAdded: 0, epochsBumped: [] };
  }
  // Semantic markers live in the same identity-scoped bucket the entry was
  // written to. The bucket is a pair of scope hashes; anything else (an
  // injected free-form bucket string) is rejected rather than poisoned.
  const bucket = String(cacheEvidence.semantic_bucket || "");
  const bucketValid = /^[0-9a-f]{64}:[0-9a-f]{64}$/.test(bucket);
  return cache.invalidate({
    reason,
    scope: { exact_key: exactKey },
    correctionReceiptId,
    correctedText,
    bucket: bucketValid ? bucket : "",
  });
}

const GLOBAL_CACHE = Symbol.for("growthub.inference.semantic-cache.v1");

export function getInferenceSemanticCache({ env = process.env, fetchImpl, embeddingProvider } = {}) {
  const credentials = resolveInferenceRedisCredentials(env);
  // Shared Redis reuse needs an operator-owned deployment namespace. A
  // repeatable workspace slug is not a tenant/principal boundary across
  // exported forks, so fail back to the bounded local cache without it.
  const sharedNamespace = String(env?.GROWTHUB_INFERENCE_CACHE_NAMESPACE || "").trim();
  const hasRedisCredentials = Boolean(credentials.url && credentials.token);
  const sharedCacheAllowed = hasRedisCredentials && Boolean(sharedNamespace);
  const configuredEmbeddingProvider = embeddingProvider || new OpenAiCompatibleEmbeddingProvider({
    url: env?.GROWTHUB_INFERENCE_EMBEDDINGS_URL || "",
    model: env?.GROWTHUB_INFERENCE_EMBEDDINGS_MODEL || "",
    apiKey: env?.GROWTHUB_INFERENCE_EMBEDDINGS_API_KEY || "",
    fetchImpl,
  });
  const configurationKey = sha256Hex(JSON.stringify({
    redisSource: credentials.source,
    redisUrl: credentials.url,
    redisTokenSha256: credentials.token ? sha256Hex(credentials.token) : "",
    sharedNamespace,
    embeddingProviderId: String(configuredEmbeddingProvider?.id || configuredEmbeddingProvider?.providerId || ""),
  }));
  const current = globalThis[GLOBAL_CACHE];
  if (!current || current.configurationKey !== configurationKey) {
    globalThis[GLOBAL_CACHE] = {
      configurationKey,
      cache: new InferenceSemanticCache({
        redisUrl: sharedCacheAllowed ? credentials.url : "",
        redisToken: sharedCacheAllowed ? credentials.token : "",
        redisSource: sharedCacheAllowed ? credentials.source : "",
        remoteDisabledReason: hasRedisCredentials && !sharedNamespace
          ? "GROWTHUB_INFERENCE_CACHE_NAMESPACE is required"
          : credentials.incomplete.length ? "Redis REST credentials are incomplete" : "Redis REST is not configured",
        fetchImpl,
        embeddingProvider: configuredEmbeddingProvider,
        signingKey: resolveCacheSigningKey({
          env,
          credentials: sharedCacheAllowed ? credentials : null,
          namespace: sharedNamespace,
        }),
        cacheVersion: deriveCacheVersion({
          credentials: sharedCacheAllowed ? credentials : null,
          namespace: sharedNamespace,
        }),
      }),
    };
  }
  return globalThis[GLOBAL_CACHE].cache;
}
