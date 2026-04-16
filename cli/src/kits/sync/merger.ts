/**
 * Fork Sync — package.json-aware merger.
 *
 * When both upstream and fork have modified package.json, we can't do a plain
 * overwrite (that would blow away locally added dependencies/scripts) and we
 * can't preserve-local (that would freeze the kit on a stale upstream). The
 * structured merge preserves:
 *   - the upstream "version", "name", and top-level metadata that defines the kit
 *   - upstream dependency adds and version bumps (fast-forward)
 *   - local-only dependency adds (user-added customizations)
 *   - upstream-only script additions
 *   - local script customizations (they win on conflict)
 *
 * The merger returns both the merged object and a human-readable trace so the
 * sync report can show exactly what was kept, added, or upgraded.
 */

interface JsonObject {
  [key: string]: unknown;
}

export interface PackageJsonMergeTrace {
  field: string;
  action: "keep-local" | "apply-upstream" | "add-upstream" | "add-local" | "noop";
  detail?: string;
}

export interface PackageJsonMergeResult {
  merged: JsonObject;
  trace: PackageJsonMergeTrace[];
}

const DEPENDENCY_KEYS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

function parseJson(source: string): JsonObject {
  const parsed = JSON.parse(source) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("package.json must be a JSON object");
  }
  return parsed as JsonObject;
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDependencyMap(
  field: string,
  baseline: JsonObject,
  upstream: JsonObject,
  fork: JsonObject,
  trace: PackageJsonMergeTrace[],
): JsonObject {
  const baseMap = isPlainObject(baseline[field]) ? (baseline[field] as JsonObject) : {};
  const upMap = isPlainObject(upstream[field]) ? (upstream[field] as JsonObject) : {};
  const forkMap = isPlainObject(fork[field]) ? (fork[field] as JsonObject) : {};
  const merged: JsonObject = {};

  const allNames = new Set<string>([
    ...Object.keys(baseMap),
    ...Object.keys(upMap),
    ...Object.keys(forkMap),
  ]);

  for (const name of [...allNames].sort()) {
    const baseVal = baseMap[name];
    const upVal = upMap[name];
    const forkVal = forkMap[name];

    if (upVal !== undefined && forkVal === undefined && baseVal === undefined) {
      merged[name] = upVal;
      trace.push({ field: `${field}.${name}`, action: "add-upstream", detail: String(upVal) });
      continue;
    }
    if (forkVal !== undefined && upVal === undefined && baseVal === undefined) {
      merged[name] = forkVal;
      trace.push({ field: `${field}.${name}`, action: "add-local", detail: String(forkVal) });
      continue;
    }
    if (upVal !== undefined && forkVal !== undefined) {
      if (upVal === forkVal) {
        merged[name] = upVal;
        trace.push({ field: `${field}.${name}`, action: "noop" });
        continue;
      }
      if (upVal !== baseVal && forkVal === baseVal) {
        merged[name] = upVal;
        trace.push({ field: `${field}.${name}`, action: "apply-upstream", detail: `${String(baseVal)} -> ${String(upVal)}` });
        continue;
      }
      if (forkVal !== baseVal && upVal === baseVal) {
        merged[name] = forkVal;
        trace.push({ field: `${field}.${name}`, action: "keep-local", detail: String(forkVal) });
        continue;
      }
      merged[name] = forkVal;
      trace.push({
        field: `${field}.${name}`,
        action: "keep-local",
        detail: `both changed (upstream=${String(upVal)}, fork=${String(forkVal)}) — keeping fork; sync will escalate`,
      });
      continue;
    }
    if (upVal === undefined && forkVal !== undefined) {
      merged[name] = forkVal;
      trace.push({ field: `${field}.${name}`, action: "keep-local", detail: "upstream removed entry, keeping local" });
      continue;
    }
    if (upVal !== undefined && forkVal === undefined) {
      merged[name] = upVal;
      trace.push({ field: `${field}.${name}`, action: "add-upstream", detail: "re-adding upstream entry removed by fork" });
    }
  }

  return merged;
}

function mergeScripts(baseline: JsonObject, upstream: JsonObject, fork: JsonObject, trace: PackageJsonMergeTrace[]): JsonObject {
  const baseMap = isPlainObject(baseline.scripts) ? (baseline.scripts as JsonObject) : {};
  const upMap = isPlainObject(upstream.scripts) ? (upstream.scripts as JsonObject) : {};
  const forkMap = isPlainObject(fork.scripts) ? (fork.scripts as JsonObject) : {};
  const merged: JsonObject = {};
  const names = new Set<string>([...Object.keys(baseMap), ...Object.keys(upMap), ...Object.keys(forkMap)]);

  for (const name of [...names].sort()) {
    const baseVal = baseMap[name];
    const upVal = upMap[name];
    const forkVal = forkMap[name];
    if (forkVal !== undefined && upVal !== undefined && forkVal === upVal) {
      merged[name] = upVal;
      continue;
    }
    if (forkVal !== undefined && forkVal !== baseVal) {
      merged[name] = forkVal;
      trace.push({ field: `scripts.${name}`, action: "keep-local", detail: "fork customized script" });
      continue;
    }
    if (upVal !== undefined) {
      merged[name] = upVal;
      if (upVal !== baseVal) {
        trace.push({ field: `scripts.${name}`, action: "apply-upstream" });
      }
    } else if (forkVal !== undefined) {
      merged[name] = forkVal;
      trace.push({ field: `scripts.${name}`, action: "keep-local", detail: "upstream removed script — keeping fork" });
    }
  }
  return merged;
}

export function mergePackageJson(
  baselineSource: string,
  upstreamSource: string,
  forkSource: string,
): PackageJsonMergeResult {
  const baseline = parseJson(baselineSource);
  const upstream = parseJson(upstreamSource);
  const fork = parseJson(forkSource);

  const trace: PackageJsonMergeTrace[] = [];
  const merged: JsonObject = { ...fork };

  for (const metaKey of ["name", "description", "version"]) {
    const upVal = upstream[metaKey];
    const forkVal = fork[metaKey];
    const baseVal = baseline[metaKey];
    if (upVal !== undefined && upVal !== baseVal && forkVal === baseVal) {
      merged[metaKey] = upVal;
      trace.push({ field: metaKey, action: "apply-upstream", detail: `${String(baseVal)} -> ${String(upVal)}` });
    } else if (forkVal !== undefined && forkVal !== baseVal) {
      merged[metaKey] = forkVal;
      trace.push({ field: metaKey, action: "keep-local" });
    } else if (upVal !== undefined) {
      merged[metaKey] = upVal;
    }
  }

  for (const depKey of DEPENDENCY_KEYS) {
    merged[depKey] = mergeDependencyMap(depKey, baseline, upstream, fork, trace);
    if (Object.keys(merged[depKey] as JsonObject).length === 0) {
      delete merged[depKey];
    }
  }

  merged.scripts = mergeScripts(baseline, upstream, fork, trace);
  if (Object.keys(merged.scripts as JsonObject).length === 0) {
    delete merged.scripts;
  }

  return { merged, trace };
}
