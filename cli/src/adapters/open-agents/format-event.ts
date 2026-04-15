import pc from "picocolors";

const EVENT_PREFIXES: Record<string, string> = {
  sandbox_create: pc.cyan("sandbox"),
  sandbox_resume: pc.cyan("sandbox"),
  sandbox_hibernate: pc.cyan("sandbox"),
  tool_start: pc.yellow("tool"),
  tool_result: pc.yellow("tool"),
  file_edit: pc.green("file"),
  file_create: pc.green("file"),
  shell_exec: pc.magenta("shell"),
  search: pc.blue("search"),
  git_commit: pc.green("git"),
  git_push: pc.green("git"),
  git_pr: pc.green("git"),
  agent_message: pc.white("agent"),
  agent_thinking: pc.dim("think"),
  task_delegate: pc.yellow("delegate"),
  workflow_step: pc.blue("workflow"),
  error: pc.red("error"),
};

export function printOpenAgentsStreamEvent(raw: string, _debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  // Try to parse as JSON event from the open-agents backend
  try {
    const event = JSON.parse(line) as { type?: string; detail?: string; timestamp?: string };
    if (event.type && event.detail) {
      const prefix = EVENT_PREFIXES[event.type] ?? pc.dim(event.type);
      console.log(`  ${prefix}  ${event.detail}`);
      return;
    }
  } catch {
    // Not JSON — print as plain text
  }

  console.log(line);
}
