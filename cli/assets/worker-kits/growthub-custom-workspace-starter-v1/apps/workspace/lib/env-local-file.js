/**
 * .env.local merge V1 — roadmap Phase 1.3 / 3.3.
 *
 * Pure text transform for upserting secret KEY=value lines into a `.env.local`
 * file. The Settings -> APIs & Webhooks save path writes the typed secret value
 * to disk here (filesystem mode only) while `growthub.config.json` keeps only
 * `hasSecret: true` — never the value. This closes the gap where "saved" keys
 * did not exist at runtime because the value was discarded.
 *
 * No fs / no fetch — the caller owns the gated read/write. This module only
 * computes the new file content, preserving comments, blank lines, and the
 * relative order of untouched entries.
 */

function quoteIfNeeded(value) {
  const raw = String(value ?? "");
  // Quote when the value would otherwise be ambiguous on a dotenv line.
  if (raw === "" || /[\s#'"=]|^\s|\s$/.test(raw)) {
    return `"${raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return raw;
}

/** Match an assignment line for a given key (optionally `export `, not commented). */
function keyLineMatcher(key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(\\s*export\\s+)?${escaped}\\s*=`);
}

/**
 * Upsert each `updates[KEY] = value` into the existing `.env.local` content.
 * Returns the new content string (newline-terminated). Keys with `undefined`
 * or `null` values are skipped (no deletion semantics here).
 */
function mergeEnvLocalContent(existing, updates) {
  const updateMap = updates && typeof updates === "object" && !Array.isArray(updates) ? updates : {};
  const keys = Object.keys(updateMap).filter((k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && updateMap[k] != null);
  if (!keys.length) {
    return typeof existing === "string" ? existing : "";
  }

  const text = typeof existing === "string" ? existing : "";
  const lines = text.length ? text.split("\n") : [];
  const remaining = new Set(keys);

  const next = lines.map((line) => {
    for (const key of keys) {
      if (remaining.has(key) && keyLineMatcher(key).test(line)) {
        remaining.delete(key);
        return `${key}=${quoteIfNeeded(updateMap[key])}`;
      }
    }
    return line;
  });

  // Drop a single trailing empty line so appends land cleanly; re-added below.
  while (next.length && next[next.length - 1].trim() === "") next.pop();

  for (const key of keys) {
    if (remaining.has(key)) {
      next.push(`${key}=${quoteIfNeeded(updateMap[key])}`);
    }
  }

  return `${next.join("\n")}\n`;
}

export { mergeEnvLocalContent, quoteIfNeeded };
