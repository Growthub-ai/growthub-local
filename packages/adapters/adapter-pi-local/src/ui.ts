/**
 * @paperclipai/adapter-pi-local/ui — stub for open-source development.
 */
import type { TranscriptEntry, CreateConfigValues } from "@paperclipai/adapter-utils";

export function parsePiStdoutLine(line: string): TranscriptEntry | null {
  return null;
}

export function buildPiLocalConfig(_values: CreateConfigValues): Record<string, unknown> {
  return {};
}
