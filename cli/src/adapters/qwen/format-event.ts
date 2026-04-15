/**
 * Qwen Code CLI Adapter — stdout event formatter
 *
 * Formats raw stdout lines from the Qwen Code headless process
 * for display in the Growthub CLI heartbeat stream.
 */
export function printQwenStreamEvent(raw: string, _debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  // Attempt to parse as JSON (Qwen Code can emit JSON events in headless mode)
  try {
    const parsed = JSON.parse(line) as { type?: string; content?: string; text?: string };
    if (parsed.type === "result" && typeof parsed.text === "string") {
      console.log(parsed.text);
      return;
    }
    if (parsed.type === "assistant" && typeof parsed.content === "string") {
      process.stdout.write(parsed.content);
      return;
    }
  } catch {
    // Not JSON — print as plain text
  }

  console.log(line);
}
