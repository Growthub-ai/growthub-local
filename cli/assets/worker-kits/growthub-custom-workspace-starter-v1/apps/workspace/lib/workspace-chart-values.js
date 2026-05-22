/**
 * Pure chart value projection from tabular rows.
 * Rows are source data; values are render data — no fetch, no secrets, no schema mutation.
 */

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rowMatchesFilter(row, clause) {
  const fieldId = String(clause?.fieldId || "").trim();
  const operator = String(clause?.operator || "eq").trim();
  const expected = clause?.value;
  const raw = row && typeof row === "object" ? row[fieldId] : undefined;
  const value = raw == null ? "" : String(raw);
  switch (operator) {
    case "eq":
      return value === String(expected ?? "");
    case "ne":
      return value !== String(expected ?? "");
    case "contains":
      return value.toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "gt":
      return Number(value) > Number(expected);
    case "lt":
      return Number(value) < Number(expected);
    case "isEmpty":
      return value === "";
    case "isNotEmpty":
      return value !== "";
    default:
      return true;
  }
}

function applyChartFilters(rows, filter) {
  if (!Array.isArray(rows) || !rows.length) return [];
  if (!filter || !isPlainObject(filter)) return rows;
  const clauses = Array.isArray(filter.clauses) ? filter.clauses : [];
  if (!clauses.length) return rows;
  const op = String(filter.op || "and").trim().toLowerCase() === "or" ? "or" : "and";
  return rows.filter((row) => {
    const results = clauses.map((clause) => rowMatchesFilter(row, clause));
    return op === "or" ? results.some(Boolean) : results.every(Boolean);
  });
}

function coerceFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readFieldValue(row, field) {
  if (!row || typeof row !== "object" || !field) return undefined;
  return row[field];
}

function aggregateValues(numbers, aggregation) {
  const agg = String(aggregation || "sum").trim().toLowerCase();
  if (!numbers.length) return null;
  switch (agg) {
    case "count":
      return numbers.length;
    case "avg": {
      const sum = numbers.reduce((acc, value) => acc + value, 0);
      return sum / numbers.length;
    }
    case "min":
      return Math.min(...numbers);
    case "max":
      return Math.max(...numbers);
    case "sum":
    default:
      return numbers.reduce((acc, value) => acc + value, 0);
  }
}

function compareGroupKeys(a, b, direction) {
  const dir = String(direction || "position").trim().toLowerCase();
  if (dir === "desc") return String(b).localeCompare(String(a), undefined, { numeric: true });
  if (dir === "asc") return String(a).localeCompare(String(b), undefined, { numeric: true });
  return 0;
}

function clampValue(value, minRaw, maxRaw) {
  let next = value;
  const min = coerceFiniteNumber(minRaw);
  const max = coerceFiniteNumber(maxRaw);
  if (min != null) next = Math.max(min, next);
  if (max != null) next = Math.min(max, next);
  return next;
}

/**
 * @param {{
 *   rows?: Record<string, unknown>[],
 *   xAxis?: { field?: string, sort?: string, omitZero?: boolean },
 *   yAxis?: { field?: string, groupBy?: string, aggregation?: string, min?: unknown, max?: unknown },
 *   filter?: { op?: string, clauses?: unknown[] },
 *   chartType?: string
 * }} input
 * @returns {{ values: number[], rowCount: number, usedRowCount: number, warnings: string[] }}
 */
function computeChartValuesFromRows(input = {}) {
  const warnings = [];
  const rows = Array.isArray(input.rows) ? input.rows.filter((row) => row && typeof row === "object" && !Array.isArray(row)) : [];
  const rowCount = rows.length;
  const xAxis = isPlainObject(input.xAxis) ? input.xAxis : {};
  const yAxis = isPlainObject(input.yAxis) ? input.yAxis : {};
  const xField = String(xAxis.field || "").trim();
  const yField = String(yAxis.field || "").trim();
  const groupBy = String(yAxis.groupBy || "").trim();
  const aggregation = String(yAxis.aggregation || "sum").trim().toLowerCase();
  const needsNumericY = aggregation !== "count";

  if (!rowCount) {
    warnings.push("No rows available.");
    return { values: [], rowCount: 0, usedRowCount: 0, warnings };
  }

  if (!xField || !yField) {
    warnings.push("Choose X and Y fields.");
    return { values: [], rowCount, usedRowCount: 0, warnings };
  }

  const filtered = applyChartFilters(rows, input.filter);
  const usedRowCount = filtered.length;
  if (!usedRowCount) {
    warnings.push("No rows available.");
    return { values: [], rowCount, usedRowCount: 0, warnings };
  }

  const buckets = new Map();

  for (const row of filtered) {
    const bucketKey = groupBy
      ? `${String(readFieldValue(row, groupBy) ?? "")}\0${String(readFieldValue(row, xField) ?? "")}`
      : String(readFieldValue(row, xField) ?? "");
    const label = String(readFieldValue(row, xField) ?? "");
    const existing = buckets.get(bucketKey) || { label, numbers: [], count: 0 };
    existing.count += 1;
    if (needsNumericY) {
      const numeric = coerceFiniteNumber(readFieldValue(row, yField));
      if (numeric != null) existing.numbers.push(numeric);
    }
    buckets.set(bucketKey, existing);
  }

  const groups = Array.from(buckets.values());
  if (needsNumericY && !groups.some((group) => group.numbers.length)) {
    warnings.push("No numeric values found.");
    return { values: [], rowCount, usedRowCount, warnings };
  }

  let projected = groups.map((group) => {
    const raw = needsNumericY
      ? aggregateValues(group.numbers, aggregation)
      : aggregateValues(Array.from({ length: group.count }, () => 1), "count");
    const value = raw == null || !Number.isFinite(raw) ? null : clampValue(raw, yAxis.min, yAxis.max);
    return { label: group.label, value };
  }).filter((entry) => entry.value != null && Number.isFinite(entry.value));

  if (xAxis.omitZero) {
    projected = projected.filter((entry) => entry.value !== 0);
  }

  const sortDir = String(xAxis.sort || "position").trim().toLowerCase();
  if (sortDir === "asc" || sortDir === "desc") {
    projected.sort((a, b) => compareGroupKeys(a.label, b.label, sortDir));
  }

  const values = projected
    .map((entry) => entry.value)
    .filter((value) => Number.isFinite(value));

  return {
    values,
    rowCount,
    usedRowCount,
    warnings
  };
}

export {
  applyChartFilters,
  coerceFiniteNumber,
  computeChartValuesFromRows
};
