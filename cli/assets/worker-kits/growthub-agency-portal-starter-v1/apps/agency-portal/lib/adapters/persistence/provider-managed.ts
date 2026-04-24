import type { PersistenceAdapterDescriptor } from "./index";

export function describeProviderManagedAdapter(): PersistenceAdapterDescriptor {
  return {
    id: "provider-managed",
    label: "Provider Managed",
    requiredEnv: [],
    mode: "external",
    notes: [
      "Use when a deployment provider owns persistence.",
      "Document provider-specific environment variables in the fork journal.",
      "Do not promote provider-specific names into the worker-kit manifest.",
    ],
  };
}
