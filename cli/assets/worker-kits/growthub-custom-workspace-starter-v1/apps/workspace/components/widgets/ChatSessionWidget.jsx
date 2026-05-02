"use client";

import { useEffect, useState } from "react";

function ChatSessionWidget({ widget }) {
  const slug = widget.config?.agentSlug;
  const [state, setState] = useState({ status: "idle", agent: null, bindings: [] });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace/agents")
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        const bindings = Array.isArray(payload.bindings) ? payload.bindings : [];
        const agent = slug ? bindings.find((item) => item.slug === slug) : bindings[0] || null;
        setState({ status: "ok", agent, bindings, source: payload.source });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ status: "error", error: error.message, bindings: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="widget-chat">
      <header className="widget-header">
        <span className="widget-kind">chat-session</span>
        <strong>{widget.title || "Bound agent"}</strong>
      </header>
      {state.agent ? (
        <div className="widget-chat-body">
          <p className="widget-chat-name">{state.agent.label || state.agent.slug}</p>
          <p className="widget-chat-meta">
            <code>{state.agent.slug}</code>
            <span>execution authority: {state.agent.executionAuthority || "gh-app"}</span>
          </p>
          <p className="widget-chat-note">
            Execution remains hosted in the Growthub Bridge. This widget surfaces the binding metadata.
          </p>
        </div>
      ) : (
        <div className="widget-empty">
          <p>No agent binding found.</p>
          <p>
            Run <code>growthub bridge agents bind &lt;slug&gt;</code> to bind an agent locally,
            or set <code>config.agentSlug</code> on this widget.
          </p>
        </div>
      )}
    </div>
  );
}

export default ChatSessionWidget;
