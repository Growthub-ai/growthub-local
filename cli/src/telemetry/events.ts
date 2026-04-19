/**
 * Canonical event taxonomy for the Growthub CLI.
 *
 * Every PostHog event flowing out of the CLI goes through one of these
 * names. Centralising the list keeps dashboards stable across refactors
 * and makes it cheap to audit what is reported.
 *
 * The six axes we watch:
 *   - cli.*           CLI lifecycle — start, command dispatch, error
 *   - discovery.*     Which surface a human chose from the hub
 *   - auth.*          Hosted account bridge events
 *   - kit.*           Worker-kit browse/download/fork activity
 *   - capability.*    Capability enum usage — the signal we need to pick
 *                     the anchor SKU (which axis do paying users exercise
 *                     most).
 *   - envelope.*      Capability envelope issuance + exercise
 *   - workflow.*      Saved / executed hosted workflows
 *   - kit_fork.*      Fork-sync agent activity
 *   - intelligence.*  Local-intelligence (Ollama adapter) usage
 */

export const CliEvents = {
  // CLI lifecycle
  CliStart: "cli.start",
  CliCommandInvoked: "cli.command.invoked",
  CliCommandError: "cli.command.error",
  CliExit: "cli.exit",

  // Discovery hub
  DiscoveryOpened: "discovery.opened",
  DiscoverySurfaceSelected: "discovery.surface.selected",
  DiscoveryAgentHarnessSelected: "discovery.agent_harness.selected",
  DiscoverySettingsSelected: "discovery.settings.selected",

  // Auth / hosted account bridge
  AuthLoginStarted: "auth.login.started",
  AuthLoginSucceeded: "auth.login.succeeded",
  AuthLoginFailed: "auth.login.failed",
  AuthLogout: "auth.logout",
  AuthWhoami: "auth.whoami",
  AuthHostedBridgeOpened: "auth.hosted_bridge.opened",

  // Worker kits
  KitBrowsed: "kit.browsed",
  KitInspected: "kit.inspected",
  KitDownloaded: "kit.downloaded",
  KitValidated: "kit.validated",

  // Capability enum — the axis we need to rank by usage
  CapabilityBrowsed: "capability.browsed",
  CapabilityInspected: "capability.inspected",
  CapabilityExercised: "capability.exercised",
  CapabilityResolved: "capability.resolved",

  // Capability envelopes (internal enterprise issuance)
  EnvelopeGranted: "envelope.granted",
  EnvelopeRevoked: "envelope.revoked",
  EnvelopeExercised: "envelope.exercised",
  EnvelopeInspected: "envelope.inspected",

  // Workflows
  WorkflowBrowsed: "workflow.browsed",
  WorkflowExecuted: "workflow.executed",
  PipelineAssembled: "pipeline.assembled",
  PipelineExecuted: "pipeline.executed",

  // Fork sync agent
  KitForkRegistered: "kit_fork.registered",
  KitForkStatusChecked: "kit_fork.status.checked",
  KitForkHealed: "kit_fork.healed",

  // Local intelligence
  IntelligencePromptRun: "intelligence.prompt.run",
  IntelligenceFlowRun: "intelligence.flow.run",
} as const;

export type CliEventName = typeof CliEvents[keyof typeof CliEvents];

/**
 * Known shape hints for the properties we attach to events. Kept loose so
 * individual call sites can extend safely without plumbing new interfaces
 * through the whole telemetry layer.
 */
export interface EventProperties {
  [key: string]: unknown;
}
