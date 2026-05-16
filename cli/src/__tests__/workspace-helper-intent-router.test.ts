/**
 * L3 heuristic intent router — regex-based, deterministic.
 *
 * Confirms the router maps free-form prompts to the right of the 7 supported
 * helper intents without invoking the model. This is what runs server-side
 * when the user types a prompt without picking a pill (NLU path).
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error — JS module under apps/workspace; resolved via Node ESM
import { inferIntentFromPrompt, VALID_INTENT_VALUES } from "../../assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-helper.js";

describe("inferIntentFromPrompt", () => {
  it("returns the seven canonical intents", () => {
    expect(VALID_INTENT_VALUES).toEqual([
      "build_dashboard",
      "create_widget",
      "register_api",
      "create_object",
      "edit_view",
      "repair",
      "explain",
    ]);
  });

  it("routes dashboard-shaped prompts to build_dashboard", () => {
    const { intent, confidence } = inferIntentFromPrompt(
      "Build me a sales ops dashboard with pipeline stages and weekly revenue",
      "create_object",
    );
    expect(intent).toBe("build_dashboard");
    expect(confidence).toBeGreaterThanOrEqual(2);
  });

  it("routes API/webhook prompts to register_api", () => {
    const { intent } = inferIntentFromPrompt(
      "Register a webhook integration with bearer token auth",
      "create_object",
    );
    expect(intent).toBe("register_api");
  });

  it("routes repair-shaped prompts to repair", () => {
    const { intent } = inferIntentFromPrompt(
      "Fix the broken bindings in this workspace and find any orphaned references",
      "create_object",
    );
    expect(intent).toBe("repair");
  });

  it("routes explain-shaped prompts to explain", () => {
    const { intent } = inferIntentFromPrompt(
      "Explain what the Sandbox Environment object does in this workspace",
      "create_object",
    );
    expect(intent).toBe("explain");
  });

  it("routes edit-shaped prompts to edit_view", () => {
    const { intent } = inferIntentFromPrompt(
      "Rearrange the dashboard layout and rename the second tab",
      "create_object",
    );
    expect(intent).toBe("edit_view");
  });

  it("routes object-shaped prompts to create_object", () => {
    const { intent } = inferIntentFromPrompt(
      "Create a custom object for tracking client engagements",
      "explain",
    );
    expect(intent).toBe("create_object");
  });

  it("falls back to caller's intent when nothing matches", () => {
    const { intent, confidence } = inferIntentFromPrompt(
      "Hello",
      "build_dashboard",
    );
    expect(intent).toBe("build_dashboard");
    expect(confidence).toBe(0);
  });

  it("preserves a deliberate non-default intent even when the prompt is ambiguous", () => {
    // Heuristic should not aggressively reroute when the caller already
    // picked a specific intent — only the safest defaults get overridden
    // by the route handler (the inference function itself returns the
    // winner, but the route only honors it for create_object / explain
    // fallbacks).
    const { intent } = inferIntentFromPrompt(
      "yes please",
      "edit_view",
    );
    expect(intent).toBe("edit_view");
  });
});
