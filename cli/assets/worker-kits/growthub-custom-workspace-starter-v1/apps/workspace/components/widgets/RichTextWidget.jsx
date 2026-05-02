"use client";

function RichTextWidget({ widget }) {
  const body = widget.config?.body || "Add notes, instructions, or context for this dashboard.";
  return (
    <div className="widget-rich-text">
      <header className="widget-header">
        <span className="widget-kind">rich-text</span>
        <strong>{widget.title || "Untitled note"}</strong>
      </header>
      <div className="widget-rich-text-body">
        {body.split("\n").map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    </div>
  );
}

export default RichTextWidget;
