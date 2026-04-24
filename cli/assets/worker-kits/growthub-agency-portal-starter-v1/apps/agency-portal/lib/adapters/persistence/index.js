import { readAdapterConfig } from "../env";
import { describePostgresAdapter } from "./postgres";
import { describeProviderManagedAdapter } from "./provider-managed";
import { describeQstashKvAdapter } from "./qstash-kv";
function describePersistenceAdapter() {
  const config = readAdapterConfig();
  if (config.dataAdapter === "postgres") return describePostgresAdapter();
  if (config.dataAdapter === "qstash-kv") return describeQstashKvAdapter();
  return describeProviderManagedAdapter();
}
export {
  describePersistenceAdapter
};
