/**
 * MiniMax-M1 Adapter — stdout event formatter
 *
 * Formats raw stdout lines from a MiniMax-M1 headless run for display in the
 * Growthub CLI heartbeat stream. The reference runtime is vLLM with
 * OpenAI-compatible JSON; we also tolerate plain-text lines from ad-hoc
 * wrappers.
 */
export function printMiniMaxM1StreamEvent(raw: string, _debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  try {
    const parsed = JSON.parse(line) as {
      type?: string;
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
      content?: string;
      text?: string;
    };

    if (Array.isArray(parsed.choices) && parsed.choices.length > 0) {
      const first = parsed.choices[0];
      const delta = first?.delta?.content;
      const message = first?.message?.content;
      if (typeof delta === "string" && delta.length > 0) {
        process.stdout.write(delta);
        return;
      }
      if (typeof message === "string" && message.length > 0) {
        console.log(message);
        return;
      }
    }

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
