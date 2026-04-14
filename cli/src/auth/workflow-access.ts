import { computeEffectiveProfile } from "./effective-profile.js";

export type WorkflowAccessState = "unauthenticated" | "unlinked" | "ready";

export interface WorkflowAccess {
  state: WorkflowAccessState;
  reason: string;
}

export function getWorkflowAccess(): WorkflowAccess {
  const profile = computeEffectiveProfile();

  if (!profile.authenticated) {
    return {
      state: "unauthenticated",
      reason: "Requires growthub auth login",
    };
  }

  if (!profile.hosted.present || !profile.hosted.linkedInstanceId) {
    return {
      state: "unlinked",
      reason: "Requires Growthub Local Machine connection",
    };
  }

  if (profile.hosted.linkedInstanceId !== profile.local.instanceId) {
    return {
      state: "unlinked",
      reason: `Linked to ${profile.hosted.linkedInstanceId}, not this workspace`,
    };
  }

  return {
    state: "ready",
    reason: "Workflow tools unlocked",
  };
}
