"use client";

function ViewWidget({ widget }) {
  const columns = widget.config?.columns || ["Title", "Owner", "Status"];
  const rows = widget.config?.rows || [
    ["Untitled record", "Workspace owner", "draft"]
  ];
  return (
    <div className="widget-view">
      <header className="widget-header">
        <span className="widget-kind">view</span>
        <strong>{widget.title || "Untitled view"}</strong>
      </header>
      <table className="widget-view-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ViewWidget;
