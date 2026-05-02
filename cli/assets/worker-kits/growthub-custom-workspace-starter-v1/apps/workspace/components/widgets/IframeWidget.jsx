"use client";

function IframeWidget({ widget }) {
  const src = widget.config?.src;
  return (
    <div className="widget-iframe">
      <header className="widget-header">
        <span className="widget-kind">iframe</span>
        <strong>{widget.title || "Untitled iframe"}</strong>
      </header>
      {src ? (
        <iframe
          src={src}
          title={widget.title || "Embedded content"}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin"
        />
      ) : (
        <div className="widget-empty">
          <p>Set <code>config.src</code> on this widget to embed a URL.</p>
        </div>
      )}
    </div>
  );
}

export default IframeWidget;
