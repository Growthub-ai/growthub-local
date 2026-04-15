import type { CLIAdapterModule } from "@paperclipai/adapter-utils";
import { printOpenAgentsStreamEvent } from "./format-event.js";

export const openAgentsCLIAdapter: CLIAdapterModule = {
  type: "open_agents",
  formatStdoutEvent: printOpenAgentsStreamEvent,
};
