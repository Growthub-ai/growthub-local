/**
 * Minimal YAML-frontmatter parser for Growthub SKILL.md files.
 *
 * We deliberately avoid adding a YAML dependency for this one usage. The
 * SKILL.md frontmatter subset is tightly scoped:
 *
 *   - top-level scalars (string, boolean, number)
 *   - top-level objects (one level of nesting)
 *   - arrays of scalars (`- item`)
 *   - arrays of objects (`- key: value` blocks)
 *   - strings quoted with `"..."` (with backslash-escaped inner quotes)
 *
 * Anything outside this subset should be caught by `growthub skills validate`
 * and the author nudged to keep frontmatter simple. This matches the
 * `@growthub/api-contract/skills::SkillManifest` shape exactly.
 */

export interface FrontmatterSplit {
  frontmatter: string | null;
  body: string;
}

/** Split a markdown file into `---` frontmatter + body. Returns null frontmatter if absent. */
export function splitFrontmatter(text: string): FrontmatterSplit {
  // Accept LF and CRLF; both `---\n` and `---\r\n` as separators.
  const normalised = text.replace(/\r\n/g, "\n");
  if (!normalised.startsWith("---\n")) {
    return { frontmatter: null, body: normalised };
  }
  const end = normalised.indexOf("\n---\n", 4);
  if (end === -1) {
    return { frontmatter: null, body: normalised };
  }
  return {
    frontmatter: normalised.slice(4, end),
    body: normalised.slice(end + 5),
  };
}

type Scalar = string | number | boolean | null;
type Value = Scalar | Scalar[] | Record<string, unknown> | Record<string, unknown>[];

function parseScalar(raw: string): Scalar {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null" || trimmed === "~") return null;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (/^-?\d*\.\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function indentWidth(line: string): number {
  const match = line.match(/^( *)/);
  return match ? match[1].length : 0;
}

/**
 * Parse the trimmed frontmatter body into a plain object.
 *
 * Throws on malformed input so `growthub skills validate` can surface the
 * author's error with a line number.
 */
export function parseFrontmatter(text: string): Record<string, unknown> {
  const lines = text.split("\n");
  const root: Record<string, unknown> = {};
  let i = 0;

  function readBlock(baseIndent: number): Record<string, unknown> | Record<string, unknown>[] | Scalar[] {
    const out: Record<string, unknown> = {};
    const arr: Array<Record<string, unknown> | Scalar> = [];
    let mode: "object" | "array" | null = null;

    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "" || line.trimStart().startsWith("#")) { i++; continue; }
      const indent = indentWidth(line);
      if (indent < baseIndent) break;
      if (indent > baseIndent) {
        // Stray deeper indentation — consumed by a previous recursive call
        // or a format error. Advance to avoid infinite loop.
        i++; continue;
      }

      const trimmed = line.slice(baseIndent);
      if (trimmed.startsWith("- ")) {
        mode = "array";
        const after = trimmed.slice(2);
        const colonAt = findTopLevelColon(after);
        if (colonAt === -1) {
          arr.push(parseScalar(after));
          i++;
        } else {
          // Array of objects: "- key: value" starts an object; subsequent
          // lines at baseIndent + 2 continue its keys.
          const firstKey = after.slice(0, colonAt).trim();
          const firstRaw = after.slice(colonAt + 1).trim();
          const obj: Record<string, unknown> = {};
          if (firstRaw === "") {
            i++;
            obj[firstKey] = readBlock(baseIndent + 2 + 2);
          } else {
            obj[firstKey] = parseScalar(firstRaw);
            i++;
          }
          // Read continuation keys at baseIndent + 2 (the "- " occupies 2 cols).
          while (i < lines.length) {
            const peek = lines[i];
            if (peek.trim() === "" || peek.trimStart().startsWith("#")) { i++; continue; }
            const pInd = indentWidth(peek);
            if (pInd < baseIndent + 2) break;
            if (peek.slice(baseIndent).startsWith("- ")) break;
            const cTrimmed = peek.slice(baseIndent + 2);
            const cColon = findTopLevelColon(cTrimmed);
            if (cColon === -1) { i++; continue; }
            const cKey = cTrimmed.slice(0, cColon).trim();
            const cRaw = cTrimmed.slice(cColon + 1).trim();
            if (cRaw === "") {
              i++;
              obj[cKey] = readBlock(baseIndent + 2 + 2);
            } else {
              obj[cKey] = parseScalar(cRaw);
              i++;
            }
          }
          arr.push(obj);
        }
        continue;
      }

      mode = "object";
      const colonAt = findTopLevelColon(trimmed);
      if (colonAt === -1) {
        throw new Error(`Malformed frontmatter (expected "key: value") at line ${i + 1}: ${JSON.stringify(line)}`);
      }
      const key = trimmed.slice(0, colonAt).trim();
      const rest = trimmed.slice(colonAt + 1).trim();
      if (rest === "") {
        i++;
        out[key] = readBlock(baseIndent + 2);
      } else if (rest.startsWith("[") && rest.endsWith("]")) {
        // Inline flow array, e.g. `helpers: []`.
        const inner = rest.slice(1, -1).trim();
        out[key] = inner === "" ? [] : inner.split(",").map((s) => parseScalar(s));
        i++;
      } else {
        out[key] = parseScalar(rest);
        i++;
      }
    }

    if (mode === "array") return arr as Record<string, unknown>[] | Scalar[];
    return out;
  }

  const parsed = readBlock(0);
  if (Array.isArray(parsed)) {
    throw new Error("Frontmatter root must be an object, not a list.");
  }
  Object.assign(root, parsed);
  return root;
}

/**
 * Find the position of the first top-level colon (one that separates
 * key from value), ignoring colons inside quoted strings.
 */
function findTopLevelColon(s: string): number {
  let inDouble = false;
  let inSingle = false;
  for (let idx = 0; idx < s.length; idx++) {
    const ch = s[idx];
    const prev = idx > 0 ? s[idx - 1] : "";
    if (ch === '"' && prev !== "\\" && !inSingle) inDouble = !inDouble;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === ":" && !inDouble && !inSingle) {
      if (idx + 1 >= s.length || s[idx + 1] === " " || s[idx + 1] === "\t") return idx;
    }
  }
  return -1;
}

/** Convenience: split + parse in one call. Returns null frontmatter when absent. */
export function readFrontmatter(text: string): {
  frontmatter: Record<string, unknown> | null;
  body: string;
} {
  const split = splitFrontmatter(text);
  if (split.frontmatter === null) return { frontmatter: null, body: split.body };
  return { frontmatter: parseFrontmatter(split.frontmatter), body: split.body };
}
