import type { CLIAdapterModule } from "@paperclipai/adapter-utils";
import { printQwenStreamEvent } from "./format-event.js";

export const qwenLocalCLIAdapter: CLIAdapterModule = {
  type: "qwen_local",
  formatStdoutEvent: printQwenStreamEvent,
};
