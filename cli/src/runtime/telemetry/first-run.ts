/**
 * First-run marker for the `cli_first_run` acquisition event.
 *
 * We emit this exactly once per machine (per PAPERCLIP_HOME). The
 * marker file lives next to the anon identity and contains only the
 * CLI version and timestamp — no user-identifying data.
 */

import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../../config/home.js";
import { captureEvent } from "./capture.js";

function resolveFirstRunMarkerPath(): string {
  return path.resolve(resolvePaperclipHomeDir(), "telemetry", "first-run.json");
}

/**
 * If no first-run marker exists yet, write one and emit the
 * `cli_first_run` event. Safe to call from any CLI entrypoint — it's
 * a no-op on every subsequent run.
 */
export async function maybeEmitCliFirstRun(surface: string): Promise<void> {
  const filePath = resolveFirstRunMarkerPath();
  if (fs.existsSync(filePath)) return;

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      `${JSON.stringify({ firstRunAt: new Date().toISOString() }, null, 2)}\n`,
      { mode: 0o600 },
    );
  } catch {
    // If we can't persist the marker we skip the event rather than
    // risk emitting it on every subsequent run.
    return;
  }

  await captureEvent({
    event: "cli_first_run",
    properties: { surface, funnel_stage: "acquisition" },
  });
}
