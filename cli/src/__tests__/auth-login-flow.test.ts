import { describe, expect, it } from "vitest";
import { startLoginFlow } from "../auth/login-flow.js";

describe("cli login flow", () => {
  it("binds a local loopback callback server and builds a hosted login URL", async () => {
    const flow = await startLoginFlow({
      hostedBaseUrl: "https://growthub.example",
      machineLabel: "unit-test",
      timeoutMs: 30_000,
    });

    try {
      const callback = new URL(flow.callbackUrl);
      expect(callback.hostname).toBe("127.0.0.1");
      expect(Number(callback.port)).toBeGreaterThan(0);
      expect(callback.pathname).toBe("/cli-callback");

      const login = new URL(flow.loginUrl);
      expect(login.origin).toBe("https://growthub.example");
      expect(login.pathname).toBe("/cli/login");
      expect(login.searchParams.get("state")).toBe(flow.state);
      expect(login.searchParams.get("callback")).toBe(flow.callbackUrl);
      expect(login.searchParams.get("source")).toBe("cli");
      expect(login.searchParams.get("machineLabel")).toBe("unit-test");
    } finally {
      flow.close();
    }
  });

  it("completes when the browser posts back with a valid state + token", async () => {
    const flow = await startLoginFlow({
      hostedBaseUrl: "https://growthub.example",
      machineLabel: "unit-test",
      timeoutMs: 30_000,
    });

    const callbackUrl = new URL(flow.callbackUrl);
    callbackUrl.searchParams.set("state", flow.state);
    callbackUrl.searchParams.set("token", "tok_xyz");
    callbackUrl.searchParams.set("userId", "u-1");
    callbackUrl.searchParams.set("email", "a@b.co");

    const waitPromise = flow.waitForCallback();
    const response = await fetch(callbackUrl.toString());
    expect(response.ok).toBe(true);

    const result = await waitPromise;
    expect(result.token).toBe("tok_xyz");
    expect(result.userId).toBe("u-1");
    expect(result.email).toBe("a@b.co");
    expect(result.hostedBaseUrl).toBe("https://growthub.example");
  });

  it("rejects when state does not match", async () => {
    const flow = await startLoginFlow({
      hostedBaseUrl: "https://growthub.example",
      machineLabel: "unit-test",
      timeoutMs: 30_000,
    });

    const callbackUrl = new URL(flow.callbackUrl);
    callbackUrl.searchParams.set("state", "wrong-state");
    callbackUrl.searchParams.set("token", "tok_xyz");

    const waitPromise = flow.waitForCallback();
    const rejection = expect(waitPromise).rejects.toThrow(/state mismatch/);
    await fetch(callbackUrl.toString());
    await rejection;
  });
});
