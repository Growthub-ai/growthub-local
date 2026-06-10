"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Command surface — one local registry, two triggers:
 *   Cmd-K / Ctrl-K — global palette
 *   "/ commands"    — same palette in slash mode
 *
 * Commands are derived client-side from data the drawer already loaded
 * (swarm workflows from GET /api/workspace) plus static navigation. No
 * dedicated command route exists; launches go through the existing
 * POST /api/workspace/sandbox-run.
 */

const STATIC_COMMANDS = [
  { name: "data-model", scope: "chat", resolve: "navigate", description: "Open the data model cockpit", href: "/data-model" },
  { name: "workflows", scope: "chat", resolve: "navigate", description: "Open the workflows surface", href: "/workflows" },
  { name: "workspace-lens", scope: "chat", resolve: "navigate", description: "Open the workspace lens", href: "/workspace-lens" }
];

export function CommandKPalette({ open, mode, workflows, onClose, onInvoke }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  const commands = useMemo(() => [
    ...(workflows || []).map((workflow) => ({
      name: workflow.name,
      scope: "swarm",
      resolve: "launch",
      description: workflow.description || `Run swarm workflow ${workflow.label}`,
      workflow
    })),
    ...STATIC_COMMANDS
  ], [workflows]);

  useEffect(() => {
    if (!open) return;
    setQuery(mode === "slash" ? "/" : "");
    setActiveIndex(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open, mode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\//, "").split(/\s+/)[0] || "";
    const scored = commands
      .map((command) => {
        const name = command.name.toLowerCase();
        let score = -1;
        if (!q) score = 4;
        else if (name === q) score = 0;
        else if (name.startsWith(q)) score = 1;
        else if (name.includes(q)) score = 2;
        else if ((command.description || "").toLowerCase().includes(q)) score = 3;
        return { command, score };
      })
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => a.score - b.score);
    const groups = new Map();
    for (const { command } of scored) {
      const scope = command.scope || "chat";
      if (!groups.has(scope)) groups.set(scope, []);
      groups.get(scope).push(command);
    }
    return { flat: scored.map((entry) => entry.command), groups };
  }, [commands, query]);

  if (!open) return null;

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose?.();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filtered.flat.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = filtered.flat[activeIndex];
      if (command) onInvoke?.(command);
    } else if (event.key === "Tab") {
      event.preventDefault();
      const command = filtered.flat[activeIndex];
      if (command) setQuery(`/${command.name} `);
    }
  };

  let renderedIndex = -1;
  return (
    <div className="sw-palette-backdrop" onClick={() => onClose?.()}>
      <div className="sw-palette" onClick={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          className="sw-palette__input"
          placeholder="Type a command…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="sw-palette__list">
          {Array.from(filtered.groups.entries()).map(([scope, scopeCommands]) => (
            <div key={scope}>
              <div className="sw-palette__scope">{scope}</div>
              {scopeCommands.map((command) => {
                renderedIndex += 1;
                const index = renderedIndex;
                return (
                  <button
                    key={command.name}
                    type="button"
                    className={`sw-palette__item${index === activeIndex ? " sw-palette__item--active" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => onInvoke?.(command)}
                  >
                    <span className="sw-palette__name">/{command.name}</span>
                    <span className="sw-palette__desc">{command.description}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.flat.length === 0 && <div className="sw-palette__empty">No matching commands</div>}
        </div>
      </div>
    </div>
  );
}
