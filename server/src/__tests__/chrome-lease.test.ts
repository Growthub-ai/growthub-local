import { afterEach, describe, expect, it } from "vitest";
import {
  acquireChromeLease,
  forceReleaseChromeLeases,
  isChromeLeasedByRun,
  listActiveChromeLeases,
  normalizeChromeSlotId,
  releaseChromeLease,
} from "../services/chrome-lease.js";

afterEach(() => {
  forceReleaseChromeLeases("test_cleanup");
});

describe("chrome lease slots", () => {
  it("allows concurrent leases for different slots", () => {
    const first = acquireChromeLease("agent-1", "run-1", { slotId: "browser-a" });
    const second = acquireChromeLease("agent-2", "run-2", { slotId: "browser-b" });

    expect(first.acquired).toBe(true);
    expect(second.acquired).toBe(true);
    expect(listActiveChromeLeases().map((lease) => lease.slotId)).toEqual(["browser-a", "browser-b"]);
  });

  it("blocks another run from taking the same slot", () => {
    const first = acquireChromeLease("agent-1", "run-1", { slotId: "browser-a" });
    const second = acquireChromeLease("agent-2", "run-2", { slotId: "browser-a" });

    expect(first.acquired).toBe(true);
    expect(second).toEqual({
      acquired: false,
      slotId: "browser-a",
      heldBy: { agentId: "agent-1", runId: "run-1" },
      estimatedAvailableAt: (first.acquired ? first.lease.expiresAt : null),
    });
  });

  it("releases only the requested slot when force-clearing by slot id", () => {
    acquireChromeLease("agent-1", "run-1", { slotId: "browser-a" });
    acquireChromeLease("agent-2", "run-2", { slotId: "browser-b" });

    const released = forceReleaseChromeLeases("slot_clear", "browser-a");

    expect(released).toHaveLength(1);
    expect(released[0]?.slotId).toBe("browser-a");
    expect(listActiveChromeLeases().map((lease) => lease.slotId)).toEqual(["browser-b"]);
  });

  it("releases a lease by run id without requiring the caller to pass the slot", () => {
    acquireChromeLease("agent-1", "run-1", { slotId: "browser-a" });

    expect(isChromeLeasedByRun("run-1")).toBe(true);
    releaseChromeLease("run-1");
    expect(isChromeLeasedByRun("run-1")).toBe(false);
  });

  it("normalizes blank slot ids to the default slot", () => {
    expect(normalizeChromeSlotId("")).toBe("default");
    expect(normalizeChromeSlotId("   ")).toBe("default");
  });
});
