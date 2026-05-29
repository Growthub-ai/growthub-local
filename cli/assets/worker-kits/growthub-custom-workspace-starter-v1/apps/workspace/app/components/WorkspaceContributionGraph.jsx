"use client";

/**
 * WorkspaceContributionGraph — GitHub-style activity heatmap for the workspace.
 *
 * Renders the pure `deriveWorkspaceContributions` grid (53 weeks × 7 days) as a
 * calm, developer-familiar contribution graph. The chrome is neutral; only the
 * cells use the recognizable green intensity scale. On hover each day shows a
 * minimal tooltip (count + date) with a link into the matching filtered lens
 * view — so the graph becomes the entry point to a daily ritual: open the lens,
 * read your activity, drill into the day, start work.
 */

import { useState } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function WorkspaceContributionGraph({ data, onSelectDay, buildDayHref }) {
  const [hover, setHover] = useState(null);
  if (!data || !Array.isArray(data.weeks) || data.weeks.length === 0) return null;

  // Month labels: show a label above the first week whose first day starts a
  // new month versus the previous column.
  let prevMonth = -1;
  const monthLabels = data.weeks.map((week) => {
    const first = week.days[0];
    const month = first ? new Date(first.date).getUTCMonth() : -1;
    if (month !== prevMonth) { prevMonth = month; return MONTHS[month] || ""; }
    return "";
  });

  return (
    <section className="workspace-contrib" aria-label="Workspace contribution graph">
      <div className="workspace-contrib-head">
        <span className="workspace-contrib-total">{data.total} workspace contributions in the last year</span>
        <span className="workspace-contrib-legend" aria-hidden="true">
          Less
          <i className="workspace-contrib-cell lvl-0" />
          <i className="workspace-contrib-cell lvl-1" />
          <i className="workspace-contrib-cell lvl-2" />
          <i className="workspace-contrib-cell lvl-3" />
          <i className="workspace-contrib-cell lvl-4" />
          More
        </span>
      </div>

      <div className="workspace-contrib-grid-wrap">
        <div className="workspace-contrib-months" aria-hidden="true">
          {monthLabels.map((label, i) => (
            <span key={i} className="workspace-contrib-month">{label}</span>
          ))}
        </div>
        <div className="workspace-contrib-body">
          <div className="workspace-contrib-weekdays" aria-hidden="true">
            <span />
            <span>Mon</span>
            <span />
            <span>Wed</span>
            <span />
            <span>Fri</span>
            <span />
          </div>
          <div className="workspace-contrib-weeks" role="img" aria-label={`${data.total} workspace contributions`}>
            {data.weeks.map((week, wi) => (
              <div key={wi} className="workspace-contrib-week">
                {week.days.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    className={"workspace-contrib-cell lvl-" + (day.future ? "future" : day.level) + (day.count > 0 ? " has-count" : "")}
                    disabled={day.future}
                    data-count={day.count}
                    aria-label={day.future ? "" : `${day.count} on ${formatDay(day.date)}`}
                    onMouseEnter={(e) => {
                      if (day.future) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      setHover({ date: day.date, count: day.count, x: r.left + r.width / 2, y: r.top });
                    }}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => { if (!day.future && onSelectDay) onSelectDay(day.date); }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {hover ? (
        <div
          className="workspace-contrib-tooltip"
          style={{ left: hover.x, top: hover.y }}
          role="tooltip"
        >
          <span className="workspace-contrib-tooltip-count">
            {hover.count} contribution{hover.count === 1 ? "" : "s"}
          </span>
          <span className="workspace-contrib-tooltip-date">{formatDay(hover.date)}</span>
          {hover.count > 0 && buildDayHref ? (
            <a
              className="workspace-contrib-tooltip-link"
              href={buildDayHref(hover.date)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open day in Workspace Lens ↗
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
