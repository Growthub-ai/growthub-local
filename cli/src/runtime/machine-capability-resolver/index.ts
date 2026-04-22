/**
 * Machine-Scoped Capability Resolver
 *
 * Resolves which nodes/capabilities the current machine + user + org are
 * actually allowed to use.
 *
 * This sits on top of:
 *   - CLI auth session (auth/session-store)
 *   - Hosted profile overlay (auth/overlay-store)
 *   - Effective profile (auth/effective-profile)
 *   - CMS capability registry
 *
 * Resolution logic:
 *   1. Load the effective profile (session + overlay + local workspace)
 *   2. For each capability in the registry, check:
 *      a. Is the user authenticated?
 *      b. Does the overlay entitlement set include the required bindings?
 *      c. Is the machine connection compatible?
 *   3. Return a binding record per capability (allowed/denied + reason)
 */

import os from "node:os";
import {
  computeEffectiveProfile,
  type EffectiveProfile,
} from "../../auth/effective-profile.js";
import {
  createCmsCapabilityRegistryClient,
  type CmsCapabilityNode,
} from "../cms-capability-registry/index.js";
import type {
  ResolvedCapabilityBinding,
  MachineContext,
  CapabilityResolutionResult,
} from "./types.js";

export type {
  ResolvedCapabilityBinding,
  MachineContext,
  CapabilityResolutionResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Machine context builder
// ---------------------------------------------------------------------------

function buildMachineContext(profile: EffectiveProfile): MachineContext {
  return {
    hostname: os.hostname(),
    machineLabel: profile.local.machineLabel ?? undefined,
    workspaceLabel: profile.local.workspaceLabel ?? undefined,
    instanceId: profile.local.instanceId,
    hasActiveSession: profile.authenticated,
  };
}

// ---------------------------------------------------------------------------
// Binding resolution
// ---------------------------------------------------------------------------

function resolveBinding(
  capability: CmsCapabilityNode,
  profile: EffectiveProfile,
): ResolvedCapabilityBinding {
  const binding: ResolvedCapabilityBinding = {
    capabilitySlug: capability.slug,
    allowed: false,
    requiredConnectionCapabilities: capability.requiredBindings,
    strategy: capability.executionBinding.strategy,
    outputTypes: capability.outputTypes,
    family: capability.family,
  };

  // Gate 1: authentication
  if (!profile.authenticated) {
    binding.reason = "No active hosted session. Run `growthub auth login`.";
    return binding;
  }

  // Gate 2: capability enabled
  if (!capability.enabled) {
    binding.reason = `Capability "${capability.slug}" is disabled for this user/org.`;
    return binding;
  }

  // Gate 3: execution kind compatibility
  if (capability.executionKind === "local-only") {
    binding.allowed = true;
    binding.reason = "Local-only execution — no hosted connection required.";
    return binding;
  }

  // Gate 4: entitlement check
  const entitlements = new Set(profile.hosted.entitlements);
  const missingEntitlements: string[] = [];

  for (const req of capability.requiredBindings) {
    const hasEntitlement =
      entitlements.has(req) ||
      entitlements.has(`capability:${capability.slug}`) ||
      entitlements.has("capability:*");

    if (!hasEntitlement) {
      missingEntitlements.push(req);
    }
  }

  // Gate 5: execution mode compatibility
  if (capability.executionKind === "hosted-execute") {
    const canUseHosted =
      profile.executionDefaults.preferredMode !== "local" ||
      profile.executionDefaults.allowBrowserBridge;

    if (!canUseHosted && missingEntitlements.length > 0) {
      const strategyNote = capability.executionBinding.strategy === "async_operation"
        ? " (async polling required)"
        : "";
      binding.reason =
        `Hosted execution required but execution defaults prefer local${strategyNote}. ` +
        `Missing bindings: ${missingEntitlements.join(", ")}.`;
      return binding;
    }
  }

  // If entitlements are empty (common for new deployments), allow with warning
  if (profile.hosted.entitlements.length === 0) {
    binding.allowed = true;
    binding.machineConnectionId = profile.local.instanceId;
    const outputNote = capability.outputTypes.length > 0
      ? ` Produces: ${capability.outputTypes.join(", ")}.`
      : "";
    binding.reason = `No entitlement restrictions configured — allowed by default.${outputNote}`;
    return binding;
  }

  if (missingEntitlements.length > 0) {
    const strategyNote = capability.executionBinding.strategy !== "direct"
      ? ` [strategy: ${capability.executionBinding.strategy}]`
      : "";
    binding.reason =
      `Missing entitlements for required bindings: ${missingEntitlements.join(", ")}${strategyNote}.`;
    return binding;
  }

  binding.allowed = true;
  binding.machineConnectionId = profile.local.instanceId;
  const outputNote = capability.outputTypes.length > 0
    ? ` Produces: ${capability.outputTypes.join(", ")}.`
    : "";
  binding.reason = `All binding requirements satisfied.${outputNote}`;
  return binding;
}

// ---------------------------------------------------------------------------
// Resolver client
// ---------------------------------------------------------------------------

export interface MachineCapabilityResolver {
  /** Resolve all capabilities against current machine/user context. */
  resolveAll(): Promise<CapabilityResolutionResult>;
  /** Resolve a single capability by slug. */
  resolveCapability(slug: string): Promise<ResolvedCapabilityBinding | null>;
  /** Get the current machine context (no network, reads local state only). */
  getMachineContext(): MachineContext;
}

export function createMachineCapabilityResolver(): MachineCapabilityResolver {
  return {
    async resolveAll() {
      const profile = computeEffectiveProfile();
      const machineContext = buildMachineContext(profile);
      const registry = createCmsCapabilityRegistryClient();
      const { nodes, meta } = await registry.listCapabilities({ enabledOnly: false });

      const bindings = nodes.map((capability) => resolveBinding(capability, profile));

      return {
        bindings,
        machineContext,
        entitlements: profile.hosted.entitlements,
        resolvedAt: new Date().toISOString(),
        registryMeta: {
          source: meta.source,
          fromCache: meta.fromCache,
          staleFallback: meta.staleFallback,
          fetchedAt: meta.fetchedAt,
          cacheAgeSeconds: meta.cacheAgeSeconds,
        },
      };
    },

    async resolveCapability(slug) {
      const profile = computeEffectiveProfile();
      const registry = createCmsCapabilityRegistryClient();
      const capability = await registry.getCapability(slug);

      if (!capability) return null;
      return resolveBinding(capability, profile);
    },

    getMachineContext() {
      const profile = computeEffectiveProfile();
      return buildMachineContext(profile);
    },
  };
}
