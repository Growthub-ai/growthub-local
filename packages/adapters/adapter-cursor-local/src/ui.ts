/**
 * @paperclipai/adapter-cursor-local/ui — stub for open-source development.
 */
import type { TranscriptEntry, CreateConfigValues } from "@paperclipai/adapter-utils";

export function parseCursorStdoutLine(line: string): TranscriptEntry | null {
  return null;
}

export function buildCursorLocalConfig(_values: CreateConfigValues): Record<string, unknown> {
  return {};
}
