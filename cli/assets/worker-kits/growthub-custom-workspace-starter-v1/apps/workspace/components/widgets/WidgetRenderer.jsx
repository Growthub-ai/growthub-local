"use client";

import ChartWidget from "./ChartWidget";
import ViewWidget from "./ViewWidget";
import IframeWidget from "./IframeWidget";
import RichTextWidget from "./RichTextWidget";
import ChatSessionWidget from "./ChatSessionWidget";
import WorkflowRunnerWidget from "./WorkflowRunnerWidget";
import ArtifactViewerWidget from "./ArtifactViewerWidget";

const widgetRenderers = {
  chart: ChartWidget,
  view: ViewWidget,
  iframe: IframeWidget,
  "rich-text": RichTextWidget,
  "chat-session": ChatSessionWidget,
  "workflow-runner": WorkflowRunnerWidget,
  "artifact-viewer": ArtifactViewerWidget
};

function WidgetRenderer({ widget }) {
  const Component = widgetRenderers[widget.kind];
  if (!Component) {
    return (
      <div className="widget-unknown">
        <strong>{widget.title || widget.kind}</strong>
        <code>unknown widget kind: {widget.kind}</code>
      </div>
    );
  }
  return <Component widget={widget} />;
}

export { widgetRenderers };
export default WidgetRenderer;
