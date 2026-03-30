import { describe, expect, it } from "vitest";
import {
  formatTicketBootstrapIssueDescription,
  resolveTicketStageState,
} from "../services/tickets.js";

describe("ticket stage contracts", () => {
  it("builds stage state from structured definitions", () => {
    const stageState = resolveTicketStageState({
      stageDefinitions: [
        { key: "plan", label: "Plan" },
        { key: "launch", label: "Launch" },
      ],
      currentStage: "launch",
    });

    expect(stageState.stageOrder).toEqual(["plan", "launch"]);
    expect(stageState.currentStage).toBe("launch");
  });

  it("falls back to the first stage when current stage is invalid", () => {
    const stageState = resolveTicketStageState({
      stageOrder: ["planning", "qa"],
      currentStage: "missing",
    });

    expect(stageState.currentStage).toBe("planning");
  });

  it("includes stage and handoff context in bootstrap descriptions", () => {
    const description = formatTicketBootstrapIssueDescription({
      title: "Ticket",
      description: "Campaign summary",
      metadata: null,
      instructions: "Ticket instructions",
      stageDefinition: {
        key: "qa",
        label: "QA",
        ownerRole: "qa",
        handoffMode: "context_only",
        instructions: "Review the campaign output.",
        exitCriteria: "Every blocking defect is closed.",
      },
      previousStageDefinition: {
        key: "execution",
        label: "Execution",
      },
      previousIssue: {
        identifier: "PAP-42",
        title: "Ship campaign assets",
        status: "done",
      },
    });

    expect(description).toContain("## Stage Context");
    expect(description).toContain("owner role: qa");
    expect(description).toContain("## Handoff Context");
    expect(description).toContain("PAP-42");
  });
});
