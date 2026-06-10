"use client";

/**
 * Dot-strip progress — one dot per agent.
 * grey = pending · blue = running · filled dark = done · muted red = error.
 * Same visual grammar as the git-pill status dot, repeated per agent.
 */
export function SwarmDotStrip({ agents }) {
  const list = Array.isArray(agents) ? agents : [];
  if (list.length === 0) return <span className="sw-dotstrip"><span className="sw-dot" /></span>;
  return (
    <span className="sw-dotstrip" aria-label={`${list.filter((a) => a.status === "done").length}/${list.length} agents done`}>
      {list.map((agent) => (
        <span key={agent.id} className={`sw-dot sw-dot--${agent.status || "pending"}`} />
      ))}
    </span>
  );
}
