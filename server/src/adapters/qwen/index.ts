import type { ServerAdapterModule } from "../types.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export const qwenLocalAdapter: ServerAdapterModule = {
  type: "qwen_local",
  execute,
  testEnvironment,
  models: [
    { id: "qwen3-coder", label: "Qwen 3 Coder" },
    { id: "qwen3.6-plus", label: "Qwen 3.6 Plus" },
    { id: "qwen-turbo", label: "Qwen Turbo" },
  ],
  supportsLocalAgentJwt: false,
  agentConfigurationDoc: `# Qwen Code agent configuration

Adapter: qwen_local

Qwen Code is an open-source terminal AI coding agent.
https://github.com/QwenLM/qwen-code

Core fields:
- prompt (string, required): the prompt or task description
- model (string, optional): model id (default: qwen3-coder)
- cwd (string, optional): working directory for the session
- approvalMode (string, optional): "default" | "auto-edit" | "yolo"

Operational fields:
- binaryPath (string, optional): path to qwen binary (default: "qwen")
- timeoutSec (number, optional): run timeout in seconds (default: 120)
- graceSec (number, optional): SIGTERM grace period in seconds (default: 15)
- env (object, optional): KEY=VALUE environment variables

Environment:
- DASHSCOPE_API_KEY: Qwen/DashScope API key
- OPENAI_API_KEY: OpenAI-compatible provider key
- ANTHROPIC_API_KEY: Anthropic provider key

Install:
  npm install -g @qwen-code/qwen-code@latest
`,
};
