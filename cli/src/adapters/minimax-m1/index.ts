import type { CLIAdapterModule } from "@paperclipai/adapter-utils";
import { printMiniMaxM1StreamEvent } from "./format-event.js";

export const miniMaxM1LocalCLIAdapter: CLIAdapterModule = {
  type: "minimax_m1_local",
  formatStdoutEvent: printMiniMaxM1StreamEvent,
};
