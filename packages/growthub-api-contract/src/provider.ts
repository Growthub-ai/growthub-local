/**
 * Growthub API v1 — Provider Adapter Contract
 *
 * Declarative provider contract consumed by kit factories, the hosted
 * scorer, and third-party adapter authors. A provider is described by
 * the operations it implements, not by per-provider client code.
 */

export type ProviderOperation =
  | "UPLOAD_ASSET"
  | "SUBMIT_GENERATION"
  | "POLL_RESULT"
  | "NORMALIZE_RESULT"
  | "LIST_MODEL_CAPABILITIES"
  | "CANCEL_JOB"
  | "LIST_HISTORY"
  | "HEALTHCHECK";

export const REQUIRED_PROVIDER_OPERATIONS: readonly ProviderOperation[] = [
  "UPLOAD_ASSET",
  "SUBMIT_GENERATION",
  "POLL_RESULT",
  "NORMALIZE_RESULT",
  "LIST_MODEL_CAPABILITIES",
] as const;

export const OPTIONAL_PROVIDER_OPERATIONS: readonly ProviderOperation[] = [
  "CANCEL_JOB",
  "LIST_HISTORY",
  "HEALTHCHECK",
] as const;

export type ProviderAuthMechanism =
  | "api-key-header"
  | "bearer-token"
  | "oauth"
  | "custom";

export interface ProviderOperationContract {
  providerId: string;
  providerName: string;
  operations: ProviderOperation[];
  referenceDocPath: string;
  authMechanism: ProviderAuthMechanism;
  authField: string;
  baseUrl: string;
}
