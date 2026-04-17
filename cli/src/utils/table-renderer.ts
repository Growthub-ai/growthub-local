/**
 * Table Renderer
 *
 * Small, dependency-free CLI table formatter used by the Fork Sync UX (list,
 * jobs, history). Keeps visual parity with the existing picocolors/clack style
 * already shipping in the CLI — no new dependencies, ANSI-safe width math.
 */

import pc from "picocolors";

export type Align = "left" | "right" | "center";

export interface TableColumn<Row = Record<string, unknown>> {
  key: keyof Row & string;
  label: string;
  /** Fixed width; when omitted the column auto-sizes to content. */
  width?: number;
  /** Upper bound for auto-sizing; long cells are truncated with an ellipsis. */
  maxWidth?: number;
  align?: Align;
  /** Transform the raw cell value into the string actually displayed. */
  format?: (value: unknown, row: Row) => string;
}

export interface RenderTableOptions<Row = Record<string, unknown>> {
  columns: TableColumn<Row>[];
  rows: Row[];
  showHeader?: boolean;
  /** Message rendered when there are no rows. */
  emptyText?: string;
}

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, "");
}

function visibleLength(input: string): number {
  return stripAnsi(input).length;
}

function truncate(value: string, max: number): string {
  if (max <= 0) return "";
  if (visibleLength(value) <= max) return value;
  if (max <= 1) return value.slice(0, max);

  // Preserve ANSI where possible by working on the stripped version for width
  // math then slicing the original visible characters.
  const plain = stripAnsi(value);
  const keep = Math.max(0, max - 1);
  return plain.slice(0, keep) + "…";
}

function pad(value: string, width: number, align: Align): string {
  const vw = visibleLength(value);
  if (vw >= width) return value;
  const delta = width - vw;
  if (align === "right") return " ".repeat(delta) + value;
  if (align === "center") {
    const left = Math.floor(delta / 2);
    const right = delta - left;
    return " ".repeat(left) + value + " ".repeat(right);
  }
  return value + " ".repeat(delta);
}

function computeColumnWidths<Row>(
  columns: TableColumn<Row>[],
  cells: string[][],
): number[] {
  return columns.map((col, colIdx) => {
    if (col.width && col.width > 0) return col.width;
    const contentMax = cells.reduce(
      (acc, row) => Math.max(acc, visibleLength(row[colIdx] ?? "")),
      visibleLength(col.label),
    );
    if (col.maxWidth && contentMax > col.maxWidth) return col.maxWidth;
    return contentMax;
  });
}

export function renderTable<Row extends object>(
  opts: RenderTableOptions<Row>,
): string {
  const { columns, rows, showHeader = true, emptyText } = opts;

  if (rows.length === 0 && emptyText) {
    return pc.dim("  " + emptyText);
  }

  const rawCells: string[][] = rows.map((row) =>
    columns.map((col) => {
      const raw = (row as Record<string, unknown>)[col.key];
      if (col.format) return col.format(raw, row);
      if (raw === undefined || raw === null) return "";
      return String(raw);
    }),
  );

  const widths = computeColumnWidths(columns, rawCells);

  const lines: string[] = [];

  if (showHeader) {
    const header = columns
      .map((col, i) =>
        pad(pc.bold(truncate(col.label, widths[i]!)), widths[i]!, col.align ?? "left"),
      )
      .join("  ");
    lines.push("  " + header);
    lines.push("  " + widths.map((w) => pc.dim("─".repeat(w))).join("  "));
  }

  for (const cells of rawCells) {
    const line = columns
      .map((col, i) =>
        pad(truncate(cells[i] ?? "", widths[i]!), widths[i]!, col.align ?? "left"),
      )
      .join("  ");
    lines.push("  " + line);
  }

  return lines.join("\n");
}
