/**
 * Agent-native scheduler input profile.
 *
 * This is a thin configuration adapter over the existing authenticated
 * API-request input method. Codex owns cadence; Growthub owns the governed
 * workflow binding and durable proof. Future adapters remain non-executable
 * until they pass the same native-heartbeat acceptance contract.
 */

const AGENT_NATIVE_SCHEDULER_PROFILE = "agent-native-scheduler";
const AGENT_NATIVE_CANONICAL_INPUT_MODE = "api-request";
const AGENT_NATIVE_SCHEDULER_OWNER = "agent-native";

const AGENT_NATIVE_SCHEDULER_ADAPTERS = Object.freeze([
  { value: "codex-task", label: "Codex scheduled task", enabled: true, status: "validated" },
  { value: "claude-code-cloud", label: "Claude Code cloud schedule — coming soon", enabled: false, status: "coming-soon" },
  { value: "gemini-agent", label: "Gemini agent schedule — coming soon", enabled: false, status: "coming-soon" },
]);

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function isAgentNativeSchedulerConfig(config) {
  return clean(config?.inputMode) === AGENT_NATIVE_CANONICAL_INPUT_MODE
    && clean(config?.inputProfile) === AGENT_NATIVE_SCHEDULER_PROFILE
    && clean(config?.schedulerOwner) === AGENT_NATIVE_SCHEDULER_OWNER;
}

function inputModeSelectionValue(config) {
  return isAgentNativeSchedulerConfig(config)
    ? AGENT_NATIVE_SCHEDULER_PROFILE
    : clean(config?.inputMode) || "manual";
}

function inputModePatchForSelection(selection, currentConfig = {}) {
  const value = clean(selection);
  if (value === AGENT_NATIVE_SCHEDULER_PROFILE) {
    const enabledAdapters = new Set(AGENT_NATIVE_SCHEDULER_ADAPTERS.filter((item) => item.enabled).map((item) => item.value));
    const existingAdapter = clean(currentConfig.agentSchedulerAdapter);
    return {
      inputMode: AGENT_NATIVE_CANONICAL_INPUT_MODE,
      inputProfile: AGENT_NATIVE_SCHEDULER_PROFILE,
      schedulerOwner: AGENT_NATIVE_SCHEDULER_OWNER,
      agentSchedulerAdapter: enabledAdapters.has(existingAdapter) ? existingAdapter : "codex-task",
    };
  }
  return {
    inputMode: value || "manual",
    inputProfile: undefined,
    schedulerOwner: undefined,
    agentSchedulerAdapter: undefined,
    agentSchedulerTaskRef: undefined,
    agentSchedulerTimezone: undefined,
  };
}

function makeAgentNativeSchedulerMethod(apiMethod) {
  if (!apiMethod) return null;
  return {
    ...apiMethod,
    inputMode: AGENT_NATIVE_SCHEDULER_PROFILE,
    canonicalInputMode: AGENT_NATIVE_CANONICAL_INPUT_MODE,
    invocationProfile: AGENT_NATIVE_SCHEDULER_PROFILE,
    schedulerOwner: AGENT_NATIVE_SCHEDULER_OWNER,
    label: "Agent Native Scheduler",
    adapters: AGENT_NATIVE_SCHEDULER_ADAPTERS.map((item) => ({ ...item })),
  };
}

export {
  AGENT_NATIVE_CANONICAL_INPUT_MODE,
  AGENT_NATIVE_SCHEDULER_ADAPTERS,
  AGENT_NATIVE_SCHEDULER_OWNER,
  AGENT_NATIVE_SCHEDULER_PROFILE,
  inputModePatchForSelection,
  inputModeSelectionValue,
  isAgentNativeSchedulerConfig,
  makeAgentNativeSchedulerMethod,
};
