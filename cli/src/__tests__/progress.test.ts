/**
 * Progress + relative-time helpers — Unit Tests.
 */

import { describe, expect, it } from "vitest";
import { renderProgressBar, formatRelative } from "../utils/progress.js";

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("renderProgressBar", () => {
  it("renders zero progress as an empty bar with 0/0 counts", () => {
    const out = stripAnsi(renderProgressBar(0, 0));
    expect(out).toContain("0/0");
    expect(out).toContain("(0%)");
  });

  it("fills proportionally to the ratio", () => {
    const half = stripAnsi(renderProgressBar(5, 10, { width: 10, color: false }));
    expect(half).toMatch(/█████░░░░░/);
    expect(half).toContain("5/10");
    expect(half).toContain("(50%)");
  });

  it("fully fills at 100%", () => {
    const full = stripAnsi(renderProgressBar(10, 10, { width: 10, color: false }));
    expect(full).toMatch(/██████████/);
    expect(full).toContain("10/10");
    expect(full).toContain("(100%)");
  });

  it("can omit numeric counts", () => {
    const out = stripAnsi(renderProgressBar(2, 4, { showCounts: false, color: false }));
    expect(out).not.toContain("2/4");
  });
});

describe("formatRelative", () => {
  const now = Date.now();
  const iso = (delta: number): string => new Date(now - delta).toISOString();

  it('returns "just now" for deltas < 10s', () => {
    expect(formatRelative(iso(1_000), now)).toBe("just now");
  });

  it("renders seconds for sub-minute deltas", () => {
    expect(formatRelative(iso(45_000), now)).toBe("45s ago");
  });

  it("renders minutes for sub-hour deltas", () => {
    expect(formatRelative(iso(12 * 60_000), now)).toBe("12m ago");
  });

  it("renders hours for sub-day deltas", () => {
    expect(formatRelative(iso(3 * 3_600_000), now)).toBe("3h ago");
  });

  it("renders days for sub-month deltas", () => {
    expect(formatRelative(iso(2 * 86_400_000), now)).toBe("2d ago");
  });

  it("renders ISO date for anything older than a month", () => {
    expect(formatRelative(iso(60 * 86_400_000), now)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns "—" when iso is undefined', () => {
    expect(formatRelative(undefined, now)).toBe("—");
  });
});
