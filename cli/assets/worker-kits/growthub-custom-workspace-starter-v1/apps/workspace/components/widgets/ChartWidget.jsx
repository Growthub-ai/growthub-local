"use client";

import { useEffect, useState } from "react";

const sampleRows = [
  { label: "Mon", value: 3 },
  { label: "Tue", value: 7 },
  { label: "Wed", value: 5 },
  { label: "Thu", value: 9 },
  { label: "Fri", value: 6 },
  { label: "Sat", value: 4 },
  { label: "Sun", value: 8 }
];

function ChartWidget({ widget }) {
  const dataSource = widget.config?.dataSource;
  const [state, setState] = useState({
    status: "idle",
    rows: sampleRows,
    source: "static-sample",
    tableId: dataSource?.tableId || null
  });

  useEffect(() => {
    if (!dataSource || dataSource.type !== "bridge-knowledge") return;
    let cancelled = false;
    setState((prev) => ({ ...prev, status: "loading" }));
    fetch(`/api/workspace/knowledge?tableId=${encodeURIComponent(dataSource.tableId || "")}`)
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        setState({
          status: payload.error ? "error" : "ok",
          rows: payload.rows && payload.rows.length ? payload.rows : sampleRows,
          source: payload.source || "static-sample",
          tableId: payload.tableId || dataSource.tableId || null,
          error: payload.error || null
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, status: "error", error: error.message }));
      });
    return () => {
      cancelled = true;
    };
  }, [dataSource]);

  const max = Math.max(1, ...state.rows.map((row) => Number(row.value) || 0));

  return (
    <div className="widget-chart">
      <header className="widget-header">
        <span className="widget-kind">chart</span>
        <strong>{widget.title || "Untitled chart"}</strong>
      </header>
      <div className="widget-chart-bars" role="img" aria-label="bar chart preview">
        {state.rows.slice(0, 12).map((row, index) => {
          const value = Number(row.value) || 0;
          const height = Math.max(6, Math.round((value / max) * 100));
          return (
            <div
              className="widget-chart-bar"
              key={`${row.label}-${index}`}
              style={{ height: `${height}%` }}
              title={`${row.label}: ${value}`}
            />
          );
        })}
      </div>
      <footer className="widget-footer">
        <code>{state.source}</code>
        {state.tableId ? <span>{state.tableId}</span> : <span>sample data</span>}
      </footer>
    </div>
  );
}

export default ChartWidget;
