/**
 * @paperclipai/adapter-claude-local/ui — stub for open-source development.
 */
import type { TranscriptEntry, CreateConfigValues } from "@paperclipai/adapter-utils";

export function parseClaudeStdoutLine(line: string): TranscriptEntry | null {
  return null;
}

export function buildClaudeLocalConfig(_values: CreateConfigValues): Record<string, unknown> {
  return {};
}
