import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetGrowthubConnectionSessionsForTests,
  consumeGrowthubConnectionSession,
  issueGrowthubConnectionSession,
} from "../services/growthub-connection-session.js";

describe("growthub connection session", () => {
  beforeEach(() => {
    __resetGrowthubConnectionSessionsForTests();
  });

  it("issues a state token and consumes it once", () => {
    const issued = issueGrowthubConnectionSession("user-123");
    expect(issued.state).toBeTruthy();

    const consumed = consumeGrowthubConnectionSession(issued.state);
    expect(consumed?.userId).toBe("user-123");

    const secondConsume = consumeGrowthubConnectionSession(issued.state);
    expect(secondConsume).toBeNull();
  });

  it("rejects blank users", () => {
    expect(() => issueGrowthubConnectionSession(" ")).toThrowError("userId is required");
  });
});
