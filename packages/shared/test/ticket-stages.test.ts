import { describe, expect, it } from "vitest";
import { createTicketSchema } from "../src/validators/ticket.js";
import {
  buildTicketStageOrder,
  createGtmStagePreset,
  normalizeTicketStageDefinitions,
  resolveTicketCurrentStage,
} from "../src/ticket-stages.js";

describe("ticket stage contracts", () => {
  it("normalizes legacy stage order into structured definitions", () => {
    const stageDefinitions = normalizeTicketStageDefinitions({
      stageOrder: ["planning", "custom_stage"],
    });

    expect(buildTicketStageOrder(stageDefinitions)).toEqual(["planning", "custom_stage"]);
    expect(stageDefinitions[0]?.label).toBe("Planning");
    expect(stageDefinitions[1]?.label).toBe("Custom Stage");
  });

  it("prefers structured stage definitions when both shapes are present", () => {
    const parsed = createTicketSchema.parse({
      title: "Campaign",
      stageOrder: ["legacy_only"],
      stageDefinitions: [
        { key: "planning", label: "Planning" },
        { key: "launch", label: "Launch" },
      ],
    });

    const stageDefinitions = normalizeTicketStageDefinitions({
      stageDefinitions: parsed.stageDefinitions,
      stageOrder: parsed.stageOrder,
    });

    expect(buildTicketStageOrder(stageDefinitions)).toEqual(["planning", "launch"]);
  });

  it("rejects duplicate stage keys after normalization", () => {
    expect(() =>
      createTicketSchema.parse({
        title: "Campaign",
        stageDefinitions: [
          { key: "QA Review", label: "QA Review" },
          { key: "qa_review", label: "Second QA Review" },
        ],
      }),
    ).toThrow(/unique/i);
  });

  it("resolves current stage safely from structured definitions", () => {
    const preset = createGtmStagePreset();
    expect(resolveTicketCurrentStage("qa", preset)).toBe("qa");
    expect(resolveTicketCurrentStage("missing", preset)).toBe("planning");
  });
});
