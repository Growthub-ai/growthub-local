/**
 * @paperclipai/adapter-codex-local — stub for open-source development.
 */
import type { AdapterModel } from "@paperclipai/adapter-utils";

export const agentConfigurationDoc = "Codex local adapter configuration stub.";

export const models: AdapterModel[] = [
  { id: "codex-default", label: "Codex Default" },
];

export const DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX = false;

export const DEFAULT_CODEX_LOCAL_MODEL = "codex-default";
