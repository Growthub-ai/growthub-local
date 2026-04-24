import type { PersistenceAdapterDescriptor } from "./index";

export function describePostgresAdapter(): PersistenceAdapterDescriptor {
  return {
    id: "postgres",
    label: "Postgres",
    requiredEnv: ["DATABASE_URL"],
    mode: "sql",
    notes: [
      "Use any Postgres-compatible provider.",
      "Keep provider-specific pooling, SSL, and migration tooling outside the kit contract.",
      "Application repositories should depend on this descriptor, not a provider SDK directly.",
    ],
  };
}
