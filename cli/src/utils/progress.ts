/**
 * Progress bar + relative-time helpers for fork sync UX.
 *
 * Kept dependency-free and ANSI-safe. Used by `kit fork jobs --watch`, the
 * heal preview, and the audit history timeline.
 */

import pc from "picocolors";

export interface ProgressBarOptions {
  width?: number;
  /** Characters used for filled / empty cells. */
  filledChar?: string;
  emptyChar?: string;
  /** Append numeric suffix like " 4/10 (40%)". */
  showCounts?: boolean;
  /** Colorize by percentage: green ≥80, yellow ≥50, red otherwise. */
  color?: boolean;
}

export function renderProgressBar(
  current: number,
  total: number,
  opts: ProgressBarOptions = {},
): string {
  const width = opts.width ?? 24;
  const filled = opts.filledChar ?? "█";
  const empty = opts.emptyChar ?? "░";
  const showCounts = opts.showCounts ?? true;
  const color = opts.color ?? true;

  const safeTotal = Math.max(0, total);
  const safeCurrent = Math.min(Math.max(0, current), safeTotal || current);
  const ratio = safeTotal > 0 ? safeCurrent / safeTotal : 0;
  const filledCells = Math.round(ratio * width);
  const bar = filled.repeat(filledCells) + empty.repeat(Math.max(0, width - filledCells));

  const pct = Math.round(ratio * 100);
  const painted = color
    ? pct >= 80
      ? pc.green(bar)
      : pct >= 50
        ? pc.yellow(bar)
        : pct > 0
          ? pc.red(bar)
          : pc.dim(bar)
    : bar;

  if (!showCounts) return `[${painted}]`;
  return `[${painted}] ${safeCurrent}/${safeTotal || 0} (${pct}%)`;
}

/**
 * Format an ISO timestamp as a human-friendly relative age.
 *   "just now", "45s ago", "12m ago", "3h ago", "2d ago", or the date itself
 *   for anything older than ~30 days.
 */
export function formatRelative(iso?: string, nowMs: number = Date.now()): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "—";
  const diff = Math.max(0, nowMs - ts);
  if (diff < 10_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
