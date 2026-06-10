/** Display formatters shared by every swarm cockpit component. */

function formatTokens(tokens) {
  const n = Number(tokens);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return "";
  const totalSeconds = Math.round(n / 1000);
  if (totalSeconds < 60) return `${String(totalSeconds).padStart(2, "0")}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatElapsedSince(startedAt, finishedAt) {
  if (!startedAt) return "";
  const end = finishedAt ? Date.parse(finishedAt) : Date.now();
  return formatDuration(end - Date.parse(startedAt));
}

function runStatusLabel(status) {
  if (status === "done") return "Completed";
  if (status === "error") return "Failed";
  if (status === "stopped") return "Stopped";
  if (status === "pending") return "Pending approval";
  return "";
}

export { formatTokens, formatDuration, formatElapsedSince, runStatusLabel };
