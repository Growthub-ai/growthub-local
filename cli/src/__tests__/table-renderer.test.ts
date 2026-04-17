/**
 * Table Renderer — Unit Tests
 *
 * Covers:
 *   - ANSI-safe width computation
 *   - Column alignment (left / right / center)
 *   - Truncation with ellipsis
 *   - Empty-state text
 *   - Custom format() callbacks
 */

import { describe, expect, it } from "vitest";
import { renderTable } from "../utils/table-renderer.js";

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

interface Row {
  id: string;
  count: number;
  label: string | null;
}

describe("renderTable", () => {
  it("renders headers + rows with left-alignment by default", () => {
    const out = renderTable<Row>({
      columns: [
        { key: "id", label: "ID" },
        { key: "count", label: "Count" },
      ],
      rows: [
        { id: "a", count: 1, label: null },
        { id: "b", count: 22, label: null },
      ],
    });
    const plain = stripAnsi(out);
    expect(plain).toMatch(/ID/);
    expect(plain).toMatch(/Count/);
    expect(plain).toMatch(/a/);
    expect(plain).toMatch(/22/);
  });

  it("prints empty text when rows is empty", () => {
    const out = renderTable<Row>({
      columns: [{ key: "id", label: "ID" }],
      rows: [],
      emptyText: "No rows here.",
    });
    expect(stripAnsi(out)).toContain("No rows here.");
  });

  it("uses custom format callbacks", () => {
    const out = renderTable<Row>({
      columns: [
        {
          key: "count",
          label: "Count",
          format: (v) => `#${v}`,
        },
      ],
      rows: [{ id: "a", count: 7, label: null }],
    });
    expect(stripAnsi(out)).toMatch(/#7/);
  });

  it("truncates long values beyond maxWidth with ellipsis", () => {
    const out = renderTable<Row>({
      columns: [{ key: "id", label: "ID", maxWidth: 6 }],
      rows: [{ id: "this-is-too-long", count: 0, label: null }],
    });
    const plain = stripAnsi(out);
    expect(plain).toMatch(/this-…|this-/);
    // Column width should be capped at 6, so no 20-char long id anywhere.
    expect(plain).not.toContain("this-is-too-long");
  });

  it("supports right alignment for numeric columns", () => {
    const out = renderTable<Row>({
      columns: [
        { key: "count", label: "Count", width: 6, align: "right" },
      ],
      rows: [{ id: "a", count: 3, label: null }],
    });
    const plain = stripAnsi(out);
    // Should contain the number padded with leading spaces
    expect(plain).toMatch(/ 3(\s|$)/);
  });

  it("handles null/undefined cell values as empty strings", () => {
    const out = renderTable<Row>({
      columns: [
        { key: "label", label: "Label" },
        { key: "id", label: "ID" },
      ],
      rows: [{ id: "x", count: 0, label: null }],
    });
    expect(() => stripAnsi(out)).not.toThrow();
    expect(stripAnsi(out)).toMatch(/x/);
  });
});
