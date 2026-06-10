"use client";

import { formatTokens } from "./swarm-format.js";

/**
 * Assistant-footer status line: "46s · 82.0k tokens · 1 running task".
 * Loop pills append as "loop <name> ·" entries when loops are active.
 */
export function SwarmStatusLine({ running, finished, loops }) {
  const runningCount = (running || []).filter((run) => run.status === "running").length;
  const totalTokens = [...(running || []), ...(finished || [])]
    .reduce((sum, run) => sum + (run.totals?.tokens || 0), 0);
  const activeLoops = (loops || []).filter((loop) => loop.status === "active");
  if (runningCount === 0 && totalTokens === 0 && activeLoops.length === 0) return null;
  return (
    <div className="sw-statusline">
      {totalTokens > 0 && <span>{formatTokens(totalTokens)} tokens</span>}
      <span>{runningCount} running task{runningCount === 1 ? "" : "s"}</span>
      {activeLoops.map((loop) => (
        <span key={loop.loopId} className="sw-loop-pill">
          loop {loop.workflowName} · {loop.iterations}x
        </span>
      ))}
    </div>
  );
}
