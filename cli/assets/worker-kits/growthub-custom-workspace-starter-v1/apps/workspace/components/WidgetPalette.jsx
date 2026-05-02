"use client";

function WidgetPalette({ widgetTypes, bindings, integrationAdapter, onAddWidget }) {
  return (
    <aside className="workspace-widget-panel" id="widgets" aria-label="Widget configuration">
      <div className="workspace-panel-title">
        <button type="button" aria-label="Close widget panel">x</button>
        <strong>New widget</strong>
      </div>
      <section>
        <p className="workspace-panel-label">Widget type</p>
        <div className="workspace-widget-types">
          {widgetTypes.map((widget) => (
            <button
              type="button"
              key={widget.kind}
              onClick={() => onAddWidget(widget.kind)}
            >
              <span>{widget.icon}</span>
              {widget.label}
            </button>
          ))}
        </div>
      </section>
      <section className="workspace-bindings" id="bindings">
        <p className="workspace-panel-label">Config bindings</p>
        {Object.entries(bindings || {}).map(([key, value]) => (
          <div key={key}>
            <span>{key}</span>
            <code>{String(value)}</code>
          </div>
        ))}
        <div>
          <span>integrationAdapter</span>
          <code>{integrationAdapter}</code>
        </div>
      </section>
    </aside>
  );
}

export default WidgetPalette;
