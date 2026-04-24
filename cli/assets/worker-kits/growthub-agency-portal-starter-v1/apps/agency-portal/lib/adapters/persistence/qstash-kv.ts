import type { PersistenceAdapterDescriptor } from "./index";

export function describeQstashKvAdapter(): PersistenceAdapterDescriptor {
  return {
    id: "qstash-kv",
    label: "Qstash KV",
    requiredEnv: ["QSTASH_KV_REST_URL", "QSTASH_KV_REST_TOKEN"],
    mode: "kv",
    notes: [
      "Use HTTP-first KV for serverless-friendly deployments.",
      "Model relational portal records as namespaced documents and secondary indexes.",
      "Keep queue and storage concerns separated from the domain capability map.",
    ],
  };
}
