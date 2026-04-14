/**
 * Machine-Scoped Capability Resolver — Type Definitions
 *
 * Resolves which nodes/capabilities the current machine + user + org are
 * actually allowed to use. Sits on top of:
 *   - CLI auth session
 *   - hosted profile
 *   - machine connection metadata
 *   - capability metadata
 *   - user/org entitlements
 */

// ---------------------------------------------------------------------------
// Resolved capability binding
// ---------------------------------------------------------------------------

export interface ResolvedCapabilityBinding {
  /** CMS capability slug. */
  capabilitySlug: string;
  /** Whether the user/machine is allowed to execute this capability. */
  allowed: boolean;
  /** Capabilities required by the machine connection to execute. */
  requiredConnectionCapabilities: string[];
  /** Machine connection ID (from hosted profile/overlay), if bound. */
  machineConnectionId?: string;
  /** Human-readable reason for allowed/denied status. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Machine context
// ---------------------------------------------------------------------------

export interface MachineContext {
  /** Hostname of the current machine. */
  hostname: string;
  /** Machine label from auth session or config. */
  machineLabel?: string;
  /** Workspace label from config. */
  workspaceLabel?: string;
  /** Local Paperclip instance ID. */
  instanceId: string;
  /** Whether the machine has an active hosted session. */
  hasActiveSession: boolean;
}

// ---------------------------------------------------------------------------
// Resolution result
// ---------------------------------------------------------------------------

export interface CapabilityResolutionResult {
  /** All resolved bindings. */
  bindings: ResolvedCapabilityBinding[];
  /** Machine context used during resolution. */
  machineContext: MachineContext;
  /** User entitlements from the hosted profile overlay. */
  entitlements: string[];
  /** ISO timestamp when resolution was performed. */
  resolvedAt: string;
}
