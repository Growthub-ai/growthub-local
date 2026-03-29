/**
 * Plugin secrets host-side handler — resolves secret references through the
 * Paperclip secret provider system.
 *
 * When a plugin worker calls `ctx.secrets.resolve(secretRef)`, the JSON-RPC
 * request arrives at the host with `{ secretRef }`. This module provides the
 * concrete `HostServices.secrets` adapter that:
 *
 * 1. Parses the `secretRef` string to identify the secret.
 * 2. Looks up the secret record and its latest version in the database.
 * 3. Delegates to the configured `SecretProviderModule` to decrypt /
 *    resolve the raw value.
 * 4. Returns the resolved plaintext value to the worker.
 *
 * ## Secret Reference Format
 *
 * A `secretRef` is a **secret UUID** — the primary key (`id`) of a row in
 * the `company_secrets` table. Operators place these UUIDs into plugin
 * config values; plugin workers resolve them at execution time via
 * `ctx.secrets.resolve(secretId)`.
 *
 * ## Security Invariants
 *
 * - Resolved values are **never** logged, persisted, or included in error
 *   messages (per PLUGIN_SPEC.md §22).
 * - The handler is capability-gated: only plugins with `secrets.read-ref`
 *   declared in their manifest may call it (enforced by `host-client-factory`).
 * - The host handler itself does not cache resolved values. Each call goes
 *   through the secret provider to honour rotation.
 *
 * @see PLUGIN_SPEC.md §22 — Secrets
 * @see host-client-factory.ts — capability gating
 * @see services/secrets.ts — secretService used by agent env bindings
 */
import type { Db } from "@paperclipai/db";
/**
 * Extract secret reference UUIDs from a plugin's configJson, scoped to only
 * the fields annotated with `format: "secret-ref"` in the schema.
 *
 * When no schema is provided, falls back to collecting all UUID-shaped strings
 * (backwards-compatible for plugins without a declared instanceConfigSchema).
 */
export declare function extractSecretRefsFromConfig(configJson: unknown, schema?: Record<string, unknown> | null): Set<string>;
/**
 * Input shape for the `secrets.resolve` handler.
 *
 * Matches `WorkerToHostMethods["secrets.resolve"][0]` from `protocol.ts`.
 */
export interface PluginSecretsResolveParams {
    /** The secret reference string (a secret UUID). */
    secretRef: string;
}
/**
 * Options for creating the plugin secrets handler.
 */
export interface PluginSecretsHandlerOptions {
    /** Database connection. */
    db: Db;
    /**
     * The plugin ID using this handler.
     * Used for logging context only; never included in error payloads
     * that reach the plugin worker.
     */
    pluginId: string;
}
/**
 * The `HostServices.secrets` adapter for the plugin host-client factory.
 */
export interface PluginSecretsService {
    /**
     * Resolve a secret reference to its current plaintext value.
     *
     * @param params - Contains the `secretRef` (UUID of the secret)
     * @returns The resolved secret value
     * @throws {Error} If the secret is not found, has no versions, or
     *   the provider fails to resolve
     */
    resolve(params: PluginSecretsResolveParams): Promise<string>;
}
export declare function createPluginSecretsHandler(options: PluginSecretsHandlerOptions): PluginSecretsService;
//# sourceMappingURL=plugin-secrets-handler.d.ts.map