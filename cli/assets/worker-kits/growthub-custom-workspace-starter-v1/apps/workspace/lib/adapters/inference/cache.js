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

import { createHash } from "node:crypto";

const DEFAULT_MAX_ENTRIES = 256;
const DEFAULT_CANDIDATES = 32;
const DEFAULT_SEMANTIC_THRESHOLD = 0.965;
const DEFAULT_EMBEDDING_TIMEOUT_MS = 5_000;

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
  } = {}) {
    this.maxEntries = Math.max(1, Math.min(4096, Math.floor(Number(maxEntries) || DEFAULT_MAX_ENTRIES)));
    this.candidateLimit = Math.max(1, Math.min(128, Math.floor(Number(candidateLimit) || DEFAULT_CANDIDATES)));
    this.entries = new Map();
    this.now = now;
    this.remote = new UpstashRedisRestStore({ url: redisUrl, token: redisToken, source: redisSource, fetchImpl });
    this.remoteDisabledReason = String(remoteDisabledReason || "");
    this.embeddingProvider = embeddingProvider;
    this.embeddingProviderId = String(embeddingProvider?.id || embeddingProvider?.providerId || "").trim();
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
      return { hit: true, hitType: "exact", similarity: 1, entry: clone(exact), cacheSource: exactSource || "memory" };
    }
    if (!semantic || !semanticText) return { hit: false, hitType: "", similarity: 0, entry: null };
    if (!this.semanticEnabled) {
      return {
        hit: false,
        hitType: "",
        similarity: 0,
        entry: null,
        semanticUnavailable: true,
        semanticReason: "embedding_provider_not_configured",
      };
    }

    const bucket = `${String(scopeKey || "")}:${String(prefixHash || "")}`;
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

    if (candidates.length === 0) return { hit: false, hitType: "", similarity: 0, entry: null };

    const embedded = await this.embed(semanticText);
    if (!embedded.ok) {
      return {
        hit: false,
        hitType: "",
        similarity: 0,
        entry: null,
        semanticUnavailable: true,
        semanticReason: embedded.reason,
      };
    }
    const vector = embedded.vector;
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
    return best
      ? {
          hit: true,
          hitType: "semantic",
          similarity: bestScore,
          entry: clone(best),
          cacheSource: remoteCandidateKeys.has(String(best.cacheKey || "")) ? "remote" : "memory",
        }
      : { hit: false, hitType: "", similarity: 0, entry: null };
  }

  async store({ cacheKey, scopeKey, prefixHash, semanticText = "", semantic = false, response, ttlSeconds = 0, metadata = {} } = {}) {
    const requestedTtl = Math.floor(Number(ttlSeconds) || 0);
    if (!cacheKey || !scopeKey || requestedTtl <= 0) return { stored: false };
    const ttl = Math.max(1, Math.min(86_400, requestedTtl));
    const bucket = `${String(scopeKey)}:${String(prefixHash || "")}`;
    const embedded = semantic && semanticText ? await this.embed(semanticText) : { ok: false, vector: null };
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
      storedAtMs: this.now(),
      expiresAtMs: this.now() + (ttl * 1000),
    };
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
    return { stored: true, remote };
  }
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
      }),
    };
  }
  return globalThis[GLOBAL_CACHE].cache;
}
