"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Command surface — one registry, two triggers:
 *   Cmd-K / Ctrl-K  — global palette
 *   typing "/"       — same palette in slash mode (filter starts populated)
 *
 * Arrow keys move, Enter invokes, Tab completes the args hint, Esc closes.
 * Mutating commands resolve to governed proposals (the cockpit's propose →
 * approve path); reads and navigation resolve directly.
 */
export function CommandKPalette({ open, mode, onClose, onInvoke }) {
  const [commands, setCommands] = useState([]);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery(mode === "slash" ? "/" : "");
    setActiveIndex(0);
    fetch("/api/workspace/swarm-workflows", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.ok) setCommands(payload.commands || []);
      })
      .catch(() => {});
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

  const invoke = (command) => {
    const args = query.replace(/^\/?\S+\s*/, "").trim();
    onInvoke?.(command, args);
  };

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
      if (command) invoke(command);
    } else if (event.key === "Tab") {
      event.preventDefault();
      const command = filtered.flat[activeIndex];
      if (command) setQuery(`/${command.name} ${command.argsHint || ""}`.trimEnd() + " ");
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
                    onClick={() => invoke(command)}
                  >
                    <span className="sw-palette__name">/{command.name}</span>
                    {command.argsHint && <span className="sw-palette__args">{command.argsHint}</span>}
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
