import { readAdapterConfig } from "../env";
import { describePostgresAdapter } from "./postgres";
import { describeProviderManagedAdapter } from "./provider-managed";
import { describeQstashKvAdapter } from "./qstash-kv";

export type PersistenceAdapterDescriptor = {
  id: string;
  label: string;
  requiredEnv: string[];
  mode: "sql" | "kv" | "external";
  notes: string[];
};

export function describePersistenceAdapter(): PersistenceAdapterDescriptor {
  const config = readAdapterConfig();
  if (config.dataAdapter === "postgres") return describePostgresAdapter();
  if (config.dataAdapter === "qstash-kv") return describeQstashKvAdapter();
  return describeProviderManagedAdapter();
}
